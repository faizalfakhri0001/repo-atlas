import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateActivity,
  buildCalendarColumns,
  calculateQuantileLevel,
  dateKeyFromTimestamp,
} from "../src/features/activity/activity-model.js";

const commits = [
  {
    hash: "a".repeat(40),
    authoredAt: "2026-08-01T23:30:00-04:00",
    author: { key: "email:ada@example.test", name: "Ada", email: "ada@example.test" },
    subject: "Add payments",
    files: [{ path: "src/api/payments.js", additions: 5, deletions: 1 }],
  },
  {
    hash: "b".repeat(40),
    authoredAt: "2026-08-02T10:00:00Z",
    author: { key: "email:ada@example.test", name: "Ada", email: "ada@example.test" },
    subject: "Add orders",
    files: [{ path: "src/api/orders.js", additions: 3, deletions: 1 }],
  },
  {
    hash: "c".repeat(40),
    authoredAt: "2026-08-04T12:00:00Z",
    author: { key: "email:grace@example.test", name: "Grace", email: "grace@example.test" },
    subject: "Update docs",
    files: [{ path: "docs/setup.md", additions: 1, deletions: 1 }],
  },
];

test("renderer activity model uses the selected local calendar and filters", () => {
  assert.equal(dateKeyFromTimestamp("2026-08-01T23:30:00-04:00", "UTC"), "2026-08-02");
  const report = aggregateActivity(commits, { range: "all", metric: "churn", author: "email:ada@example.test", pathPrefix: "src/api", now: "2026-08-04T23:00:00Z", timeZone: "UTC" });
  assert.equal(report.stats.totalCommits, 2);
  assert.equal(report.stats.totalChurn, 10);
  assert.deepEqual(report.buckets.filter((bucket) => bucket.commits > 0).map((bucket) => bucket.date), ["2026-08-02"]);
  assert.equal(report.timezonePolicy, "user-local calendar day");
  assert.equal(report.buckets.find((bucket) => bucket.commits > 0).entries[0].subject, "Add payments");
});

test("renderer activity model retains empty days and calendar columns", () => {
  const report = aggregateActivity(commits, { range: "all", metric: "commits", now: "2026-08-04T23:00:00Z", timeZone: "UTC" });
  assert.equal(report.stats.longestInactiveStreak, 1);
  assert.ok(report.buckets.some((bucket) => bucket.commits === 0));
  assert.ok(buildCalendarColumns(report.buckets).every((column) => column.days.length === 7));
  assert.deepEqual([1, 2, 4, 8].map((value) => calculateQuantileLevel(value, [1, 2, 4, 8])), [1, 2, 3, 4]);
});
