const {
  GitServiceError,
  assertCommitHash,
  assertRefName,
  resolveRepository,
  resolveCommit,
  runGit,
} = require("./core.cjs");

const REFLOG_RECORD_SEPARATOR = "\x1e";
const REFLOG_FIELD_SEPARATOR = "\x1f";
const REFLOG_FORMAT = "--format=%H%x1f%gd%x1f%gD%x1f%gn%x1f%ge%x1f%gai%x1f%gs%x1e";
const DEFAULT_REFLOG_LIMIT = 200;
const MAX_REFLOG_LIMIT = 1000;
const MAX_REFLOG_SKIP = 1_000_000;
const REFLOG_ACTIONS = new Set([
  "commit",
  "checkout",
  "reset",
  "rebase",
  "merge",
  "pull",
  "cherry-pick",
  "revert",
  "branch",
  "amend",
  "other",
]);

function parseReflogAction(subject) {
  const rawMessage = typeof subject === "string" ? subject.trim() : "";
  const match = rawMessage.match(/^([a-z-]+)(?:\s+\(([^)]+)\))?(?::\s*(.*)|\s+[^:]+:\s*(.*))$/i);
  if (!match) return { action: "other", detail: rawMessage };

  const baseAction = match[1].toLowerCase();
  const qualifier = match[2]?.trim().toLowerCase() ?? "";
  const action = baseAction === "commit" && qualifier === "amend" ? "amend" : baseAction;
  return {
    action: REFLOG_ACTIONS.has(action) ? action : "other",
    detail: (match[3] ?? match[4] ?? "").trim(),
  };
}

function parseReflogEntries(raw, { refName = "HEAD", offset = 0 } = {}) {
  if (typeof raw !== "string" || !raw.trim()) return [];

  return raw
    .split(REFLOG_RECORD_SEPARATOR)
    .map((record) => record.replace(/\n+$/, ""))
    .filter(Boolean)
    .map((record, index) => {
      const fields = record.split(REFLOG_FIELD_SEPARATOR);
      const hash = fields.shift() ?? "";
      const selector = fields.shift() ?? "";
      fields.shift();
      const actorName = fields.shift() ?? "";
      const actorEmail = fields.shift() ?? "";
      const date = fields.shift() ?? "";
      const rawMessage = fields.join(REFLOG_FIELD_SEPARATOR);
      if (!hash || !selector || !date) return null;
      const classified = parseReflogAction(rawMessage);
      return {
        index: offset + index,
        hash,
        shortHash: hash.slice(0, 8),
        selector,
        refName,
        date,
        actor: {
          name: actorName,
          email: actorEmail,
        },
        rawMessage,
        action: classified.action,
        detail: classified.detail,
        reachable: null,
      };
    })
    .filter(Boolean);
}

function normalizeReflogRef(value) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : "HEAD";
  if (raw === "HEAD") return { ref: "HEAD", refName: "HEAD" };

  const branch = raw.startsWith("refs/heads/") ? raw.slice("refs/heads/".length) : raw;
  if (!branch || branch === "HEAD" || branch.startsWith("refs/") || branch.includes("@{")) {
    throw new GitServiceError("Reflog ref must be HEAD or a local branch.", "INVALID_ARGUMENT");
  }
  const validatedBranch = assertRefName(branch);
  return {
    ref: `refs/heads/${validatedBranch}`,
    refName: `refs/heads/${validatedBranch}`,
  };
}

function normalizeReflogPagination(options = {}) {
  const limit = options.limit === undefined ? DEFAULT_REFLOG_LIMIT : Number(options.limit);
  const skip = options.skip === undefined ? 0 : Number(options.skip);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_REFLOG_LIMIT) {
    throw new GitServiceError(`Reflog limit must be between 1 and ${MAX_REFLOG_LIMIT}.`, "INVALID_ARGUMENT");
  }
  if (!Number.isSafeInteger(skip) || skip < 0 || skip > MAX_REFLOG_SKIP) {
    throw new GitServiceError(`Reflog offset must be between 0 and ${MAX_REFLOG_SKIP}.`, "INVALID_ARGUMENT");
  }
  return { limit, skip };
}

async function assertReflogRefAvailable(cwd, normalizedRef) {
  if (normalizedRef.ref === "HEAD") return;
  const result = await runGit(cwd, ["show-ref", "--verify", "--quiet", normalizedRef.ref], { allowFailure: true });
  if (result.failed) {
    throw new GitServiceError(`Local branch "${normalizedRef.refName.slice("refs/heads/".length)}" was not found.`, "REFLOG_REF_UNAVAILABLE");
  }
}

async function listReflog(repositoryPath, options = {}) {
  const repository = await resolveRepository(repositoryPath);
  const normalizedRef = normalizeReflogRef(options.ref);
  const { limit, skip } = normalizeReflogPagination(options);
  await assertReflogRefAvailable(repository.rootPath, normalizedRef);

  const result = await runGit(
    repository.rootPath,
    [
      "log",
      "-g",
      "--date=iso-strict",
      REFLOG_FORMAT,
      "-n",
      String(limit + 1),
      `--skip=${skip}`,
      normalizedRef.ref,
    ],
    { allowFailure: true },
  );
  if (result.failed) {
    throw new GitServiceError("Git could not read the requested reflog.", "REFLOG_FAILED", result.stderr);
  }

  const parsed = parseReflogEntries(result.stdout, {
    refName: normalizedRef.refName,
    offset: skip,
  });
  const hasMore = parsed.length > limit;
  return {
    ref: normalizedRef.refName,
    limit,
    skip,
    hasMore,
    nextSkip: hasMore ? skip + limit : null,
    entries: hasMore ? parsed.slice(0, limit) : parsed,
  };
}

async function getCommitReachability(repositoryPath, hashInput) {
  const hash = assertCommitHash(hashInput);
  const repository = await resolveRepository(repositoryPath);
  const commit = await resolveCommit(repository.rootPath, hash);
  const [branchesResult, tagsResult] = await Promise.all([
    runGit(repository.rootPath, ["branch", "--contains", commit.hash, "--format=%(refname:short)"], { allowFailure: true }),
    runGit(repository.rootPath, ["tag", "--contains", commit.hash, "--format=%(refname:short)"], { allowFailure: true }),
  ]);
  if (branchesResult.failed || tagsResult.failed) {
    throw new GitServiceError("Git could not calculate commit reachability.", "REFLOG_FAILED", branchesResult.stderr || tagsResult.stderr);
  }

  const parseNames = (raw) => raw.split("\n").map((name) => name.trim().replace(/^\*\s*/, "")).filter(Boolean);
  const branches = parseNames(branchesResult.stdout);
  const tags = parseNames(tagsResult.stdout);
  return {
    hash: commit.hash,
    branches,
    tags,
    reachableFromAnyKnownRef: branches.length > 0 || tags.length > 0,
  };
}

module.exports = {
  DEFAULT_REFLOG_LIMIT,
  MAX_REFLOG_LIMIT,
  MAX_REFLOG_SKIP,
  REFLOG_FORMAT,
  REFLOG_ACTIONS: [...REFLOG_ACTIONS],
  REFLOG_FIELD_SEPARATOR,
  REFLOG_RECORD_SEPARATOR,
  assertReflogRefAvailable,
  getCommitReachability,
  listReflog,
  normalizeReflogPagination,
  normalizeReflogRef,
  parseReflogAction,
  parseReflogEntries,
};
