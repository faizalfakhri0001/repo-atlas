const { GitServiceError, assertRelativePath } = require("../core.cjs");

const ACTIVITY_RANGES = Object.freeze({
  "3m": 3,
  "6m": 6,
  "12m": 12,
  "2y": 24,
  all: null,
});
const ACTIVITY_METRICS = new Set(["commits", "churn"]);
const MAX_ACTIVITY_DAYS = 3660;

function normalizeText(value, field, maximum = 256) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.includes("\0")) throw new GitServiceError(`${field} is invalid.`, "INVALID_ARGUMENT");
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new GitServiceError(`${field} is invalid.`, "INVALID_ARGUMENT");
  return normalized;
}

function normalizeTimeZone(value) {
  const candidate = normalizeText(value, "timeZone", 128) || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    throw new GitServiceError("The requested timezone is invalid.", "INVALID_ARGUMENT");
  }
}

function normalizeActivityOptions(options = {}) {
  const range = Object.prototype.hasOwnProperty.call(ACTIVITY_RANGES, options.range) ? options.range : "12m";
  const metric = ACTIVITY_METRICS.has(options.metric) ? options.metric : "commits";
  const author = normalizeText(options.author, "author");
  const rawPath = normalizeText(options.pathPrefix, "pathPrefix", 4096);
  const pathPrefix = rawPath ? assertRelativePath(rawPath).replace(/\/+$/, "") : null;
  const now = options.now === undefined ? new Date() : new Date(options.now);
  if (Number.isNaN(now.getTime())) throw new GitServiceError("The activity timestamp is invalid.", "INVALID_ARGUMENT");
  return {
    range,
    metric,
    author,
    pathPrefix,
    timeZone: normalizeTimeZone(options.timeZone),
    now,
  };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function localDateParts(timestamp, timeZone) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return { year: values.year, month: values.month, day: values.day };
}

function dateKeyFromTimestamp(timestamp, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC") {
  const parts = localDateParts(timestamp, timeZone);
  return parts ? `${parts.year}-${pad(parts.month)}-${pad(parts.day)}` : null;
}

function dateKeyToParts(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (date.getUTCFullYear() !== parts.year || date.getUTCMonth() !== parts.month - 1 || date.getUTCDate() !== parts.day) return null;
  return parts;
}

function dateKeyFromUtcDate(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function shiftMonths(dateKey, amount) {
  const parts = dateKeyToParts(dateKey);
  if (!parts) return dateKey;
  const targetMonth = parts.month - 1 + amount;
  const firstOfTarget = new Date(Date.UTC(parts.year, targetMonth, 1));
  const lastDay = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth(), Math.min(parts.day, lastDay)));
  return dateKeyFromUtcDate(date);
}

function addDays(dateKey, amount) {
  const parts = dateKeyToParts(dateKey);
  if (!parts) return null;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + amount);
  return dateKeyFromUtcDate(date);
}

function compareDateKeys(left, right) {
  return String(left).localeCompare(String(right));
}

function listDateKeys(start, end) {
  const result = [];
  let current = start;
  while (current && compareDateKeys(current, end) <= 0 && result.length <= MAX_ACTIVITY_DAYS) {
    result.push(current);
    current = addDays(current, 1);
  }
  return result;
}

function pathMatches(change, pathPrefix) {
  if (!pathPrefix) return true;
  return [change?.path, change?.oldPath].some((value) => value === pathPrefix || String(value ?? "").startsWith(`${pathPrefix}/`));
}

function authorMatches(author, selector) {
  if (!selector) return true;
  const normalized = selector.toLowerCase();
  return [author?.key, author?.name, author?.email].some((value) => String(value ?? "").toLowerCase() === normalized);
}

function createBucket(date) {
  return { date, commits: 0, additions: 0, deletions: 0, churn: 0, authorKeys: new Set(), entries: [], entriesTruncated: false };
}

function serializeCommitEntry(commit, timeZone) {
  return {
    hash: commit.hash,
    shortHash: String(commit.hash ?? "").slice(0, 8),
    subject: commit.subject ?? "",
    author: commit.author ?? { key: "name:unknown", name: "Unknown author", email: "" },
    authoredAt: commit.authoredAt,
    date: dateKeyFromTimestamp(commit.authoredAt, timeZone),
  };
}

function metricValue(bucket, metric) {
  return metric === "churn" ? bucket.churn : bucket.commits;
}

function calculateQuantileLevel(value, nonzeroValues) {
  if (value <= 0 || nonzeroValues.length === 0) return 0;
  const lowerCount = nonzeroValues.filter((candidate) => candidate < value).length;
  if (nonzeroValues.length === 1) return 1;
  return Math.min(4, Math.max(1, Math.floor((lowerCount / (nonzeroValues.length - 1)) * 4) + 1));
}

function calculateQuantileThresholds(nonzeroValues) {
  if (nonzeroValues.length === 0) return [0, 0, 0, 0];
  const sorted = [...nonzeroValues].sort((left, right) => left - right);
  return [0.25, 0.5, 0.75, 1].map((quantile) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))]);
}

function calculateActivityStats(buckets, metric) {
  const active = buckets.filter((bucket) => bucket.commits > 0);
  const totalCommits = buckets.reduce((total, bucket) => total + bucket.commits, 0);
  const totalAdditions = buckets.reduce((total, bucket) => total + bucket.additions, 0);
  const totalDeletions = buckets.reduce((total, bucket) => total + bucket.deletions, 0);
  const peak = buckets.reduce((best, bucket) => {
    if (!best || metricValue(bucket, metric) > metricValue(best, metric)) return bucket;
    return best;
  }, null);
  let currentActiveStreak = 0;
  for (let index = buckets.length - 1; index >= 0 && buckets[index].commits > 0; index -= 1) currentActiveStreak += 1;
  let longestActiveStreak = 0;
  let longestInactiveStreak = 0;
  let activeStreak = 0;
  let inactiveStreak = 0;
  for (const bucket of buckets) {
    if (bucket.commits > 0) {
      activeStreak += 1;
      inactiveStreak = 0;
    } else {
      inactiveStreak += 1;
      activeStreak = 0;
    }
    longestActiveStreak = Math.max(longestActiveStreak, activeStreak);
    longestInactiveStreak = Math.max(longestInactiveStreak, inactiveStreak);
  }
  return {
    activeDays: active.length,
    totalCommits,
    totalAdditions,
    totalDeletions,
    totalChurn: totalAdditions + totalDeletions,
    avgCommitsPerActiveDay: active.length > 0 ? totalCommits / active.length : 0,
    peakDay: peak && metricValue(peak, metric) > 0 ? { date: peak.date, value: metricValue(peak, metric), commits: peak.commits, churn: peak.churn } : null,
    currentActiveStreak,
    longestActiveStreak,
    longestInactiveStreak,
  };
}

function serializeAuthor(author) {
  return {
    key: author.key,
    name: author.name,
    email: author.email,
    commits: author.commits,
    additions: author.additions,
    deletions: author.deletions,
    churn: author.churn,
  };
}

function buildActivityReport(index, options = {}) {
  const normalized = normalizeActivityOptions(options);
  const sourceCommits = Array.isArray(index?.commits) ? index.commits : [];
  const candidates = sourceCommits
    .map((commit) => ({ commit, date: dateKeyFromTimestamp(commit.authoredAt, normalized.timeZone) }))
    .filter(({ commit, date }) => date && authorMatches(commit.author, normalized.author) && (normalized.pathPrefix ? commit.files?.some((change) => pathMatches(change, normalized.pathPrefix)) : true));
  const endDate = dateKeyFromTimestamp(normalized.now, normalized.timeZone);
  const earliest = candidates.map((candidate) => candidate.date).sort(compareDateKeys)[0];
  const requestedStart = normalized.range === "all" ? earliest || endDate : shiftMonths(endDate, -ACTIVITY_RANGES[normalized.range]);
  let rangeStart = requestedStart;
  let rangeEnd = endDate;
  let dates = listDateKeys(rangeStart, rangeEnd);
  let rangeTruncated = false;
  if (dates.length > MAX_ACTIVITY_DAYS) {
    rangeTruncated = true;
    rangeStart = addDays(rangeEnd, -(MAX_ACTIVITY_DAYS - 1));
    dates = listDateKeys(rangeStart, rangeEnd);
  }
  const buckets = new Map(dates.map((date) => [date, createBucket(date)]));
  let filteredCommits = 0;
  for (const { commit, date } of candidates) {
    if (compareDateKeys(date, rangeStart) < 0 || compareDateKeys(date, rangeEnd) > 0) continue;
    const bucket = buckets.get(date);
    if (!bucket) continue;
    const changes = normalized.pathPrefix ? (commit.files ?? []).filter((change) => pathMatches(change, normalized.pathPrefix)) : (commit.files ?? []);
    if (normalized.pathPrefix && changes.length === 0) continue;
    filteredCommits += 1;
    bucket.commits += 1;
    bucket.authorKeys.add(commit.author?.key || commit.author?.email || commit.author?.name || "name:unknown");
    if (bucket.entries.length < 50) bucket.entries.push(serializeCommitEntry(commit, normalized.timeZone));
    else bucket.entriesTruncated = true;
    for (const change of changes) {
      bucket.additions += Number(change.additions) || 0;
      bucket.deletions += Number(change.deletions) || 0;
    }
    bucket.churn = bucket.additions + bucket.deletions;
  }
  const serializedBuckets = [...buckets.values()];
  const nonzeroValues = serializedBuckets.map((bucket) => metricValue(bucket, normalized.metric)).filter((value) => value > 0);
  const thresholds = calculateQuantileThresholds(nonzeroValues);
  const outputBuckets = serializedBuckets.map((bucket) => ({
    date: bucket.date,
    commits: bucket.commits,
    additions: bucket.additions,
    deletions: bucket.deletions,
    churn: bucket.churn,
    authors: bucket.authorKeys.size,
    entries: bucket.entries,
    entriesTruncated: bucket.entriesTruncated,
    level: calculateQuantileLevel(metricValue(bucket, normalized.metric), nonzeroValues),
  }));
  const authors = [...(index?.authors instanceof Map ? index.authors.values() : Array.isArray(index?.authors) ? index.authors : [])]
    .filter((author) => !normalized.author || authorMatches(author, normalized.author))
    .sort((left, right) => right.commits - left.commits || String(left.name ?? "").localeCompare(String(right.name ?? "")))
    .slice(0, 100)
    .map(serializeAuthor);
  return {
    repositoryKey: index?.repositoryKey ?? "",
    head: index?.head ?? "",
    generatedAt: new Date().toISOString(),
    range: normalized.range,
    metric: normalized.metric,
    timeZone: normalized.timeZone,
    timezonePolicy: "user-local calendar day",
    author: normalized.author,
    pathPrefix: normalized.pathPrefix,
    rangeStart,
    rangeEnd,
    buckets: outputBuckets,
    scale: { metric: normalized.metric, thresholds, nonzeroDays: nonzeroValues.length, levels: [0, 1, 2, 3, 4] },
    stats: calculateActivityStats(outputBuckets, normalized.metric),
    authors,
    scope: {
      ...(index?.scope ?? {}),
      filteredCommits,
      sourceTruncated: Boolean(index?.scope?.truncated || index?.scope?.filesTruncated),
      rangeTruncated,
      rangeDays: outputBuckets.length,
    },
  };
}

module.exports = {
  ACTIVITY_METRICS: [...ACTIVITY_METRICS],
  ACTIVITY_RANGES,
  MAX_ACTIVITY_DAYS,
  addDays,
  buildActivityReport,
  calculateActivityStats,
  calculateQuantileLevel,
  calculateQuantileThresholds,
  dateKeyFromTimestamp,
  normalizeActivityOptions,
};
