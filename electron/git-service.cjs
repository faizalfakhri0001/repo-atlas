const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const {
  GitServiceError,
  runGit,
  humanizeGitError,
  assertCommitHash,
  assertRefName,
  assertRelativePath,
  resolveRepositoryRelativePath,
  resolveRepositoryFilePath,
  resolveCommit,
  resolveRepository,
} = require("./git/core.cjs");
const { listRepositoryFiles, parseRepositoryFileList, readRepositoryFile } = require("./git/files.cjs");
const { listFileHistory } = require("./git/history.cjs");
const { readFileAtRevision } = require("./git/revisions.cjs");
const { fileBlame } = require("./git/blame.cjs");
const { blameCache } = require("./git/blame.cjs");
const { assertSafeWriteEnabled } = require("./operation-policy.cjs");
const { searchRepository } = require("./git/search.cjs");
const { getAnalyticsIndex, invalidateAnalyticsCache, serializeAnalyticsIndex } = require("./git/analytics/index.cjs");
const { buildHotspotReport } = require("./git/analytics/hotspots.cjs");
const { buildOwnershipReport } = require("./git/analytics/ownership.cjs");
const { buildHealthReport, parseTrackedFileRows } = require("./git/analytics/health.cjs");
const { buildActivityReport } = require("./git/analytics/activity.cjs");
const { parseBranchRows, resolveDefaultBranch, branchIntelligence } = require("./git/analytics/branches.cjs");
const { buildWorkspacePatch, parseWorkspacePatch } = require("./git/workspace-operations.cjs");
const { getCommitReachability, listReflog } = require("./git/reflog.cjs");

const DEFAULT_COMMIT_LIMIT = 1000;
const MAX_COMMIT_LIMIT = 5000;
const MAX_COMMIT_RANGE_LIMIT = 500;
const MAX_CHERRY_PICK_COMMITS = 50;
const MAX_CONFLICT_PREDICTIONS = 25;
const MAX_DIFF_BYTES = 1_200_000;
const COMMIT_FORMAT = "--pretty=format:%H%x1f%P%x1f%D%x1f%an%x1f%ae%x1f%ad%x1f%s%x1e";
const PARTIAL_REFRESH_PARTS = new Set(["status", "refs", "head", "state", "worktrees"]);
const MAX_WORKSPACE_OPERATION_PATHS = 200;

function parseNullFields(line, expected) {
  const fields = line.split("\0");
  while (fields.length < expected) fields.push("");
  return fields;
}

function parseUpstreamTrack(track) {
  const result = { ahead: 0, behind: 0, gone: false };
  if (!track) return result;
  if (/\bgone\b/.test(track)) result.gone = true;
  const ahead = track.match(/ahead (\d+)/);
  const behind = track.match(/behind (\d+)/);
  if (ahead) result.ahead = Number(ahead[1]);
  if (behind) result.behind = Number(behind[1]);
  return result;
}

function parseBranches(raw, currentBranch) {
  return parseBranchRows(raw, currentBranch);
}

function parseCommits(raw) {
  if (!raw.trim()) return [];
  return raw
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, parentsRaw, refsRaw, author, email, date, ...subjectParts] = record.split("\x1f");
      return {
        hash,
        shortHash: hash.slice(0, 8),
        parents: parentsRaw ? parentsRaw.split(" ").filter(Boolean) : [],
        refs: refsRaw
          ? refsRaw
              .split(", ")
              .map((ref) => ref.trim())
              .filter(Boolean)
          : [],
        author,
        email,
        date,
        subject: subjectParts.join("\x1f"),
      };
    });
}

function parseWorktrees(raw) {
  if (!raw.trim()) return [];
  return raw
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const result = {
        path: "",
        head: "",
        shortHead: "",
        branch: "",
        bare: false,
        detached: false,
        locked: false,
        lockReason: "",
        prunable: false,
        pruneReason: "",
        reason: "",
      };

      for (const line of block.split("\n")) {
        const [key, ...rest] = line.split(" ");
        const value = rest.join(" ");
        if (key === "worktree") result.path = value;
        if (key === "HEAD") {
          result.head = value;
          result.shortHead = value.slice(0, 8);
        }
        if (key === "branch") result.branch = value.replace(/^refs\/heads\//, "");
        if (key === "bare") result.bare = true;
        if (key === "detached") result.detached = true;
        if (key === "locked") {
          result.locked = true;
          result.lockReason = value;
          result.reason = value;
        }
        if (key === "prunable") {
          result.prunable = true;
          result.pruneReason = value;
          result.reason = result.lockReason || value;
        }
      }

      return result;
    });
}

async function decorateWorktrees(worktrees, mainPath = "") {
  const fallbackMainPath = mainPath || worktrees[0]?.path || "";
  const normalizedMainPath = fallbackMainPath ? path.resolve(fallbackMainPath) : "";
  return Promise.all(
    worktrees.map(async (worktree, index) => {
      const normalizedPath = path.resolve(worktree.path);
      let exists = false;
      try {
        const stats = await fs.stat(normalizedPath);
        exists = stats.isDirectory();
      } catch {
        exists = false;
      }
      return {
        ...worktree,
        path: normalizedPath,
        main: normalizedMainPath ? normalizedPath === normalizedMainPath : index === 0,
        exists,
      };
    }),
  );
}

function parseSubmoduleConfig(pathRaw, urlRaw) {
  const byName = new Map();
  for (const line of pathRaw.split("\n").filter(Boolean)) {
    const match = line.match(/^submodule\.(.+)\.path\s+(.+)$/);
    if (!match) continue;
    byName.set(match[1], { name: match[1], path: match[2], url: "" });
  }
  for (const line of urlRaw.split("\n").filter(Boolean)) {
    const match = line.match(/^submodule\.(.+)\.url\s+(.+)$/);
    if (!match) continue;
    const current = byName.get(match[1]) ?? { name: match[1], path: "", url: "" };
    current.url = match[2];
    byName.set(match[1], current);
  }
  return [...byName.values()];
}

function parseSubmoduleStatus(raw, configItems) {
  const byPath = new Map(configItems.map((item) => [item.path, item]));
  const statusItems = raw
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const stateChar = line[0];
      const body = line.slice(1).trim();
      const match = body.match(/^([0-9a-f]{40})\s+([^\s]+)(?:\s+\((.*)\))?$/i);
      const hash = match?.[1] ?? "";
      const submodulePath = match?.[2] ?? body;
      const description = match?.[3] ?? "";
      const config = byPath.get(submodulePath) ?? {};
      const state =
        stateChar === "-"
          ? "not-initialized"
          : stateChar === "+"
            ? "modified"
            : stateChar === "U"
              ? "conflict"
              : "clean";
      return {
        name: config.name ?? submodulePath,
        path: submodulePath,
        url: config.url ?? "",
        hash,
        shortHash: hash.slice(0, 8),
        description,
        state,
      };
    });

  const seen = new Set(statusItems.map((item) => item.path));
  for (const config of configItems) {
    if (!seen.has(config.path)) {
      statusItems.push({
        ...config,
        hash: "",
        shortHash: "",
        description: "",
        state: "unknown",
      });
    }
  }
  return statusItems;
}

function isMeaningfulStatusCode(code) {
  return Boolean(code && code !== "." && code !== " " && code !== "?" && code !== "!");
}

function decorateStatusFile({ kind, index, worktree, path: filePath }) {
  const untracked = kind === "untracked" || index === "?" || worktree === "?";
  const conflicted = kind === "conflict" || index === "U" || worktree === "U";
  return {
    kind,
    index,
    worktree,
    path: filePath,
    indexStatus: index === "." || index === " " || index === "?" || index === "!" ? null : index,
    worktreeStatus: worktree === "." || worktree === " " || worktree === "!" ? null : worktree,
    staged: !untracked && !conflicted && isMeaningfulStatusCode(index),
    unstaged: !conflicted && (untracked || isMeaningfulStatusCode(worktree)),
    untracked,
    conflicted,
  };
}

function parseStatus(raw) {
  const result = {
    branch: "",
    oid: "",
    upstream: "",
    ahead: 0,
    behind: 0,
    files: [],
  };

  for (const line of raw.split("\n")) {
    if (!line) continue;
    if (line.startsWith("# branch.head ")) result.branch = line.slice(14).trim();
    else if (line.startsWith("# branch.oid ")) result.oid = line.slice(13).trim();
    else if (line.startsWith("# branch.upstream ")) result.upstream = line.slice(18).trim();
    else if (line.startsWith("# branch.ab ")) {
      const match = line.match(/\+(\d+)\s+-(\d+)/);
      result.ahead = Number(match?.[1] ?? 0);
      result.behind = Number(match?.[2] ?? 0);
    } else if (line.startsWith("? ")) {
      result.files.push(decorateStatusFile({ kind: "untracked", index: "?", worktree: "?", path: line.slice(2) }));
    } else if (line.startsWith("! ")) {
      result.files.push(decorateStatusFile({ kind: "ignored", index: "!", worktree: "!", path: line.slice(2) }));
    } else if (/^[12u] /.test(line)) {
      let xy = "..";
      let filePath = "";
      if (line.startsWith("1 ")) {
        const match = line.match(/^1 (\S+) \S+ \S+ \S+ \S+ \S+ \S+ (.+)$/);
        xy = match?.[1] ?? "..";
        filePath = match?.[2] ?? "";
      } else if (line.startsWith("2 ")) {
        const match = line.match(/^2 (\S+) \S+ \S+ \S+ \S+ \S+ \S+ \S+ (.+)$/);
        xy = match?.[1] ?? "..";
        filePath = (match?.[2] ?? "").split("\t")[0];
      } else {
        const match = line.match(/^u (\S+) \S+ \S+ \S+ \S+ \S+ \S+ \S+ \S+ (.+)$/);
        xy = match?.[1] ?? "UU";
        filePath = match?.[2] ?? "";
      }
      result.files.push(decorateStatusFile({
        kind: line[0] === "u" ? "conflict" : line[0] === "2" ? "renamed" : "changed",
        index: xy[0],
        worktree: xy[1],
        path: filePath,
      }));
    }
  }

  if (result.branch === "(detached)") result.branch = "Detached HEAD";
  return result;
}

function normalizeWorkspacePaths(paths) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > MAX_WORKSPACE_OPERATION_PATHS) {
    throw new GitServiceError(`A workspace operation accepts between 1 and ${MAX_WORKSPACE_OPERATION_PATHS} paths.`, "INVALID_ARGUMENT");
  }
  const normalized = [...new Set(paths.map(assertRelativePath))];
  if (normalized.length === 0) {
    throw new GitServiceError("At least one repository-relative path is required.", "INVALID_ARGUMENT");
  }
  return normalized;
}

async function readWorkspaceStatusForRepository(repository) {
  const result = await runGit(repository.rootPath, ["status", "--porcelain=v2", "--branch", "--untracked-files=normal"]);
  return parseStatus(result.stdout);
}

function workspaceStatusFingerprint(status) {
  return JSON.stringify({
    branch: status.branch,
    oid: status.oid,
    upstream: status.upstream,
    ahead: status.ahead,
    behind: status.behind,
    files: status.files,
  });
}

function buildWorkspaceOperationRepository(repository, status) {
  return {
    name: repository.name,
    rootPath: repository.rootPath,
    currentBranch: status.branch,
    head: status.oid,
    shortHead: status.oid?.slice(0, 8) ?? "",
    upstream: status.upstream,
    ahead: status.ahead,
    behind: status.behind,
    dirty: status.files.some((file) => file.kind !== "ignored"),
  };
}

async function validateWorkspacePaths(repository, paths) {
  const normalized = normalizeWorkspacePaths(paths);
  for (const filePath of normalized) await resolveRepositoryRelativePath(repository.rootPath, filePath);
  return normalized;
}

async function stageFiles(repositoryPath, paths, { operationMode = "read-only" } = {}) {
  assertSafeWriteEnabled(operationMode);
  const repository = await resolveRepository(repositoryPath);
  const filePaths = await validateWorkspacePaths(repository, paths);
  const before = await readWorkspaceStatusForRepository(repository);
  await runGit(repository.rootPath, ["--literal-pathspecs", "add", "--", ...filePaths]);
  const status = await readWorkspaceStatusForRepository(repository);
  return {
    changed: workspaceStatusFingerprint(before) !== workspaceStatusFingerprint(status),
    paths: filePaths,
    status,
    repository: buildWorkspaceOperationRepository(repository, status),
    operation: "stage",
  };
}

async function unstageFiles(repositoryPath, paths, { operationMode = "read-only" } = {}) {
  assertSafeWriteEnabled(operationMode);
  const repository = await resolveRepository(repositoryPath);
  const head = await runGit(repository.rootPath, ["rev-parse", "--verify", "--quiet", "HEAD"], { allowFailure: true });
  if (head.failed || !head.stdout.trim()) {
    throw new GitServiceError("Unstage is not supported before the repository has its first commit.", "UNSUPPORTED_OPERATION");
  }
  const filePaths = await validateWorkspacePaths(repository, paths);
  const before = await readWorkspaceStatusForRepository(repository);
  const result = await runGit(repository.rootPath, ["--literal-pathspecs", "restore", "--staged", "--", ...filePaths], { allowFailure: true });
  if (result.failed) {
    if (/not a git command|unknown option|usage:.*restore/i.test(result.stderr)) {
      throw new GitServiceError("This Git version does not support unstaging with git restore.", "UNSUPPORTED_GIT_VERSION", result.stderr);
    }
    throw new GitServiceError(humanizeGitError(result.stderr), "GIT_COMMAND_FAILED", result.stderr);
  }
  const status = await readWorkspaceStatusForRepository(repository);
  return {
    changed: workspaceStatusFingerprint(before) !== workspaceStatusFingerprint(status),
    paths: filePaths,
    status,
    repository: buildWorkspaceOperationRepository(repository, status),
    operation: "unstage",
  };
}

function normalizeHunkRequest(request, source) {
  if (!request || typeof request !== "object") {
    throw new GitServiceError("A hunk request is required.", "INVALID_ARGUMENT");
  }
  if (Object.prototype.hasOwnProperty.call(request, "patch")) {
    throw new GitServiceError("Generated patch input is not accepted from the renderer.", "INVALID_ARGUMENT");
  }
  const filePath = assertRelativePath(request.path);
  if (filePath.includes("\n") || filePath.includes("\r")) {
    throw new GitServiceError("Hunk paths cannot contain line breaks.", "INVALID_PATH");
  }
  if (typeof request.hunkId !== "string" || !/^[0-9a-f]{64}$/i.test(request.hunkId)) {
    throw new GitServiceError("A valid hunk ID is required.", "INVALID_ARGUMENT");
  }
  if (request.source !== undefined && request.source !== source) {
    throw new GitServiceError("The hunk source does not match the requested operation.", "INVALID_ARGUMENT");
  }
  return { filePath, hunkId: request.hunkId.toLowerCase() };
}

async function readCurrentWorkspacePatch(repository, filePath, staged) {
  const args = ["--literal-pathspecs", "diff", "--no-color", "--no-ext-diff", "--unified=3"];
  if (staged) args.push("--cached");
  args.push("--", filePath);
  const result = await runGit(repository.rootPath, args, { allowFailure: true });
  if (result.failed && !result.stdout) {
    throw new GitServiceError(humanizeGitError(result.stderr), "GIT_COMMAND_FAILED", result.stderr);
  }
  return parseWorkspacePatch(result.stdout ?? "", filePath, GitServiceError);
}

async function applyWorkspaceHunk(repositoryPath, request, { operationMode = "read-only" } = {}, operation, source) {
  assertSafeWriteEnabled(operationMode);
  const { filePath, hunkId } = normalizeHunkRequest(request, source);
  const repository = await resolveRepository(repositoryPath);
  await resolveRepositoryRelativePath(repository.rootPath, filePath);

  if (operation === "unstage") {
    const head = await runGit(repository.rootPath, ["rev-parse", "--verify", "--quiet", "HEAD"], { allowFailure: true });
    if (head.failed || !head.stdout.trim()) {
      throw new GitServiceError("Unstage is not supported before the repository has its first commit.", "UNSUPPORTED_OPERATION");
    }
  }

  const current = await readCurrentWorkspacePatch(repository, filePath, source === "staged");
  const patch = buildWorkspacePatch(current, hunkId);
  if (!patch) {
    throw new GitServiceError("The hunk is stale. Refresh the diff before applying it.", "STALE_DIFF");
  }

  const before = await readWorkspaceStatusForRepository(repository);
  const args = ["apply", "--cached", ...(operation === "unstage" ? ["--reverse"] : []), "--recount", "-"];
  const result = await runGitInput(repository.rootPath, args, patch);
  if (result.failed) {
    if (/does not apply|patch failed|corrupt patch|cannot apply/i.test(result.stderr)) {
      throw new GitServiceError("The hunk is stale. Refresh the diff before applying it.", "STALE_DIFF", result.stderr);
    }
    throw new GitServiceError(humanizeGitError(result.stderr), "GIT_COMMAND_FAILED", result.stderr);
  }

  const status = await readWorkspaceStatusForRepository(repository);
  return {
    changed: workspaceStatusFingerprint(before) !== workspaceStatusFingerprint(status),
    paths: [filePath],
    status,
    repository: buildWorkspaceOperationRepository(repository, status),
    operation,
    hunkId,
  };
}

function stageHunk(repositoryPath, request, options = {}) {
  return applyWorkspaceHunk(repositoryPath, request, options, "stage", "unstaged");
}

function unstageHunk(repositoryPath, request, options = {}) {
  return applyWorkspaceHunk(repositoryPath, request, options, "unstage", "staged");
}

function parseRemotes(raw) {
  const remotes = new Map();
  for (const line of raw.split("\n").filter(Boolean)) {
    const match = line.match(/^(\S+)\s+(.+)\s+\((fetch|push)\)$/);
    if (!match) continue;
    const [, name, url, type] = match;
    const current = remotes.get(name) ?? { name, fetchUrl: "", pushUrl: "" };
    if (type === "fetch") current.fetchUrl = url;
    if (type === "push") current.pushUrl = url;
    remotes.set(name, current);
  }
  return [...remotes.values()];
}

function parseTags(raw) {
  if (!raw.trim()) return [];
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, hash, date, subject] = parseNullFields(line, 4);
      return { name, hash, shortHash: hash.slice(0, 8), date, subject };
    });
}

function parseStashes(raw) {
  if (!raw.trim()) return [];
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [ref, hash, date, subject] = parseNullFields(line, 4);
      return { ref, hash, shortHash: hash.slice(0, 8), date, subject };
    });
}

function parseContributors(raw) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+?)(?:\s+<([^>]+)>)?$/);
      return {
        commits: Number(match?.[1] ?? 0),
        name: match?.[2] ?? line,
        email: match?.[3] ?? "",
      };
    })
    .slice(0, 20);
}

function parseCountObjects(raw) {
  const result = {};
  for (const line of raw.split("\n").filter(Boolean)) {
    const [key, value] = line.split(": ");
    result[key] = Number.isNaN(Number(value)) ? value : Number(value);
  }
  return result;
}

async function safe(task, fallback) {
  try {
    return await task();
  } catch {
    return fallback;
  }
}

function parseNumstatZ(raw) {
  const tokens = raw.split("\0");
  const items = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    const match = token.match(/^(\d+|-)\t(\d+|-)\t([\s\S]*)$/);
    if (!match) continue;
    const additions = match[1] === "-" ? null : Number(match[1]);
    const deletions = match[2] === "-" ? null : Number(match[2]);
    let oldPath = "";
    let filePath = match[3];
    if (filePath === "") {
      oldPath = tokens[i + 1] ?? "";
      filePath = tokens[i + 2] ?? "";
      i += 2;
    }
    items.push({ path: filePath, oldPath, additions, deletions, binary: additions === null });
  }
  return items;
}

function parseNameStatusZ(raw) {
  const tokens = raw.split("\0");
  const items = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    const status = token[0];
    if (!/[A-Z]/.test(status)) continue;
    if (status === "R" || status === "C") {
      items.push({
        status,
        score: Number(token.slice(1)) || null,
        oldPath: tokens[i + 1] ?? "",
        path: tokens[i + 2] ?? "",
      });
      i += 2;
    } else {
      items.push({ status, score: null, oldPath: "", path: tokens[i + 1] ?? "" });
      i += 1;
    }
  }
  return items;
}

function mergeChangedFiles(nameStatus, numstat) {
  const statsByPath = new Map(numstat.map((item) => [item.path, item]));
  const files = nameStatus.map((entry) => {
    const stats = statsByPath.get(entry.path) ?? {};
    return {
      path: entry.path,
      oldPath: entry.oldPath,
      status: entry.status,
      score: entry.score,
      additions: stats.additions ?? 0,
      deletions: stats.deletions ?? 0,
      binary: Boolean(stats.binary),
    };
  });
  const additions = files.reduce((sum, file) => sum + (file.additions || 0), 0);
  const deletions = files.reduce((sum, file) => sum + (file.deletions || 0), 0);
  return { files, additions, deletions };
}

async function listChangedFiles(cwd, fromHash, toHash) {
  const numstatArgs = fromHash
    ? ["diff", "-M", "-z", "--numstat", fromHash, toHash, "--"]
    : ["diff-tree", "--root", "--no-commit-id", "-r", "-M", "-z", "--numstat", toHash, "--"];
  const nameStatusArgs = fromHash
    ? ["diff", "-M", "-z", "--name-status", fromHash, toHash, "--"]
    : ["diff-tree", "--root", "--no-commit-id", "-r", "-M", "-z", "--name-status", toHash, "--"];

  const [numstatResult, nameStatusResult] = await Promise.all([
    runGit(cwd, numstatArgs),
    runGit(cwd, nameStatusArgs),
  ]);

  return mergeChangedFiles(parseNameStatusZ(nameStatusResult.stdout), parseNumstatZ(numstatResult.stdout));
}

async function getRepositoryState(gitDir) {
  const exists = (relativePath) =>
    fs.access(path.join(gitDir, relativePath)).then(
      () => true,
      () => false,
    );

  const [cherryPickHead, sequencerTodo, mergeHead, revertHead, rebaseMerge, rebaseApply, bisectLog] =
    await Promise.all([
      exists("CHERRY_PICK_HEAD"),
      exists(path.join("sequencer", "todo")),
      exists("MERGE_HEAD"),
      exists("REVERT_HEAD"),
      exists("rebase-merge"),
      exists("rebase-apply"),
      exists("BISECT_LOG"),
    ]);

  const cherryPick = cherryPickHead || sequencerTodo;
  const rebase = rebaseMerge || rebaseApply;
  const current = cherryPick
    ? "cherry-pick"
    : mergeHead
      ? "merge"
      : rebase
        ? "rebase"
        : revertHead
          ? "revert"
          : bisectLog
            ? "bisect"
            : null;

  return {
    cherryPick,
    merge: mergeHead,
    rebase,
    revert: revertHead,
    bisect: bisectLog,
    current,
    inProgress: current !== null,
  };
}

async function listCommits(repositoryPath, options = {}) {
  const repository = await resolveRepository(repositoryPath);
  const cwd = repository.rootPath;
  const limit = Math.min(Math.max(Number(options.limit) || DEFAULT_COMMIT_LIMIT, 1), MAX_COMMIT_LIMIT);
  const skip = Math.max(Number(options.skip) || 0, 0);
  const order = options.order === "date" ? "--date-order" : "--topo-order";

  const refs = Array.isArray(options.refs) && options.refs.length > 0 ? options.refs.slice(0, 200).map(assertRefName) : null;
  const refArgs = refs ?? ["--all"];

  const [logResult, countResult] = await Promise.all([
    runGit(cwd, [
      "log",
      ...refArgs,
      order,
      "--date=iso-strict",
      "-n",
      String(limit),
      `--skip=${skip}`,
      COMMIT_FORMAT,
      "--",
    ]),
    runGit(cwd, ["rev-list", "--count", ...refArgs, "--"], { allowFailure: true }),
  ]);

  return {
    commits: parseCommits(logResult.stdout),
    total: countResult.failed ? null : Number(countResult.stdout) || 0,
    limit,
    skip,
  };
}

function normalizeCommitRangeDate(value, field) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 64 || value.includes("\0") || value.includes("\n") || value.includes("\r")) {
    throw new GitServiceError(`${field} is invalid.`, "INVALID_ARGUMENT");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new GitServiceError(`${field} is invalid.`, "INVALID_ARGUMENT");
  return value;
}

async function listCommitsRange(repositoryPath, options = {}) {
  const repository = await resolveRepository(repositoryPath);
  const from = normalizeCommitRangeDate(options.from, "from");
  const to = normalizeCommitRangeDate(options.to, "to");
  if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
    throw new GitServiceError("The commit range is reversed.", "INVALID_ARGUMENT");
  }
  const limit = Math.min(Math.max(Number(options.limit) || 200, 1), MAX_COMMIT_RANGE_LIMIT);
  const args = ["log", "--all", "--date=iso-strict"];
  if (from) args.push(`--since=${from}`);
  if (to) args.push(`--until=${to}`);
  args.push("-n", String(limit), COMMIT_FORMAT, "--");
  const result = await runGit(repository.rootPath, args);
  const commits = parseCommits(result.stdout);
  return { commits, from, to, limit, truncated: commits.length >= limit };
}

async function getCommitDetails(repositoryPath, hashInput) {
  const hash = assertCommitHash(hashInput);
  const repository = await resolveRepository(repositoryPath);
  const cwd = repository.rootPath;

  const metaResult = await runGit(cwd, [
    "show",
    "-s",
    "--date=iso-strict",
    "--format=%H%x1f%P%x1f%D%x1f%an%x1f%ae%x1f%aI%x1f%cn%x1f%ce%x1f%cI%x1f%G?%x1f%B",
    hash,
    "--",
  ]);

  const [fullHash, parentsRaw, refsRaw, authorName, authorEmail, authorDate, committerName, committerEmail, committerDate, signature, ...bodyParts] =
    metaResult.stdout.split("\x1f");
  const parents = parentsRaw ? parentsRaw.split(" ").filter(Boolean) : [];
  const body = bodyParts.join("\x1f").replace(/\s+$/, "");
  const [subject, ...restBody] = body.split("\n");

  const { files, additions, deletions } = await listChangedFiles(cwd, parents[0] ?? null, fullHash);

  return {
    hash: fullHash,
    shortHash: fullHash.slice(0, 8),
    parents,
    refs: refsRaw
      ? refsRaw
          .split(", ")
          .map((ref) => ref.trim())
          .filter(Boolean)
      : [],
    author: { name: authorName, email: authorEmail, date: authorDate },
    committer: { name: committerName, email: committerEmail, date: committerDate },
    signature: signature && signature !== "N" ? signature : "",
    subject,
    body: restBody.join("\n").trim(),
    isMerge: parents.length > 1,
    files,
    additions,
    deletions,
  };
}

function truncateDiff(diffText) {
  if (diffText.length <= MAX_DIFF_BYTES) {
    return { diff: diffText, truncated: false };
  }
  const sliced = diffText.slice(0, MAX_DIFF_BYTES);
  const lastNewline = sliced.lastIndexOf("\n");
  return { diff: sliced.slice(0, lastNewline > 0 ? lastNewline : MAX_DIFF_BYTES), truncated: true };
}

function runGitInput(cwd, args, input, { timeout = 30_000, maxOutputBytes = 2 * 1024 * 1024 } = {}) {
  if (Buffer.byteLength(String(input ?? ""), "utf8") > MAX_DIFF_BYTES) {
    throw new GitServiceError("The generated patch is too large to apply safely.", "INVALID_PATCH");
  }

  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      args,
      {
        cwd,
        windowsHide: true,
        shell: false,
        timeout,
        maxBuffer: maxOutputBytes,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GCM_INTERACTIVE: "Never",
          LC_ALL: "C",
        },
      },
      (error, stdout = "", stderr = "") => {
        if (error?.code === "ENOENT") {
          reject(new GitServiceError("Git executable was not found. Install Git and ensure it is available in PATH.", "GIT_NOT_FOUND"));
          return;
        }
        if (error?.killed || error?.signal) {
          reject(new GitServiceError("Git patch operation timed out.", "GIT_TIMEOUT", stderr));
          return;
        }
        if (error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
          reject(new GitServiceError("Git returned too much patch output.", "GIT_OUTPUT_LIMIT"));
          return;
        }
        resolve({
          stdout: String(stdout).trimEnd(),
          stderr: String(stderr).trimEnd(),
          code: typeof error?.code === "number" ? error.code : 0,
          failed: Boolean(error),
        });
      },
    );
    child.stdin.end(String(input ?? ""));
  });
}

async function getFileDiff(repositoryPath, options = {}) {
  const repository = await resolveRepository(repositoryPath);
  const cwd = repository.rootPath;
  const filePath = await resolveRepositoryRelativePath(cwd, options.path);
  const oldPath = options.oldPath ? await resolveRepositoryRelativePath(cwd, options.oldPath) : null;
  const pathspecs = [oldPath, filePath]
    .filter(Boolean)
    .map((absolutePath) => path.relative(cwd, absolutePath).split(path.sep).join("/"));

  let args;
  if (options.type === "workspace") {
    args = options.staged ? ["diff", "--cached", "--", ...pathspecs] : ["diff", "--", ...pathspecs];
  } else if (options.type === "untracked") {
    const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";
    args = ["diff", "--no-index", "--", nullDevice, filePath];
  } else {
    const toHash = assertCommitHash(options.to);
    const fromHash = options.from == null || options.from === "" ? null : assertCommitHash(options.from);
    args = fromHash
      ? ["diff", "-M", "--format=", fromHash, toHash, "--", ...pathspecs]
      : ["diff-tree", "--root", "--no-commit-id", "-r", "-M", "-p", toHash, "--", ...pathspecs];
  }

  const result = await runGit(cwd, ["--literal-pathspecs", ...args], { allowFailure: true });
  if (result.failed && options.type !== "untracked" && !result.stdout) {
    throw new GitServiceError(humanizeGitError(result.stderr), "GIT_COMMAND_FAILED", result.stderr);
  }

  const { diff, truncated } = truncateDiff(result.stdout ?? "");
  const binary = /^Binary files .* differ$/m.test(diff) || /^GIT binary patch$/m.test(diff);
  const workspaceHunks = options.type === "workspace" && !binary
    ? parseWorkspacePatch(diff, path.relative(cwd, filePath).split(path.sep).join("/"), GitServiceError).hunks.map(({ id, header, oldStart, oldCount, newStart, newCount, context, lines }) => ({
        id,
        header,
        oldStart,
        oldCount,
        newStart,
        newCount,
        context,
        lineCount: lines.length,
      }))
    : undefined;
  return {
    diff,
    truncated,
    binary,
    ...(options.type === "workspace" ? { hunks: workspaceHunks ?? [] } : {}),
  };
}

async function analyticsSummary(repositoryPath, options = {}) {
  const index = await getAnalyticsIndex(repositoryPath, options);
  return serializeAnalyticsIndex(index, options);
}

async function hotspotSummary(repositoryPath, options = {}) {
  const index = await getAnalyticsIndex(repositoryPath, options);
  return buildHotspotReport(index, options);
}

async function ownershipSummary(repositoryPath, options = {}) {
  const index = await getAnalyticsIndex(repositoryPath, options);
  return buildOwnershipReport(index, options);
}

async function activitySummary(repositoryPath, options = {}) {
  const safeOptions = { ...options };
  if (safeOptions.pathPrefix) safeOptions.pathPrefix = assertRelativePath(safeOptions.pathPrefix).replace(/\/+$/, "");
  const index = await getAnalyticsIndex(repositoryPath, safeOptions);
  return buildActivityReport(index, safeOptions);
}

async function listTrackedFileSizes(repositoryRoot) {
  const headResult = await runGit(repositoryRoot, ["rev-parse", "--verify", "--quiet", "HEAD"], { allowFailure: true });
  if (headResult.failed || !headResult.stdout.trim()) {
    return { files: [], totalEntries: 0, truncated: false };
  }
  const treeResult = await runGit(repositoryRoot, ["ls-tree", "-r", "-l", "-z", headResult.stdout.trim(), "--"], {
    allowFailure: true,
    timeout: 30_000,
  });
  if (treeResult.failed) {
    return { files: [], totalEntries: 0, truncated: true, error: treeResult.stderr || "Tracked file sizes could not be read." };
  }
  return parseTrackedFileRows(treeResult.stdout);
}

async function repositoryHealth(repositoryPath, options = {}) {
  const repository = await resolveRepository(repositoryPath);
  const analyticsOptions = {
    maxCommits: options.maxCommits,
    maxFilesPerCommit: options.maxFilesPerCommit,
    maxOutputBytes: options.maxOutputBytes,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  };
  const [statusResult, countObjectsResult, branches, analytics, trackedFiles] = await Promise.all([
    runGit(repository.rootPath, ["status", "--porcelain=v2", "--branch", "--untracked-files=normal"]),
    runGit(repository.rootPath, ["count-objects", "-v"], { allowFailure: true }),
    branchIntelligence(repository.rootPath, options),
    getAnalyticsIndex(repository.rootPath, analyticsOptions),
    listTrackedFileSizes(repository.rootPath),
  ]);
  const status = parseStatus(statusResult.stdout);
  const hotspots = buildHotspotReport(analytics, { limit: 100, now: options.now });
  const report = buildHealthReport(
    {
      repository,
      status,
      branches,
      analytics,
      trackedFiles,
      hotspots,
      countObjects: countObjectsResult.failed ? {} : parseCountObjects(countObjectsResult.stdout),
    },
    { now: options.now ?? Date.now(), limit: options.limit },
  );
  return {
    repositoryKey: repository.rootPath,
    head: analytics.head || status.oid || "",
    generatedAt: report.generatedAt,
    repository: {
      name: repository.name,
      rootPath: repository.rootPath,
      head: analytics.head || status.oid || "",
      currentBranch: status.branch,
      defaultBranch: branches.defaultBranch,
    },
    ...report,
  };
}

function parseMergeTreeConflicts(result) {
  if (result.code === 0) {
    return { status: "clean", files: [] };
  }
  if (result.code === 1) {
    const lines = result.stdout.split("\n").map((line) => line.trim());
    const files = [...new Set(lines.slice(1).filter(Boolean))];
    return { status: "conflicts", files };
  }
  if (/unknown option|usage:/i.test(result.stderr)) {
    return { status: "unsupported", files: [] };
  }
  return { status: "unknown", files: [], message: humanizeGitError(result.stderr) };
}

async function compareRefs(repositoryPath, baseInput, headInput) {
  const repository = await resolveRepository(repositoryPath);
  const cwd = repository.rootPath;
  const base = await resolveCommit(cwd, baseInput);
  const head = await resolveCommit(cwd, headInput);

  const mergeBaseResult = await runGit(cwd, ["merge-base", base.hash, head.hash], { allowFailure: true });
  const mergeBase = mergeBaseResult.failed ? null : mergeBaseResult.stdout.trim();

  const [countResult, logResult, mergeTreeResult] = await Promise.all([
    runGit(cwd, ["rev-list", "--left-right", "--count", `${base.hash}...${head.hash}`, "--"], {
      allowFailure: true,
    }),
    runGit(cwd, [
      "log",
      "--date=iso-strict",
      "--topo-order",
      "-n",
      "300",
      COMMIT_FORMAT,
      `${base.hash}..${head.hash}`,
      "--",
    ]),
    runGit(cwd, ["merge-tree", "--write-tree", "--no-messages", "--name-only", base.hash, head.hash], {
      allowFailure: true,
      timeout: 60_000,
    }),
  ]);

  const [behindRaw, aheadRaw] = countResult.failed ? ["0", "0"] : countResult.stdout.split(/\s+/);
  const diffFrom = mergeBase ?? base.hash;
  const { files, additions, deletions } = await listChangedFiles(cwd, diffFrom, head.hash);

  return {
    base,
    head,
    mergeBase,
    unrelatedHistories: mergeBase === null,
    identical: base.hash === head.hash,
    headIsAncestorOfBase: mergeBase === head.hash && base.hash !== head.hash,
    fastForwardPossible: mergeBase === base.hash && base.hash !== head.hash,
    ahead: Number(aheadRaw) || 0,
    behind: Number(behindRaw) || 0,
    commits: parseCommits(logResult.stdout),
    files,
    additions,
    deletions,
    conflicts: parseMergeTreeConflicts(mergeTreeResult),
  };
}

function summarizeWorkingTree(status) {
  const tracked = status.files.filter((file) => file.kind !== "untracked" && file.kind !== "ignored");
  const untracked = status.files.filter((file) => file.kind === "untracked");
  return { clean: tracked.length === 0, trackedChanges: tracked.length, untracked: untracked.length };
}

function assertHashList(hashesInput) {
  if (!Array.isArray(hashesInput) || hashesInput.length === 0) {
    throw new GitServiceError("At least one commit hash is required.", "INVALID_ARGUMENT");
  }
  if (hashesInput.length > MAX_CHERRY_PICK_COMMITS) {
    throw new GitServiceError(
      `Cherry-pick supports at most ${MAX_CHERRY_PICK_COMMITS} commits at a time.`,
      "INVALID_ARGUMENT",
    );
  }
  return [...new Set(hashesInput.map(assertCommitHash))];
}

async function orderCommitsForApply(cwd, hashes) {
  const result = await runGit(cwd, [
    "show",
    "-s",
    "--format=%H%x1f%ct%x1f%s",
    ...hashes,
    "--",
  ]);
  const entries = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, timestamp, ...subjectParts] = line.split("\x1f");
      return { hash, timestamp: Number(timestamp) || 0, subject: subjectParts.join("\x1f") };
    });
  const byPrefix = new Map(entries.map((entry) => [entry.hash, entry]));
  const resolved = hashes.map((hash) => {
    const match = entries.find((entry) => entry.hash.startsWith(hash)) ?? byPrefix.get(hash);
    return match ?? { hash, timestamp: 0, subject: "" };
  });
  resolved.sort((a, b) => a.timestamp - b.timestamp);
  return resolved;
}

async function cherryPickPreview(repositoryPath, hashesInput) {
  const hashes = assertHashList(hashesInput);
  const repository = await resolveRepository(repositoryPath);
  const cwd = repository.rootPath;

  const [statusResult, state] = await Promise.all([
    runGit(cwd, ["status", "--porcelain=v2", "--branch", "--untracked-files=normal"]),
    getRepositoryState(repository.gitDir),
  ]);
  const status = parseStatus(statusResult.stdout);
  const workingTree = summarizeWorkingTree(status);
  const ordered = await orderCommitsForApply(cwd, hashes);

  const commits = [];
  for (let index = 0; index < ordered.length; index++) {
    const entry = ordered[index];
    if (index >= MAX_CONFLICT_PREDICTIONS) {
      commits.push({ ...entry, shortHash: entry.hash.slice(0, 8), prediction: "skipped", conflictFiles: [] });
      continue;
    }
    const parentResult = await runGit(cwd, ["rev-parse", "--verify", "--quiet", `${entry.hash}^1`], {
      allowFailure: true,
    });
    if (parentResult.failed) {
      commits.push({ ...entry, shortHash: entry.hash.slice(0, 8), prediction: "root", conflictFiles: [] });
      continue;
    }
    const mergeTreeResult = await runGit(
      cwd,
      [
        "merge-tree",
        "--write-tree",
        "--no-messages",
        "--name-only",
        `--merge-base=${entry.hash}^1`,
        "HEAD",
        entry.hash,
      ],
      { allowFailure: true, timeout: 60_000 },
    );
    const conflicts = parseMergeTreeConflicts(mergeTreeResult);
    commits.push({
      ...entry,
      shortHash: entry.hash.slice(0, 8),
      prediction: conflicts.status,
      conflictFiles: conflicts.files,
    });
  }

  return {
    targetBranch: status.branch,
    detachedHead: status.branch === "Detached HEAD",
    workingTree,
    state,
    blocked: !workingTree.clean || state.inProgress,
    commits,
  };
}

async function cherryPickExecute(repositoryPath, hashesInput) {
  const hashes = assertHashList(hashesInput);
  const repository = await resolveRepository(repositoryPath);
  const cwd = repository.rootPath;

  const [statusResult, state] = await Promise.all([
    runGit(cwd, ["status", "--porcelain=v2", "--branch", "--untracked-files=normal"]),
    getRepositoryState(repository.gitDir),
  ]);
  const workingTree = summarizeWorkingTree(parseStatus(statusResult.stdout));
  if (state.inProgress) {
    throw new GitServiceError(
      `Another operation (${state.current}) is already in progress. Finish or abort it first.`,
      "OPERATION_IN_PROGRESS",
    );
  }
  if (!workingTree.clean) {
    throw new GitServiceError(
      "The working tree has uncommitted changes. Commit, stash, or discard them before cherry-picking.",
      "DIRTY_WORKING_TREE",
    );
  }

  const ordered = await orderCommitsForApply(cwd, hashes);
  const result = await runGit(
    cwd,
    ["-c", "core.editor=true", "cherry-pick", "--allow-empty-message", ...ordered.map((entry) => entry.hash)],
    { allowFailure: true, timeout: 180_000 },
  );

  return buildSequencerOutcome(repository, result, ordered.length);
}

async function buildSequencerOutcome(repository, result, requestedCount = null) {
  const cwd = repository.rootPath;
  const [statusResult, state] = await Promise.all([
    runGit(cwd, ["status", "--porcelain=v2", "--branch", "--untracked-files=normal"]),
    getRepositoryState(repository.gitDir),
  ]);
  const status = parseStatus(statusResult.stdout);
  const conflictFiles = status.files.filter((file) => file.kind === "conflict").map((file) => file.path);

  if (!result.failed && !state.cherryPick) {
    return { status: "applied", applied: requestedCount, state, conflictFiles: [] };
  }
  if (state.cherryPick) {
    return {
      status: "conflict",
      applied: null,
      state,
      conflictFiles,
      message: humanizeGitError(result.stderr || "Cherry-pick stopped on conflicts."),
    };
  }
  return {
    status: result.failed ? "error" : "applied",
    applied: result.failed ? null : requestedCount,
    state,
    conflictFiles,
    message: result.failed ? humanizeGitError(result.stderr) : "",
  };
}

async function sequencerAction(repositoryPath, actionInput) {
  const allowed = new Set(["continue", "skip", "abort", "quit"]);
  const action = typeof actionInput === "string" ? actionInput.trim() : "";
  if (!allowed.has(action)) {
    throw new GitServiceError("Unsupported sequencer action.", "INVALID_ARGUMENT");
  }

  const repository = await resolveRepository(repositoryPath);
  const state = await getRepositoryState(repository.gitDir);
  if (!state.cherryPick) {
    throw new GitServiceError("No cherry-pick is in progress.", "NO_OPERATION");
  }

  const result = await runGit(
    repository.rootPath,
    ["-c", "core.editor=true", "cherry-pick", `--${action}`],
    { allowFailure: true, timeout: 120_000 },
  );
  return buildSequencerOutcome(repository, result);
}

async function scanRepository(candidatePath) {
  const repository = await resolveRepository(candidatePath);
  const cwd = repository.rootPath;

  const [gitVersionResult, statusResult] = await Promise.all([
    runGit(cwd, ["--version"]),
    runGit(cwd, ["status", "--porcelain=v2", "--branch", "--untracked-files=normal"]),
  ]);

  const status = parseStatus(statusResult.stdout);
  const currentBranch = status.branch;

  const [branches, commits, worktrees, remotes, tags, stashes, contributors, countObjects, submodules] =
    await Promise.all([
      safe(async () => {
        const result = await runGit(cwd, [
          "for-each-ref",
          "--sort=-committerdate",
          "--format=%(refname)%00%(refname:short)%00%(objectname)%00%(upstream:short)%00%(committerdate:iso-strict)%00%(authorname)%00%(subject)%00%(upstream:track)",
          "refs/heads",
          "refs/remotes",
        ]);
        return parseBranches(result.stdout, currentBranch);
      }, []),
      safe(async () => {
        const result = await runGit(cwd, [
          "log",
          "--all",
          "--topo-order",
          "--date=iso-strict",
          "-n",
          String(DEFAULT_COMMIT_LIMIT),
          COMMIT_FORMAT,
        ]);
        return parseCommits(result.stdout);
      }, []),
      safe(async () => {
        const result = await runGit(cwd, ["worktree", "list", "--porcelain"]);
        const mainPath = path.basename(repository.commonGitDir) === ".git" ? path.dirname(repository.commonGitDir) : "";
        return decorateWorktrees(parseWorktrees(result.stdout), mainPath);
      }, []),
      safe(async () => {
        const result = await runGit(cwd, ["remote", "-v"]);
        return parseRemotes(result.stdout);
      }, []),
      safe(async () => {
        const result = await runGit(cwd, [
          "for-each-ref",
          "--sort=-creatordate",
          "--format=%(refname:short)%00%(objectname)%00%(creatordate:iso-strict)%00%(subject)",
          "refs/tags",
        ]);
        return parseTags(result.stdout);
      }, []),
      safe(async () => {
        const result = await runGit(cwd, [
          "stash",
          "list",
          "--date=iso-strict",
          "--format=%gd%00%H%00%ci%00%gs",
        ]);
        return parseStashes(result.stdout);
      }, []),
      safe(async () => {
        const result = await runGit(cwd, ["shortlog", "-sne", "--all"]);
        return parseContributors(result.stdout);
      }, []),
      safe(async () => {
        const result = await runGit(cwd, ["count-objects", "-v"]);
        return parseCountObjects(result.stdout);
      }, {}),
      safe(async () => {
        const [pathResult, urlResult, statusSubmoduleResult] = await Promise.all([
          runGit(cwd, ["config", "-f", ".gitmodules", "--get-regexp", "^submodule\\..*\\.path$"], {
            allowFailure: true,
          }),
          runGit(cwd, ["config", "-f", ".gitmodules", "--get-regexp", "^submodule\\..*\\.url$"], {
            allowFailure: true,
          }),
          runGit(cwd, ["submodule", "status", "--recursive"], { allowFailure: true }),
        ]);
        const config = parseSubmoduleConfig(pathResult.stdout, urlResult.stdout);
        return parseSubmoduleStatus(statusSubmoduleResult.stdout, config);
      }, []),
    ]);

  const [state, totalCommits, originHead] = await Promise.all([
    safe(() => getRepositoryState(repository.gitDir), {
      cherryPick: false,
      merge: false,
      rebase: false,
      revert: false,
      bisect: false,
      current: null,
      inProgress: false,
    }),
    safe(async () => {
      const result = await runGit(cwd, ["rev-list", "--count", "--all"]);
      return Number(result.stdout) || 0;
    }, null),
    safe(async () => {
      const result = await runGit(cwd, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
        allowFailure: true,
      });
      return result.failed ? "" : result.stdout.trim();
    }, ""),
  ]);

  const defaultBranchInfo = resolveDefaultBranch({ branches, currentBranch, originHead });

  return {
    scannedAt: new Date().toISOString(),
    repository: {
      ...repository,
      currentBranch,
      ...defaultBranchInfo,
      head: status.oid,
      shortHead: status.oid?.slice(0, 8) ?? "",
      upstream: status.upstream,
      ahead: status.ahead,
      behind: status.behind,
      gitVersion: gitVersionResult.stdout,
      dirty: status.files.length > 0,
      totalCommits,
    },
    state,
    status,
    branches,
    commits,
    worktrees,
    submodules,
    remotes,
    tags,
    stashes,
    contributors,
    countObjects,
  };
}

async function getWorktreeDetails(repositoryPath, worktreePath) {
  const repository = await resolveRepository(repositoryPath);
  if (typeof worktreePath !== "string" || worktreePath.trim().length === 0 || worktreePath.includes("\0")) {
    throw new GitServiceError("A worktree path is required.", "INVALID_PATH");
  }

  const listedResult = await runGit(repository.rootPath, ["worktree", "list", "--porcelain"]);
  const mainPath = path.basename(repository.commonGitDir) === ".git" ? path.dirname(repository.commonGitDir) : "";
  const worktrees = await decorateWorktrees(parseWorktrees(listedResult.stdout), mainPath);
  const requestedPath = await fs.realpath(path.resolve(worktreePath)).catch(() => path.resolve(worktreePath));
  const worktree = worktrees.find((candidate) => path.resolve(candidate.path) === requestedPath);
  if (!worktree) {
    throw new GitServiceError("The selected path is not a registered Git worktree.", "WORKTREE_NOT_FOUND");
  }
  if (!worktree.exists) {
    throw new GitServiceError("The selected worktree is no longer available on disk.", "WORKTREE_UNAVAILABLE");
  }
  if (worktree.bare) {
    return { worktree, status: null, dirty: false, changes: 0 };
  }

  const statusResult = await runGit(worktree.path, ["status", "--porcelain=v2", "--branch", "--untracked-files=normal"]);
  const status = parseStatus(statusResult.stdout);
  const currentWorktree = {
    ...worktree,
    head: status.oid || worktree.head,
    shortHead: (status.oid || worktree.head).slice(0, 8),
    branch: worktree.branch || (status.branch === "Detached HEAD" ? "" : status.branch),
    detached: worktree.detached || status.branch === "Detached HEAD",
  };
  return {
    worktree: currentWorktree,
    status,
    dirty: status.files.length > 0,
    changes: status.files.length,
  };
}

const WORKTREE_CREATE_MODES = new Set(["existing-branch", "new-branch", "detached"]);

function worktreeCreateOperation(mode, targetPath) {
  return { mode, targetPath };
}

async function inspectWorktreeTarget(targetInput, worktrees) {
  const blockingReasons = [];
  const rawTarget = typeof targetInput === "string" ? targetInput.trim() : "";
  let targetPath = rawTarget;

  if (!rawTarget || rawTarget.includes("\0") || rawTarget.length > 4096) {
    blockingReasons.push("A valid absolute target path is required.");
    return { targetPath, blockingReasons };
  }
  if (!path.isAbsolute(rawTarget)) {
    blockingReasons.push("The worktree target must be an absolute path.");
    return { targetPath: path.resolve(rawTarget), blockingReasons };
  }

  targetPath = path.resolve(rawTarget);
  const parentPath = path.dirname(targetPath);
  try {
    const parentStats = await fs.stat(parentPath);
    if (!parentStats.isDirectory()) blockingReasons.push("The target parent is not a directory.");
  } catch (error) {
    blockingReasons.push(error?.code === "ENOENT" ? "The target parent folder does not exist." : "The target parent could not be inspected.");
  }

  try {
    await fs.lstat(targetPath);
    blockingReasons.push("The target path already exists. Choose a new folder name.");
  } catch (error) {
    if (error?.code !== "ENOENT") blockingReasons.push("The target path could not be inspected.");
  }

  for (const worktree of worktrees) {
    const existingPath = path.resolve(worktree.path);
    if (isPathInside(existingPath, targetPath)) {
      blockingReasons.push("The target path is inside an existing Git worktree.");
      break;
    }
  }

  return { targetPath, blockingReasons };
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function resolveLocalBranch(cwd, branch) {
  const name = assertRefName(branch);
  const ref = `refs/heads/${name}`;
  const result = await runGit(cwd, ["show-ref", "--verify", "--quiet", ref], { allowFailure: true });
  if (result.failed) return null;
  const resolved = await resolveCommit(cwd, ref);
  return { name, ref, hash: resolved.hash };
}

async function readWorktreeEntries(repository) {
  const result = await runGit(repository.rootPath, ["worktree", "list", "--porcelain"]);
  const mainPath = path.basename(repository.commonGitDir) === ".git" ? path.dirname(repository.commonGitDir) : "";
  return decorateWorktrees(parseWorktrees(result.stdout), mainPath);
}

async function previewWorktreeCreate(repositoryPath, options = {}, { operationMode = "read-only" } = {}) {
  const repository = await resolveRepository(repositoryPath);
  const cwd = repository.rootPath;
  const mode = typeof options.mode === "string" ? options.mode.trim() : "";
  const operation = worktreeCreateOperation(mode, typeof options.targetPath === "string" ? options.targetPath.trim() : "");
  const warnings = [];
  const blockingReasons = [];

  if (!WORKTREE_CREATE_MODES.has(mode)) {
    blockingReasons.push("Choose an existing branch, a new branch, or a detached HEAD.");
  }

  const [partialStatus, worktrees] = await Promise.all([
    readPartialStatus(repository),
    readWorktreeEntries(repository),
  ]);
  const target = await inspectWorktreeTarget(operation.targetPath, worktrees);
  operation.targetPath = target.targetPath;
  blockingReasons.push(...target.blockingReasons);

  if (operationMode !== "safe-write") {
    blockingReasons.push("Enable Safe Write before creating a worktree.");
  }
  if (partialStatus.state.inProgress) {
    blockingReasons.push(`Another Git operation (${partialStatus.state.current}) is already in progress.`);
  }
  if (partialStatus.status.files.some((file) => file.conflicted || file.kind === "conflict")) {
    blockingReasons.push("Resolve the current worktree conflicts before creating another worktree.");
  } else if (partialStatus.status.files.some((file) => file.kind !== "ignored")) {
    warnings.push("Uncommitted changes in the current worktree will not be copied to the new worktree.");
  }

  const checkedOutBranches = new Map(
    worktrees
      .filter((worktree) => worktree.branch)
      .map((worktree) => [worktree.branch, worktree.path]),
  );

  if (mode === "existing-branch") {
    try {
      const branch = assertRefName(options.branch);
      operation.branch = branch;
      const localBranch = await resolveLocalBranch(cwd, branch);
      if (!localBranch) {
        blockingReasons.push(`Local branch "${branch}" was not found.`);
      } else {
        operation.resolvedBranch = localBranch.hash;
        const checkedOutPath = checkedOutBranches.get(branch);
        if (checkedOutPath) blockingReasons.push(`Local branch "${branch}" is already checked out at ${checkedOutPath}.`);
      }
    } catch (error) {
      blockingReasons.push(error instanceof GitServiceError ? error.message : "A valid local branch is required.");
    }
  }

  if (mode === "new-branch") {
    try {
      const newBranch = assertRefName(options.newBranch);
      operation.newBranch = newBranch;
      const formatResult = await runGit(cwd, ["check-ref-format", "--branch", newBranch], { allowFailure: true });
      if (formatResult.failed) {
        blockingReasons.push(`"${newBranch}" is not a valid new branch name.`);
      } else {
        const existing = await runGit(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${newBranch}`], { allowFailure: true });
        if (!existing.failed) blockingReasons.push(`Local branch "${newBranch}" already exists.`);
      }

      const requestedStart = typeof options.startPoint === "string" ? options.startPoint.trim() : "";
      const startPoint = requestedStart || partialStatus.status.oid || "";
      operation.startPoint = startPoint;
      if (!startPoint) {
        blockingReasons.push("A start point is required for a new branch.");
      } else {
        try {
          operation.resolvedStartPoint = (await resolveCommit(cwd, startPoint)).hash;
        } catch (error) {
          blockingReasons.push(error instanceof GitServiceError ? error.message : "The start point does not resolve to a commit.");
        }
      }
    } catch (error) {
      blockingReasons.push(error instanceof GitServiceError ? error.message : "A valid new branch name is required.");
    }
  }

  if (mode === "detached") {
    const requestedCommit = typeof options.commit === "string" ? options.commit.trim() : "";
    operation.commit = requestedCommit;
    if (!requestedCommit) {
      blockingReasons.push("A commit or ref is required for a detached worktree.");
    } else {
      try {
        operation.resolvedCommit = (await resolveCommit(cwd, requestedCommit)).hash;
      } catch (error) {
        blockingReasons.push(error instanceof GitServiceError ? error.message : "The selected commit does not resolve to a commit.");
      }
    }
  }

  return {
    allowed: blockingReasons.length === 0,
    operation,
    warnings: [...new Set(warnings)],
    blockingReasons: [...new Set(blockingReasons)],
  };
}

async function createWorktree(repositoryPath, options = {}, { operationMode = "read-only" } = {}) {
  assertSafeWriteEnabled(operationMode);
  const preview = await previewWorktreeCreate(repositoryPath, options, { operationMode });
  if (!preview.allowed) {
    throw new GitServiceError(
      preview.blockingReasons.join(" "),
      "WORKTREE_CREATE_BLOCKED",
      JSON.stringify(preview),
    );
  }

  const { operation } = preview;
  let args;
  if (operation.mode === "existing-branch") {
    args = ["worktree", "add", "--", operation.targetPath, operation.branch];
  } else if (operation.mode === "new-branch") {
    args = ["worktree", "add", "-b", operation.newBranch, "--", operation.targetPath, operation.resolvedStartPoint];
  } else {
    args = ["worktree", "add", "--detach", "--", operation.targetPath, operation.resolvedCommit];
  }

  const repository = await resolveRepository(repositoryPath);
  const result = await runGit(repository.rootPath, args, { allowFailure: true, timeout: 120_000 });
  if (result.failed) {
    throw new GitServiceError(humanizeGitError(result.stderr), "WORKTREE_CREATE_FAILED", result.stderr);
  }

  const worktrees = await readWorktreeEntries(repository);
  const createdPath = await fs.realpath(operation.targetPath).catch(() => path.resolve(operation.targetPath));
  return {
    operation,
    worktree: worktrees.find((worktree) => path.resolve(worktree.path) === createdPath) ?? null,
    worktrees,
  };
}

function buildPartialRepository(repository, status, defaultBranchInfo = {}) {
  return {
    ...repository,
    currentBranch: status.branch,
    ...defaultBranchInfo,
    head: status.oid,
    shortHead: status.oid?.slice(0, 8) ?? "",
    upstream: status.upstream,
    ahead: status.ahead,
    behind: status.behind,
    dirty: status.files.length > 0,
  };
}

function invalidateRepositoryDerivedCaches(repository, parts, status) {
  const invalidated = [];
  if (parts.includes("refs") || parts.includes("head")) {
    invalidateAnalyticsCache(repository.rootPath);
    invalidated.push("analytics");
  }
  if (parts.includes("head") && status?.oid && status.oid !== "(initial)") {
    blameCache.invalidateHead(repository.rootPath, status.oid);
    invalidated.push("blame-head");
  }
  return invalidated;
}

async function readPartialStatus(repository) {
  const [statusResult, state] = await Promise.all([
    runGit(repository.rootPath, ["status", "--porcelain=v2", "--branch", "--untracked-files=normal"]),
    getRepositoryState(repository.gitDir),
  ]);
  const status = parseStatus(statusResult.stdout);
  return { status, state, repository: buildPartialRepository(repository, status) };
}

async function readPartialWorktrees(repository) {
  const result = await runGit(repository.rootPath, ["worktree", "list", "--porcelain"]);
  const mainPath = path.basename(repository.commonGitDir) === ".git" ? path.dirname(repository.commonGitDir) : "";
  return decorateWorktrees(parseWorktrees(result.stdout), mainPath);
}

async function readPartialRefs(repository, currentBranch) {
  const [branches, tags, commits, contributors, totalCommits, originHead] = await Promise.all([
    safe(async () => {
      const result = await runGit(repository.rootPath, [
        "for-each-ref",
        "--sort=-committerdate",
        "--format=%(refname)%00%(refname:short)%00%(objectname)%00%(upstream:short)%00%(committerdate:iso-strict)%00%(authorname)%00%(subject)%00%(upstream:track)",
        "refs/heads",
        "refs/remotes",
      ]);
      return parseBranches(result.stdout, currentBranch);
    }, []),
    safe(async () => {
      const result = await runGit(repository.rootPath, [
        "for-each-ref",
        "--sort=-creatordate",
        "--format=%(refname:short)%00%(objectname)%00%(creatordate:iso-strict)%00%(subject)",
        "refs/tags",
      ]);
      return parseTags(result.stdout);
    }, []),
    safe(async () => {
      const result = await runGit(repository.rootPath, ["log", "--all", "--topo-order", "--date=iso-strict", "-n", String(DEFAULT_COMMIT_LIMIT), COMMIT_FORMAT]);
      return parseCommits(result.stdout);
    }, []),
    safe(async () => {
      const result = await runGit(repository.rootPath, ["shortlog", "-sne", "--all"]);
      return parseContributors(result.stdout);
    }, []),
    safe(async () => {
      const result = await runGit(repository.rootPath, ["rev-list", "--count", "--all"]);
      return Number(result.stdout) || 0;
    }, null),
    safe(async () => {
      const result = await runGit(repository.rootPath, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { allowFailure: true });
      return result.failed ? "" : result.stdout.trim();
    }, ""),
  ]);
  const defaultBranchInfo = resolveDefaultBranch({ branches, currentBranch, originHead });
  return { branches, tags, commits, contributors, totalCommits, defaultBranchInfo };
}

async function refreshRepositoryPartial(repositoryPath, requestedParts = []) {
  const repository = await resolveRepository(repositoryPath);
  const parts = [...new Set(Array.isArray(requestedParts) ? requestedParts : [])];
  if (parts.length === 0 || parts.some((part) => !PARTIAL_REFRESH_PARTS.has(part))) {
    throw new GitServiceError("Refresh parts must use the supported repository sections.", "INVALID_ARGUMENT");
  }

  const needsStatus = parts.some((part) => ["status", "head", "refs", "state"].includes(part));
  const partialStatus = needsStatus ? await readPartialStatus(repository) : null;
  const data = { scannedAt: new Date().toISOString() };
  if (partialStatus && (parts.includes("status") || parts.includes("head") || parts.includes("state"))) {
    if (parts.includes("status") || parts.includes("head")) data.status = partialStatus.status;
    if (parts.includes("state") || parts.includes("head")) data.state = partialStatus.state;
    data.repository = partialStatus.repository;
  }
  if (parts.includes("refs")) {
    const refs = await readPartialRefs(repository, partialStatus?.status.branch ?? "");
    Object.assign(data, {
      branches: refs.branches,
      tags: refs.tags,
      commits: refs.commits,
      contributors: refs.contributors,
      repository: {
        ...(data.repository ?? buildPartialRepository(repository, partialStatus?.status ?? parseStatus(""))),
        ...refs.defaultBranchInfo,
        totalCommits: refs.totalCommits,
      },
    });
  }
  if (parts.includes("worktrees")) {
    data.worktrees = await readPartialWorktrees(repository);
  }
  if (parts.includes("head") && !data.commits) {
    const result = await runGit(repository.rootPath, ["log", "--all", "--topo-order", "--date=iso-strict", "-n", String(DEFAULT_COMMIT_LIMIT), COMMIT_FORMAT]);
    data.commits = parseCommits(result.stdout);
    const count = await runGit(repository.rootPath, ["rev-list", "--count", "--all"], { allowFailure: true });
    data.repository = { ...data.repository, totalCommits: count.failed ? null : Number(count.stdout) || 0 };
  }
  return {
    repositoryPath: repository.rootPath,
    parts,
    data,
    invalidated: invalidateRepositoryDerivedCaches(repository, parts, partialStatus?.status),
  };
}

module.exports = {
  GitServiceError,
  runGit,
  humanizeGitError,
  assertCommitHash,
  assertRefName,
  assertRelativePath,
  resolveRepositoryRelativePath,
  resolveRepositoryFilePath,
  parseBranches,
  parseCommits,
  parseWorktrees,
  decorateWorktrees,
  parseSubmoduleConfig,
  parseSubmoduleStatus,
  parseStatus,
  parseRemotes,
  parseTags,
  parseStashes,
  parseContributors,
  parseCountObjects,
  parseNumstatZ,
  parseNameStatusZ,
  parseMergeTreeConflicts,
  parseUpstreamTrack,
  MAX_WORKSPACE_OPERATION_PATHS,
  normalizeWorkspacePaths,
  resolveRepository,
  parseRepositoryFileList,
  getRepositoryState,
  scanRepository,
  getWorktreeDetails,
  previewWorktreeCreate,
  createWorktree,
  listRepositoryFiles,
  readRepositoryFile,
  listFileHistory,
  readFileAtRevision,
  fileBlame,
  listCommits,
  listCommitsRange,
  listReflog,
  getCommitReachability,
  getCommitDetails,
  getFileDiff,
  analyticsSummary,
  activitySummary,
  hotspotSummary,
  ownershipSummary,
  repositoryHealth,
  listTrackedFileSizes,
  branchIntelligence,
  stageFiles,
  unstageFiles,
  stageHunk,
  unstageHunk,
  PARTIAL_REFRESH_PARTS,
  invalidateRepositoryDerivedCaches,
  refreshRepositoryPartial,
  compareRefs,
  cherryPickPreview,
  cherryPickExecute,
  sequencerAction,
  searchRepository,
};
