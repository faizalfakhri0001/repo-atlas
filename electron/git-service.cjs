const fs = require("node:fs/promises");
const path = require("node:path");
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

const DEFAULT_COMMIT_LIMIT = 1000;
const MAX_COMMIT_LIMIT = 5000;
const MAX_CHERRY_PICK_COMMITS = 50;
const MAX_CONFLICT_PREDICTIONS = 25;
const MAX_DIFF_BYTES = 1_200_000;
const COMMIT_FORMAT = "--pretty=format:%H%x1f%P%x1f%D%x1f%an%x1f%ae%x1f%ad%x1f%s%x1e";

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
  if (!raw.trim()) return [];
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [ref, name, hash, upstream, date, author, subject, track] = parseNullFields(line, 8);
      const remote = ref.startsWith("refs/remotes/");
      return {
        ref,
        name,
        hash,
        shortHash: hash.slice(0, 8),
        upstream,
        ...parseUpstreamTrack(track),
        date,
        author,
        subject,
        remote,
        current: !remote && name === currentBranch,
      };
    });
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
        branch: "",
        bare: false,
        detached: false,
        locked: false,
        prunable: false,
        reason: "",
      };

      for (const line of block.split("\n")) {
        const [key, ...rest] = line.split(" ");
        const value = rest.join(" ");
        if (key === "worktree") result.path = value;
        if (key === "HEAD") result.head = value;
        if (key === "branch") result.branch = value.replace(/^refs\/heads\//, "");
        if (key === "bare") result.bare = true;
        if (key === "detached") result.detached = true;
        if (key === "locked") {
          result.locked = true;
          result.reason = value;
        }
        if (key === "prunable") {
          result.prunable = true;
          result.reason = value;
        }
      }

      return result;
    });
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
      result.files.push({ kind: "untracked", index: "?", worktree: "?", path: line.slice(2) });
    } else if (line.startsWith("! ")) {
      result.files.push({ kind: "ignored", index: "!", worktree: "!", path: line.slice(2) });
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
      result.files.push({
        kind: line[0] === "u" ? "conflict" : line[0] === "2" ? "renamed" : "changed",
        index: xy[0],
        worktree: xy[1],
        path: filePath,
      });
    }
  }

  if (result.branch === "(detached)") result.branch = "Detached HEAD";
  return result;
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
  return {
    diff,
    truncated,
    binary: /^Binary files .* differ$/m.test(diff) || /^GIT binary patch$/m.test(diff),
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
        return parseWorktrees(result.stdout);
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

  const localBranchNames = new Set(branches.filter((branch) => !branch.remote).map((branch) => branch.name));
  const originDefault = originHead.replace(/^origin\//, "");
  const defaultBranch =
    (originDefault && localBranchNames.has(originDefault) && originDefault) ||
    ["main", "master", "develop", "trunk"].find((name) => localBranchNames.has(name)) ||
    currentBranch;

  return {
    scannedAt: new Date().toISOString(),
    repository: {
      ...repository,
      currentBranch,
      defaultBranch,
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
  resolveRepository,
  parseRepositoryFileList,
  getRepositoryState,
  scanRepository,
  listRepositoryFiles,
  readRepositoryFile,
  listCommits,
  getCommitDetails,
  getFileDiff,
  compareRefs,
  cherryPickPreview,
  cherryPickExecute,
  sequencerAction,
};
