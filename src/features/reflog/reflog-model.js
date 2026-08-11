const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DATE_GROUP_WINDOW_DAYS = 7;

export const REFLOG_ACTION_OPTIONS = [
  { value: "all", label: "All actions" },
  { value: "commit", label: "Commit" },
  { value: "checkout", label: "Checkout" },
  { value: "reset", label: "Reset" },
  { value: "rebase", label: "Rebase" },
  { value: "merge", label: "Merge" },
  { value: "cherry-pick", label: "Cherry-pick" },
  { value: "amend", label: "Amend" },
  { value: "other", label: "Other" },
];

function calendarDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatCalendarDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function getReflogEntryKey(entry) {
  if (!entry) return "";
  return `${entry.refName ?? "HEAD"}:${entry.selector ?? entry.index ?? entry.hash ?? ""}`;
}

export function getReflogGroup(entry, { now = new Date() } = {}) {
  const today = calendarDay(now);
  const entryDay = calendarDay(entry?.date);
  if (today == null || entryDay == null) return { key: "older", label: "Older" };

  const dayDifference = Math.floor((today - entryDay) / DAY_IN_MS);
  if (dayDifference <= 0) return { key: "today", label: "Today" };
  if (dayDifference === 1) return { key: "yesterday", label: "Yesterday" };
  if (dayDifference <= DATE_GROUP_WINDOW_DAYS) {
    const label = formatCalendarDate(entry.date);
    return { key: `date:${entryDay}`, label };
  }
  return { key: "older", label: "Older" };
}

export function groupReflogEntries(entries = [], options = {}) {
  const groups = [];
  const byKey = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const group = getReflogGroup(entry, options);
    let target = byKey.get(group.key);
    if (!target) {
      target = { ...group, entries: [] };
      byKey.set(group.key, target);
      groups.push(target);
    }
    target.entries.push(entry);
  }
  return groups;
}

export function matchesReflogEntry(entry, { action = "all", query = "" } = {}) {
  if (!entry) return false;
  if (action !== "all" && entry.action !== action) return false;
  const normalizedQuery = String(query ?? "").trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;

  const searchable = [
    entry.hash,
    entry.shortHash,
    entry.selector,
    entry.refName,
    entry.rawMessage,
    entry.detail,
    entry.action,
    entry.actor?.name,
    entry.actor?.email,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return searchable.includes(normalizedQuery);
}

export function filterReflogEntries(entries = [], options = {}) {
  return (Array.isArray(entries) ? entries : []).filter((entry) => matchesReflogEntry(entry, options));
}

export function mergeReflogEntries(current = [], incoming = []) {
  const merged = [];
  const seen = new Set();
  for (const entry of [...(Array.isArray(current) ? current : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    const key = getReflogEntryKey(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  return merged;
}

export function findPreviousReflogEntry(entries = [], selected) {
  if (!selected) return null;
  const index = (Array.isArray(entries) ? entries : []).findIndex(
    (entry) => getReflogEntryKey(entry) === getReflogEntryKey(selected),
  );
  return index >= 0 ? entries[index + 1] ?? null : null;
}
