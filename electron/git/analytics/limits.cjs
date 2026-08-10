const DEFAULT_ANALYTICS_COMMITS = 10_000;
const MAX_ANALYTICS_COMMITS = 50_000;
const DEFAULT_MAX_FILES_PER_COMMIT = 5_000;
const MAX_FILES_PER_COMMIT = 20_000;
const MAX_ANALYTICS_OUTPUT_BYTES = 64 * 1024 * 1024;

function normalizePositiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(1, Math.floor(parsed)));
}

function normalizeAnalyticsScope(options = {}) {
  return {
    maxCommits: normalizePositiveInteger(options.maxCommits, DEFAULT_ANALYTICS_COMMITS, MAX_ANALYTICS_COMMITS),
    maxFilesPerCommit: normalizePositiveInteger(options.maxFilesPerCommit, DEFAULT_MAX_FILES_PER_COMMIT, MAX_FILES_PER_COMMIT),
  };
}

function analyticsReadLimit(maxCommits) {
  return normalizePositiveInteger(maxCommits, DEFAULT_ANALYTICS_COMMITS, MAX_ANALYTICS_COMMITS) + 1;
}

function applyCommitScope(commits, options = {}) {
  const scope = normalizeAnalyticsScope(options);
  const source = Array.isArray(commits) ? commits : [];
  return {
    scope,
    commits: source.slice(0, scope.maxCommits),
    processedCommits: Math.min(source.length, scope.maxCommits),
    truncated: source.length > scope.maxCommits,
  };
}

function limitFilesForCommit(files, maxFilesPerCommit) {
  const limit = normalizePositiveInteger(maxFilesPerCommit, DEFAULT_MAX_FILES_PER_COMMIT, MAX_FILES_PER_COMMIT);
  const source = Array.isArray(files) ? files : [];
  return {
    files: source.slice(0, limit),
    truncated: source.length > limit,
  };
}

module.exports = {
  DEFAULT_ANALYTICS_COMMITS,
  DEFAULT_MAX_FILES_PER_COMMIT,
  MAX_ANALYTICS_COMMITS,
  MAX_ANALYTICS_OUTPUT_BYTES,
  MAX_FILES_PER_COMMIT,
  analyticsReadLimit,
  applyCommitScope,
  limitFilesForCommit,
  normalizeAnalyticsScope,
};
