const { assertRelativePath } = require("../core.cjs");

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const RECENCY_WINDOW_DAYS = 180;
const DEFAULT_HOTSPOT_LIMIT = 100;
const MAX_HOTSPOT_LIMIT = 1000;
const HOTSPOT_WEIGHTS = Object.freeze({
  commitFrequency: 0.45,
  churn: 0.35,
  recency: 0.2,
});
const GENERATED_DIRECTORY_NAMES = new Set(["build", "coverage", "dist", "node_modules", "vendor"]);
const LOCK_FILE_NAMES = new Set([
  "bun.lock",
  "bun.lockb",
  "cargo.lock",
  "composer.lock",
  "gemfile.lock",
  "go.sum",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "pnpm-lock.yml",
  "yarn.lock",
]);

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

function clampUnit(value) {
  return Math.min(1, Math.max(0, finiteNumber(value)));
}

function percentileRank(values, value) {
  const numericValues = values.filter((candidate) => Number.isFinite(Number(candidate))).map(Number);
  const numericValue = Number(value);
  if (numericValues.length === 0 || !Number.isFinite(numericValue)) return 0;
  if (numericValues.length === 1) return 1;
  const lowerValues = numericValues.filter((candidate) => candidate < numericValue).length;
  return clampUnit(lowerValues / (numericValues.length - 1));
}

function calculateHotspotScore({ commitFrequencyPercentile, churnPercentile, recencyScore }) {
  return clampUnit(
    HOTSPOT_WEIGHTS.commitFrequency * clampUnit(commitFrequencyPercentile) +
      HOTSPOT_WEIGHTS.churn * clampUnit(churnPercentile) +
      HOTSPOT_WEIGHTS.recency * clampUnit(recencyScore),
  );
}

function hotspotBand(score) {
  const normalized = clampUnit(score);
  if (normalized >= 0.75) return "High";
  if (normalized >= 0.4) return "Medium";
  return "Low";
}

function scoreHotspotActivity(files, { now = Date.now() } = {}) {
  const activities = Array.isArray(files) ? files : [];
  const commitCounts = activities.map((file) => file.commitCount);
  const churnValues = activities.map((file) => file.churn);
  const scored = activities.map((file) => {
    const ageDays = calculateAgeDays(file.lastChangedAt, now);
    const recencyScore = calculateRecencyScore(file.lastChangedAt, now);
    const commitFrequencyPercentile = percentileRank(commitCounts, file.commitCount);
    const churnPercentile = percentileRank(churnValues, file.churn);
    const hotspotScore = calculateHotspotScore({ commitFrequencyPercentile, churnPercentile, recencyScore });
    return {
      ...file,
      ageDays,
      recencyScore,
      commitFrequencyPercentile,
      commitFrequencyScore: commitFrequencyPercentile,
      churnPercentile,
      churnScore: churnPercentile,
      hotspotScore,
      hotspotBand: hotspotBand(hotspotScore),
    };
  });
  const hotspotScores = scored.map((file) => file.hotspotScore);
  return scored.map((file) => ({
    ...file,
    hotspotPercentile: percentileRank(hotspotScores, file.hotspotScore),
  }));
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

function isGeneratedPath(filePath) {
  const normalized = String(filePath ?? "").replaceAll("\\", "/");
  const segments = normalized.split("/").filter(Boolean);
  const basename = segments.at(-1)?.toLowerCase() ?? "";
  return (
    segments.some((segment) => GENERATED_DIRECTORY_NAMES.has(segment.toLowerCase())) ||
    LOCK_FILE_NAMES.has(basename) ||
    basename.endsWith(".lock") ||
    basename.endsWith(".lockb") ||
    /\.min\.js$/i.test(basename) ||
    /\.min\.css$/i.test(basename)
  );
}

function filterGeneratedFiles(files, { includeGenerated = false, pathPrefix = "" } = {}) {
  const activities = Array.isArray(files) ? files : [];
  const normalizedPrefix = normalizePathPrefix(pathPrefix);
  const matchingFiles = activities.filter((file) => pathMatchesPrefix(file.path, normalizedPrefix));
  const generatedFiles = matchingFiles.filter((file) => isGeneratedPath(file.path));
  const visibleFiles = includeGenerated ? matchingFiles : matchingFiles.filter((file) => !isGeneratedPath(file.path));
  return {
    files: visibleFiles,
    totalFiles: activities.length,
    matchedFiles: matchingFiles.length,
    generatedFiles: generatedFiles.length,
    excludedGeneratedFiles: includeGenerated ? 0 : generatedFiles.length,
    includeGenerated: Boolean(includeGenerated),
    pathPrefix: normalizedPrefix,
  };
}

function normalizeHotspotLimit(value) {
  return Math.min(MAX_HOTSPOT_LIMIT, Math.max(1, Math.floor(Number(value) || DEFAULT_HOTSPOT_LIMIT)));
}

module.exports = {
  DAY_IN_MILLISECONDS,
  DEFAULT_HOTSPOT_LIMIT,
  HOTSPOT_WEIGHTS,
  MAX_HOTSPOT_LIMIT,
  RECENCY_WINDOW_DAYS,
  collectFileActivity,
  calculateChurn,
  calculateCommitFrequency,
  calculateAgeDays,
  calculateRecencyScore,
  calculateHotspotScore,
  hotspotBand,
  filterGeneratedFiles,
  isGeneratedPath,
  normalizeHotspotLimit,
  normalizePathPrefix,
  pathMatchesPrefix,
  percentileRank,
  scoreHotspotActivity,
};
