export const ACTIVITY_RANGES = Object.freeze({
  "3m": 3,
  "6m": 6,
  "12m": 12,
  "2y": 24,
  all: null,
});

export const ACTIVITY_METRICS = Object.freeze(["commits", "churn"]);
export const MAX_ACTIVITY_DAYS = 3660;
export const MAX_DAY_ENTRIES = 50;

function pad(value) {
  return String(value).padStart(2, "0");
}

export function getUserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function dateKeyFromTimestamp(timestamp, timeZone = getUserTimeZone()) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return `${values.year}-${pad(values.month)}-${pad(values.day)}`;
}

function dateKeyToDate(dateKey) {
  const match = String(dateKey ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) return null;
  return date;
}

function dateKeyFromDate(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDays(dateKey, amount) {
  const date = dateKeyToDate(dateKey);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + amount);
  return dateKeyFromDate(date);
}

export function shiftMonths(dateKey, amount) {
  const date = dateKeyToDate(dateKey);
  if (!date) return dateKey;
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return dateKeyFromDate(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date.getUTCDate(), lastDay))));
}

function compareDateKeys(left, right) {
  return String(left).localeCompare(String(right));
}

function listDateKeys(start, end) {
  const dates = [];
  let current = start;
  while (current && compareDateKeys(current, end) <= 0 && dates.length <= MAX_ACTIVITY_DAYS) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

function authorIdentity(commit) {
  if (commit?.author && typeof commit.author === "object") {
    const name = String(commit.author.name ?? "").trim() || "Unknown author";
    const email = String(commit.author.email ?? "").trim().toLowerCase();
    return { key: commit.author.key || (email ? `email:${email}` : `name:${name.toLowerCase()}`), name, email };
  }
  const name = String(commit?.author ?? "").trim() || "Unknown author";
  const email = String(commit?.email ?? "").trim().toLowerCase();
  return { key: email ? `email:${email}` : `name:${name.toLowerCase()}`, name, email };
}

function authorMatches(author, selector) {
  if (!selector) return true;
  const normalized = String(selector).trim().toLowerCase();
  return [author.key, author.name, author.email].some((value) => String(value ?? "").toLowerCase() === normalized);
}

function pathMatches(change, pathPrefix) {
  if (!pathPrefix) return true;
  return [change?.path, change?.oldPath].some((value) => value === pathPrefix || String(value ?? "").startsWith(`${pathPrefix}/`));
}

function commitDate(commit, timeZone) {
  return dateKeyFromTimestamp(commit?.authoredAt ?? commit?.date ?? commit?.timestamp, timeZone);
}

function commitTimestamp(commit) {
  const value = commit?.authoredAt ?? commit?.date ?? commit?.timestamp;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return value ?? null;
}

function commitEntry(commit, author, date, timeZone) {
  const hash = String(commit?.hash ?? "");
  return {
    hash,
    shortHash: hash.slice(0, 8),
    subject: commit?.subject ?? "",
    author,
    authoredAt: commitTimestamp(commit),
    date: dateKeyFromTimestamp(commit?.authoredAt ?? commit?.date ?? commit?.timestamp, timeZone) ?? date,
  };
}

function createBucket(date) {
  return { date, commits: 0, additions: 0, deletions: 0, churn: 0, authors: new Set(), entries: [], entriesTruncated: false };
}

function metricValue(bucket, metric) {
  return metric === "churn" ? bucket.churn : bucket.commits;
}

export function calculateQuantileLevel(value, nonzeroValues) {
  if (value <= 0 || nonzeroValues.length === 0) return 0;
  if (nonzeroValues.length === 1) return 1;
  const lowerCount = nonzeroValues.filter((candidate) => candidate < value).length;
  return Math.min(4, Math.max(1, Math.floor((lowerCount / (nonzeroValues.length - 1)) * 4) + 1));
}

export function calculateQuantileThresholds(nonzeroValues) {
  if (nonzeroValues.length === 0) return [0, 0, 0, 0];
  const sorted = [...nonzeroValues].sort((left, right) => left - right);
  return [0.25, 0.5, 0.75, 1].map((quantile) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))]);
}

export function calculateActivityStats(buckets, metric) {
  const active = buckets.filter((bucket) => bucket.commits > 0);
  const totalCommits = buckets.reduce((total, bucket) => total + bucket.commits, 0);
  const totalAdditions = buckets.reduce((total, bucket) => total + bucket.additions, 0);
  const totalDeletions = buckets.reduce((total, bucket) => total + bucket.deletions, 0);
  const peak = buckets.reduce((best, bucket) => (!best || metricValue(bucket, metric) > metricValue(best, metric) ? bucket : best), null);
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

function normalizeOptions(options = {}) {
  const range = Object.prototype.hasOwnProperty.call(ACTIVITY_RANGES, options.range) ? options.range : "12m";
  const metric = ACTIVITY_METRICS.includes(options.metric) ? options.metric : "commits";
  const author = options.author ? String(options.author).trim() : "";
  const pathPrefix = options.pathPrefix ? String(options.pathPrefix).trim().replace(/\/+$/, "") : "";
  const now = options.now === undefined ? new Date() : new Date(options.now);
  return { range, metric, author, pathPrefix, now: Number.isNaN(now.getTime()) ? new Date() : now, timeZone: options.timeZone || getUserTimeZone() };
}

export function aggregateActivity(commits = [], options = {}) {
  const normalized = normalizeOptions(options);
  const getFiles = typeof options.getFiles === "function" ? options.getFiles : (commit) => commit?.files ?? [];
  const candidates = (Array.isArray(commits) ? commits : [])
    .map((commit) => {
      const author = authorIdentity(commit);
      const date = commitDate(commit, normalized.timeZone);
      const files = getFiles(commit) ?? [];
      const changes = normalized.pathPrefix ? files.filter((change) => pathMatches(change, normalized.pathPrefix)) : files;
      return { commit, author, date, files, changes };
    })
    .filter(({ author, date, changes }) => date && authorMatches(author, normalized.author) && (!normalized.pathPrefix || changes.length > 0));
  const endDate = dateKeyFromTimestamp(normalized.now, normalized.timeZone);
  const earliest = candidates.map((candidate) => candidate.date).sort(compareDateKeys)[0];
  const requestedStart = normalized.range === "all" ? earliest || endDate : shiftMonths(endDate, -ACTIVITY_RANGES[normalized.range]);
  let rangeStart = requestedStart;
  const rangeEnd = endDate;
  let dates = listDateKeys(rangeStart, rangeEnd);
  let rangeTruncated = false;
  if (dates.length > MAX_ACTIVITY_DAYS) {
    rangeTruncated = true;
    rangeStart = addDays(rangeEnd, -(MAX_ACTIVITY_DAYS - 1));
    dates = listDateKeys(rangeStart, rangeEnd);
  }
  const buckets = new Map(dates.map((date) => [date, createBucket(date)]));
  let filteredCommits = 0;
  const authors = new Map();
  for (const candidate of candidates) {
    if (compareDateKeys(candidate.date, rangeStart) < 0 || compareDateKeys(candidate.date, rangeEnd) > 0) continue;
    const bucket = buckets.get(candidate.date);
    if (!bucket) continue;
    filteredCommits += 1;
    bucket.commits += 1;
    bucket.authors.add(candidate.author.key);
    if (bucket.entries.length < MAX_DAY_ENTRIES) bucket.entries.push(commitEntry(candidate.commit, candidate.author, candidate.date, normalized.timeZone));
    else bucket.entriesTruncated = true;
    const existingAuthor = authors.get(candidate.author.key) ?? { ...candidate.author, commits: 0, additions: 0, deletions: 0, churn: 0 };
    existingAuthor.commits += 1;
    for (const change of candidate.changes) {
      existingAuthor.additions += Number(change?.additions) || 0;
      existingAuthor.deletions += Number(change?.deletions) || 0;
      bucket.additions += Number(change?.additions) || 0;
      bucket.deletions += Number(change?.deletions) || 0;
    }
    existingAuthor.churn = existingAuthor.additions + existingAuthor.deletions;
    authors.set(candidate.author.key, existingAuthor);
    bucket.churn = bucket.additions + bucket.deletions;
  }
  const serialized = [...buckets.values()];
  const nonzeroValues = serialized.map((bucket) => metricValue(bucket, normalized.metric)).filter((value) => value > 0);
  const thresholds = calculateQuantileThresholds(nonzeroValues);
  const outputBuckets = serialized.map((bucket) => ({
    date: bucket.date,
    commits: bucket.commits,
    additions: bucket.additions,
    deletions: bucket.deletions,
    churn: bucket.churn,
    authors: bucket.authors.size,
    entries: bucket.entries,
    entriesTruncated: bucket.entriesTruncated,
    level: calculateQuantileLevel(metricValue(bucket, normalized.metric), nonzeroValues),
  }));
  const sourceScope = options.scope ?? {};
  return {
    repositoryKey: options.repositoryKey ?? "demo",
    head: options.head ?? "",
    generatedAt: new Date().toISOString(),
    range: normalized.range,
    metric: normalized.metric,
    timeZone: normalized.timeZone,
    timezonePolicy: "user-local calendar day",
    author: normalized.author || null,
    pathPrefix: normalized.pathPrefix || null,
    rangeStart,
    rangeEnd,
    buckets: outputBuckets,
    scale: { metric: normalized.metric, thresholds, nonzeroDays: nonzeroValues.length, levels: [0, 1, 2, 3, 4] },
    stats: calculateActivityStats(outputBuckets, normalized.metric),
    authors: [...authors.values()].sort((left, right) => right.commits - left.commits || left.name.localeCompare(right.name)).slice(0, 100),
    scope: {
      ...sourceScope,
      filteredCommits,
      sourceTruncated: Boolean(sourceScope.sourceTruncated ?? sourceScope.truncated ?? sourceScope.filesTruncated),
      rangeTruncated,
      rangeDays: outputBuckets.length,
    },
  };
}

export function buildCalendarColumns(buckets = []) {
  const first = dateKeyToDate(buckets[0]?.date);
  if (!first) return [];
  const leadingEmptyDays = first.getUTCDay();
  const cells = [...Array(leadingEmptyDays).fill(null), ...buckets];
  while (cells.length % 7 !== 0) cells.push(null);
  const columns = [];
  for (let index = 0; index < cells.length; index += 7) {
    const days = cells.slice(index, index + 7);
    const firstDay = days.find(Boolean);
    columns.push({
      days,
      label: firstDay && (firstDay.date.endsWith("-01") || index === 0) ? new Intl.DateTimeFormat(undefined, { month: "short" }).format(dateKeyToDate(firstDay.date)) : "",
    });
  }
  return columns;
}

export function formatActivityDate(dateKey, options = {}) {
  const date = dateKeyToDate(dateKey);
  return date ? new Intl.DateTimeFormat(undefined, { dateStyle: options.dateStyle ?? "medium", timeZone: "UTC" }).format(date) : "Unknown date";
}

export function formatActivityMonth(dateKey) {
  const date = dateKeyToDate(dateKey);
  return date ? new Intl.DateTimeFormat(undefined, { month: "short" }).format(date) : "";
}
