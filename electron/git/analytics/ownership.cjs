const { assertRelativePath } = require("../core.cjs");
const { normalizeAuthorIdentity } = require("./identity.cjs");

const DEFAULT_OWNERSHIP_LIMIT = 100;
const MAX_OWNERSHIP_LIMIT = 1000;
const OWNERSHIP_PERIODS = new Set(["all", "12m"]);

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function mapValues(value) {
  if (value instanceof Map) return [...value.values()];
  return Array.isArray(value) ? value : [];
}

function normalizeOwnershipPeriod(value) {
  return OWNERSHIP_PERIODS.has(value) ? value : "all";
}

function normalizeOwnershipLimit(value) {
  return Math.min(MAX_OWNERSHIP_LIMIT, Math.max(1, Math.floor(Number(value) || DEFAULT_OWNERSHIP_LIMIT)));
}

function normalizeOwnershipPath(value) {
  const path = typeof value === "string" ? value.trim() : "";
  return path ? assertRelativePath(path).replace(/\/+$/, "") : "";
}

function contributorKey(author) {
  return normalizeAuthorIdentity(author).key;
}

function createContributor(author) {
  const identity = normalizeAuthorIdentity(author);
  return {
    key: identity.key,
    name: identity.name,
    email: identity.email,
    aliases: new Set(identity.alias ? [identity.alias] : []),
    commits: 0,
    additions: 0,
    deletions: 0,
    churn: 0,
    lastChangedAt: null,
    recentActivity: 0,
  };
}

function laterDate(current, candidate) {
  if (!candidate) return current;
  if (!current || candidate > current) return candidate;
  return current;
}

function mergeContributor(target, source, { recent = false } = {}) {
  const identity = normalizeAuthorIdentity(source);
  target.name = identity.name || target.name;
  target.email = identity.email || target.email;
  if (identity.alias) target.aliases.add(identity.alias);
  target.commits += finiteNumber(source.commits);
  target.additions += finiteNumber(source.additions);
  target.deletions += finiteNumber(source.deletions);
  target.churn += finiteNumber(source.churn, finiteNumber(source.additions) + finiteNumber(source.deletions));
  target.lastChangedAt = laterDate(target.lastChangedAt, source.lastChangedAt ?? source.authoredAt);
  if (recent) target.recentActivity += finiteNumber(source.commits, 1);
}

function createFileOwnership(filePath) {
  return {
    path: filePath,
    type: "file",
    totalCommits: 0,
    totalChurn: 0,
    additions: 0,
    deletions: 0,
    firstSeenAt: null,
    lastChangedAt: null,
    contributors: new Map(),
  };
}

function mergeFileAnalytics(target, file) {
  target.totalCommits += finiteNumber(file.commits ?? file.totalCommits);
  target.additions += finiteNumber(file.additions);
  target.deletions += finiteNumber(file.deletions);
  target.totalChurn += finiteNumber(file.churn, finiteNumber(file.additions) + finiteNumber(file.deletions));
  target.firstSeenAt = !target.firstSeenAt || (file.firstSeenAt && file.firstSeenAt < target.firstSeenAt) ? file.firstSeenAt ?? target.firstSeenAt : target.firstSeenAt;
  target.lastChangedAt = laterDate(target.lastChangedAt, file.lastChangedAt);
  for (const author of mapValues(file.authors ?? file.contributors)) {
    const key = contributorKey(author);
    let contributor = target.contributors.get(key);
    if (!contributor) {
      contributor = createContributor(author);
      target.contributors.set(key, contributor);
    }
    mergeContributor(contributor, author);
  }
  return target;
}

/**
 * Aggregate all-time file ownership from the shared analytics index. The
 * function only uses historical index data and never reads the working tree.
 */
function aggregateFileOwnership(index) {
  const files = new Map();
  for (const file of mapValues(index?.files)) {
    if (typeof file.path !== "string" || !file.path) continue;
    const ownership = createFileOwnership(file.path);
    mergeFileAnalytics(ownership, file);
    files.set(file.path, ownership);
  }
  return files;
}

module.exports = {
  DEFAULT_OWNERSHIP_LIMIT,
  MAX_OWNERSHIP_LIMIT,
  OWNERSHIP_PERIODS,
  aggregateFileOwnership,
  contributorKey,
  createContributor,
  createFileOwnership,
  finiteNumber,
  mapValues,
  mergeContributor,
  mergeFileAnalytics,
  normalizeOwnershipLimit,
  normalizeOwnershipPath,
  normalizeOwnershipPeriod,
};
