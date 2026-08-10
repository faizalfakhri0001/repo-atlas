const DAY = 24 * 60 * 60 * 1000;
const YEAR = 365 * DAY;

export const BLAME_HEAT_BUCKETS = [
  { key: "fresh", label: "< 7 days", shortLabel: "<7d", dotClass: "bg-emerald-400", rowClass: "bg-emerald-500/[0.035]" },
  { key: "recent", label: "< 30 days", shortLabel: "<30d", dotClass: "bg-lime-400", rowClass: "bg-lime-500/[0.03]" },
  { key: "aging", label: "< 90 days", shortLabel: "<90d", dotClass: "bg-amber-400", rowClass: "bg-amber-500/[0.03]" },
  { key: "old", label: "< 1 year", shortLabel: "<1y", dotClass: "bg-orange-400", rowClass: "bg-orange-500/[0.03]" },
  { key: "ancient", label: ">= 1 year", shortLabel: "1y+", dotClass: "bg-rose-400", rowClass: "bg-rose-500/[0.03]" },
  { key: "unknown", label: "Unknown age", shortLabel: "?", dotClass: "bg-muted-foreground", rowClass: "bg-muted/10" },
];

export function getBlameHeatBucket(value, now = Date.now()) {
  const timestamp = new Date(value ?? "").getTime();
  if (!Number.isFinite(timestamp)) return BLAME_HEAT_BUCKETS.at(-1);
  const age = Math.max(0, Number(now) - timestamp);
  if (age < 7 * DAY) return BLAME_HEAT_BUCKETS[0];
  if (age < 30 * DAY) return BLAME_HEAT_BUCKETS[1];
  if (age < 90 * DAY) return BLAME_HEAT_BUCKETS[2];
  if (age < YEAR) return BLAME_HEAT_BUCKETS[3];
  return BLAME_HEAT_BUCKETS[4];
}
