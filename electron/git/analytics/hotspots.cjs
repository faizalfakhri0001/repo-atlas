const { assertRelativePath } = require("../core.cjs");

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const RECENCY_WINDOW_DAYS = 180;
const DEFAULT_HOTSPOT_LIMIT = 100;
const MAX_HOTSPOT_LIMIT = 1000;

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
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
      const commitCount = finiteNumber(file.commits);
      const authors = mapValues(file.authors).map((author) => ({ ...author }));
      return {
        path: typeof file.path === "string" ? file.path : "",
        commitCount,
        commits: commitCount,
        additions,
        deletions,
        churn: finiteNumber(file.churn, additions + deletions),
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
  normalizeHotspotLimit,
  normalizePathPrefix,
  pathMatchesPrefix,
};
