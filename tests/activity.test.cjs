const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildActivityReport,
  calculateQuantileLevel,
  dateKeyFromTimestamp,
  normalizeActivityOptions,
} = require("../electron/git/analytics/activity.cjs");

const authors = new Map([
  ["email:ada@example.test", { key: "email:ada@example.test", name: "Ada", email: "ada@example.test", commits: 2, additions: 8, deletions: 2, churn: 10 }],
  ["email:grace@example.test", { key: "email:grace@example.test", name: "Grace", email: "grace@example.test", commits: 1, additions: 1, deletions: 1, churn: 2 }],
]);

const index = {
  repositoryKey: "/repo",
  head: "a".repeat(40),
  scope: { maxCommits: 10000, processedCommits: 3, truncated: false, filesTruncated: false },
  authors,
  commits: [
    {
      hash: "a".repeat(40),
      authoredAt: "2026-08-01T23:30:00-04:00",
      author: { key: "email:ada@example.test", name: "Ada", email: "ada@example.test" },
      files: [{ path: "src/api/payments.js", additions: 5, deletions: 1 }],
    },
    {
      hash: "b".repeat(40),
      authoredAt: "2026-08-02T10:00:00Z",
      author: { key: "email:ada@example.test", name: "Ada", email: "ada@example.test" },
      files: [{ path: "src/api/orders.js", additions: 3, deletions: 1 }, { path: "docs/setup.md", additions: 20, deletions: 0 }],
    },
    {
      hash: "c".repeat(40),
      authoredAt: "2026-08-04T12:00:00Z",
      author: { key: "email:grace@example.test", name: "Grace", email: "grace@example.test" },
      files: [{ path: "electron/main.cjs", additions: 1, deletions: 1 }],
    },
  ],
};

test("activity aggregation normalizes timestamps into the requested local calendar", () => {
  assert.equal(dateKeyFromTimestamp("2026-08-01T23:30:00-04:00", "America/New_York"), "2026-08-01");
  assert.equal(dateKeyFromTimestamp("2026-08-01T23:30:00-04:00", "UTC"), "2026-08-02");
  const report = buildActivityReport(index, { range: "all", metric: "commits", now: "2026-08-04T23:00:00Z", timeZone: "UTC" });
  assert.equal(report.timezonePolicy, "user-local calendar day");
  assert.deepEqual(report.buckets.filter((bucket) => bucket.commits > 0).map((bucket) => [bucket.date, bucket.commits]), [
    ["2026-08-02", 2],
    ["2026-08-04", 1],
  ]);
  assert.equal(report.stats.activeDays, 2);
  assert.equal(report.stats.totalCommits, 3);
  assert.equal(report.stats.peakDay.date, "2026-08-02");
});

test("activity aggregation applies author and path filters and reports churn", () => {
  const report = buildActivityReport(index, {
    range: "all",
    metric: "churn",
    author: "email:ada@example.test",
    pathPrefix: "src/api/",
    now: "2026-08-04T23:00:00Z",
    timeZone: "UTC",
  });
  assert.equal(report.stats.totalCommits, 2);
  assert.equal(report.stats.totalChurn, 10);
  assert.deepEqual(report.buckets.filter((bucket) => bucket.churn > 0).map((bucket) => [bucket.date, bucket.churn]), [["2026-08-02", 10]]);
  assert.equal(report.scope.sourceTruncated, false);
});

test("activity options and quantile levels stay bounded", () => {
  assert.equal(normalizeActivityOptions({ range: "2y", metric: "churn", timeZone: "UTC" }).range, "2y");
  assert.throws(() => normalizeActivityOptions({ pathPrefix: "../outside" }), /inside the repository|relative/);
  assert.deepEqual([1, 2, 4, 8].map((value) => calculateQuantileLevel(value, [1, 2, 4, 8])), [1, 2, 3, 4]);
});
