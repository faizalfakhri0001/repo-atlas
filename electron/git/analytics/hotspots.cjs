const { assertRelativePath } = require("../core.cjs");

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const RECENCY_WINDOW_DAYS = 180;
const DEFAULT_HOTSPOT_LIMIT = 100;
const MAX_HOTSPOT_LIMIT = 1000;

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function calculateChurn(additions, deletions) {
  return finiteNumber(additions) + finiteNumber(deletions);
}

function calculateCommitFrequency(file) {
  return finiteNumber(file?.commitCount ?? file?.commits);
}

function timestampOf(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value === "string" && value.trim()) return Date.parse(value);
  return NaN;
}

function calculateAgeDays(lastChangedAt, now = Date.now()) {
  const changedAt = timestampOf(lastChangedAt);
  const current = timestampOf(now);
  if (!Number.isFinite(changedAt) || !Number.isFinite(current)) return null;
  return Math.max(0, (current - changedAt) / DAY_IN_MILLISECONDS);
}

function calculateRecencyScore(lastChangedAt, now = Date.now()) {
  const ageDays = calculateAgeDays(lastChangedAt, now);
  if (ageDays == null) return 0;
  return Math.exp(-ageDays / RECENCY_WINDOW_DAYS);
}

function mapValues(value) {
  if (value instanceof Map) return [...value.values()];
  return Array.isArray(value) ? value : [];
}

/**
 * Convert the shared analytics index into the raw per-file activity records
 * consumed by hotspot scoring. No repository file-system reads are needed;
 * historical paths can therefore be reported even after a file is deleted.
 */
function collectFileActivity(index) {
  if (!index || !index.files) return [];

  return mapValues(index.files)
    .map((file) => {
      const additions = finiteNumber(file.additions);
      const deletions = finiteNumber(file.deletions);
      const commitCount = calculateCommitFrequency(file);
      const authors = mapValues(file.authors).map((author) => ({ ...author }));
      return {
        path: typeof file.path === "string" ? file.path : "",
        commitCount,
        commits: commitCount,
        commitFrequency: commitCount,
        additions,
        deletions,
        churn: calculateChurn(additions, deletions),
        authorCount: authors.length,
        authors,
        firstSeenAt: file.firstSeenAt ?? null,
        lastChangedAt: file.lastChangedAt ?? null,
      };
    })
    .filter((file) => file.path.length > 0);
}

function normalizePathPrefix(value) {
  const prefix = typeof value === "string" ? value.trim() : "";
  if (!prefix) return "";
  return assertRelativePath(prefix).replace(/\/+$/, "");
}

function pathMatchesPrefix(filePath, pathPrefix) {
  if (!pathPrefix) return true;
  return filePath === pathPrefix || filePath.startsWith(`${pathPrefix}/`);
}

function normalizeHotspotLimit(value) {
  return Math.min(MAX_HOTSPOT_LIMIT, Math.max(1, Math.floor(Number(value) || DEFAULT_HOTSPOT_LIMIT)));
}

module.exports = {
  DAY_IN_MILLISECONDS,
  DEFAULT_HOTSPOT_LIMIT,
  MAX_HOTSPOT_LIMIT,
  RECENCY_WINDOW_DAYS,
  collectFileActivity,
  calculateChurn,
  calculateCommitFrequency,
  calculateAgeDays,
  calculateRecencyScore,
  normalizeHotspotLimit,
  normalizePathPrefix,
  pathMatchesPrefix,
};
