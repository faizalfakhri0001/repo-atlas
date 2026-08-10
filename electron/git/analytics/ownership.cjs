const { assertRelativePath } = require("../core.cjs");
const { normalizeAuthorIdentity } = require("./identity.cjs");

const DEFAULT_OWNERSHIP_LIMIT = 100;
const MAX_OWNERSHIP_LIMIT = 1000;
const OWNERSHIP_PERIODS = new Set(["all", "12m"]);
const TWELVE_MONTHS_DAYS = 365;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

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

function timestampOf(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value === "string" && value.trim()) return Date.parse(value);
  return NaN;
}

function ownershipPeriodStart(period, now = Date.now()) {
  if (normalizeOwnershipPeriod(period) !== "12m") return -Infinity;
  const current = timestampOf(now);
  return Number.isFinite(current) ? current - TWELVE_MONTHS_DAYS * DAY_IN_MILLISECONDS : NaN;
}

function commitIsInOwnershipPeriod(commit, period, now) {
  const start = ownershipPeriodStart(period, now);
  if (start === -Infinity) return true;
  const timestamp = timestampOf(commit?.authoredAt);
  return Number.isFinite(start) && Number.isFinite(timestamp) && timestamp >= start;
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

function createDirectoryOwnership(directoryPath) {
  return {
    path: directoryPath,
    type: "directory",
    totalCommits: 0,
    totalChurn: 0,
    additions: 0,
    deletions: 0,
    firstSeenAt: null,
    lastChangedAt: null,
    fileCount: 0,
    contributors: new Map(),
  };
}

function directoryAncestors(filePath) {
  const ancestors = [];
  let directory = filePath.slice(0, filePath.lastIndexOf("/"));
  while (true) {
    ancestors.push(directory);
    if (!directory) break;
    const separator = directory.lastIndexOf("/");
    directory = separator < 0 ? "" : directory.slice(0, separator);
  }
  return ancestors;
}

function aggregateDirectoryOwnership(files) {
  const directories = new Map();
  for (const file of mapValues(files)) {
    if (!file?.path) continue;
    for (const directoryPath of directoryAncestors(file.path)) {
      let directory = directories.get(directoryPath);
      if (!directory) {
        directory = createDirectoryOwnership(directoryPath);
        directories.set(directoryPath, directory);
      }
      directory.fileCount += 1;
      mergeFileAnalytics(directory, file);
    }
  }
  return directories;
}

function compareContributors(left, right) {
  return right.ownershipScore - left.ownershipScore || right.churn - left.churn || right.commits - left.commits || left.name.localeCompare(right.name);
}

function concentrationLabel(top1Share) {
  if (top1Share >= 0.8) return "Highly concentrated";
  if (top1Share >= 0.6) return "Moderately concentrated";
  return "Distributed";
}

function calculateOwnershipMetrics(node) {
  const totalCommits = finiteNumber(node.totalCommits);
  const totalChurn = finiteNumber(node.totalChurn);
  const contributors = mapValues(node.contributors).map((contributor) => {
    const commits = finiteNumber(contributor.commits);
    const churn = finiteNumber(contributor.churn, finiteNumber(contributor.additions) + finiteNumber(contributor.deletions));
    const commitShare = totalCommits > 0 ? commits / totalCommits : 0;
    const churnShare = totalChurn > 0 ? churn / totalChurn : 0;
    const ownershipScore = totalChurn > 0 ? 0.4 * commitShare + 0.6 * churnShare : commitShare;
    return {
      ...contributor,
      aliases: contributor.aliases instanceof Set ? [...contributor.aliases] : contributor.aliases ?? [],
      commits,
      churn,
      commitShare,
      churnShare,
      ownershipScore,
    };
  }).sort(compareContributors);
  const top1Share = contributors[0]?.ownershipScore ?? 0;
  const top2Share = contributors.slice(0, 2).reduce((sum, contributor) => sum + contributor.ownershipScore, 0);
  return {
    ...node,
    contributors,
    primaryContributor: contributors[0] ?? null,
    topContributors: contributors.slice(0, 10),
    top1Share,
    top2Share,
    concentration: top1Share,
    concentrationLabel: concentrationLabel(top1Share),
  };
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

function aggregateRecentFileOwnership(index, { now = Date.now() } = {}) {
  const files = new Map();
  for (const commit of Array.isArray(index?.commits) ? index.commits : []) {
    if (!commitIsInOwnershipPeriod(commit, "12m", now)) continue;
    const identity = normalizeAuthorIdentity(commit.author);
    const seenPaths = new Set();
    for (const change of Array.isArray(commit.files) ? commit.files : []) {
      if (!change?.path || seenPaths.has(change.path)) continue;
      seenPaths.add(change.path);
      let file = files.get(change.path);
      if (!file) {
        file = createFileOwnership(change.path);
        files.set(change.path, file);
      }
      const additions = finiteNumber(change.additions);
      const deletions = finiteNumber(change.deletions);
      const churn = additions + deletions;
      file.totalCommits += 1;
      file.additions += additions;
      file.deletions += deletions;
      file.totalChurn += churn;
      file.firstSeenAt = !file.firstSeenAt || commit.authoredAt < file.firstSeenAt ? commit.authoredAt : file.firstSeenAt;
      file.lastChangedAt = laterDate(file.lastChangedAt, commit.authoredAt);
      let contributor = file.contributors.get(identity.key);
      if (!contributor) {
        contributor = createContributor(identity);
        file.contributors.set(identity.key, contributor);
      }
      mergeContributor(contributor, {
        ...identity,
        commits: 1,
        additions,
        deletions,
        churn,
        authoredAt: commit.authoredAt,
      }, { recent: true });
    }
  }
  return files;
}

function aggregateOwnershipByPeriod(index, { period = "all", now = Date.now() } = {}) {
  return normalizeOwnershipPeriod(period) === "12m" ? aggregateRecentFileOwnership(index, { now }) : aggregateFileOwnership(index);
}

module.exports = {
  DEFAULT_OWNERSHIP_LIMIT,
  DAY_IN_MILLISECONDS,
  MAX_OWNERSHIP_LIMIT,
  OWNERSHIP_PERIODS,
  TWELVE_MONTHS_DAYS,
  aggregateFileOwnership,
  aggregateOwnershipByPeriod,
  aggregateRecentFileOwnership,
  aggregateDirectoryOwnership,
  calculateOwnershipMetrics,
  concentrationLabel,
  compareContributors,
  contributorKey,
  createDirectoryOwnership,
  createContributor,
  createFileOwnership,
  directoryAncestors,
  finiteNumber,
  mapValues,
  mergeContributor,
  mergeFileAnalytics,
  normalizeOwnershipLimit,
  normalizeOwnershipPath,
  normalizeOwnershipPeriod,
  ownershipPeriodStart,
  timestampOf,
};
