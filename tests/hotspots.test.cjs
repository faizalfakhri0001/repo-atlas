const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateAgeDays,
  calculateChurn,
  calculateCommitFrequency,
  calculateHotspotScore,
  calculateRecencyScore,
  buildHotspotReport,
  collectFileActivity,
  filterGeneratedFiles,
  isGeneratedPath,
  percentileRank,
  scoreHotspotActivity,
} = require("../electron/git/analytics/hotspots.cjs");

test("calculateChurn is the sum of line additions and deletions", () => {
  assert.equal(calculateChurn(14, 6), 20);
  assert.equal(calculateChurn("4", "3"), 7);
  assert.equal(calculateChurn(undefined, 3), 3);
});

test("calculateCommitFrequency counts commits touching a file", () => {
  assert.equal(calculateCommitFrequency({ commits: 8 }), 8);
  assert.equal(calculateCommitFrequency({ commitCount: 5, commits: 8 }), 5);
  assert.equal(calculateCommitFrequency({}), 0);
});

test("calculateRecencyScore follows the deterministic exponential decay", () => {
  const now = "2026-08-10T00:00:00.000Z";
  assert.equal(calculateAgeDays("2026-08-10T00:00:00.000Z", now), 0);
  assert.equal(calculateAgeDays("2026-02-11T00:00:00.000Z", now), 180);
  assert.equal(calculateRecencyScore("2026-08-10T00:00:00.000Z", now), 1);
  assert.ok(Math.abs(calculateRecencyScore("2026-02-11T00:00:00.000Z", now) - Math.exp(-1)) < 1e-12);
  assert.equal(calculateRecencyScore(null, now), 0);
  assert.equal(calculateRecencyScore("2026-09-01T00:00:00.000Z", now), 1);
});

test("percentileRank is bounded and monotonic", () => {
  assert.equal(percentileRank([], 1), 0);
  assert.equal(percentileRank([4], 4), 1);
  assert.equal(percentileRank([1, 2, 3], 1), 0);
  assert.equal(percentileRank([1, 2, 3], 2), 0.5);
  assert.equal(percentileRank([1, 2, 3], 3), 1);
  assert.equal(percentileRank([1, 1, 1], 1), 0);
});

test("scoreHotspotActivity keeps raw metrics and exposes explainable weighted scores", () => {
  const now = "2026-08-10T00:00:00.000Z";
  const scored = scoreHotspotActivity(
    [
      { path: "old.js", commitCount: 1, churn: 1, lastChangedAt: "2025-01-01T00:00:00.000Z" },
      { path: "busy.js", commitCount: 4, churn: 40, lastChangedAt: now },
      { path: "changed.js", commitCount: 2, churn: 8, lastChangedAt: "2026-05-10T00:00:00.000Z" },
    ],
    { now },
  );
  const busy = scored.find((file) => file.path === "busy.js");
  assert.equal(busy.commitCount, 4);
  assert.equal(busy.churn, 40);
  assert.equal(busy.commitFrequencyPercentile, 1);
  assert.equal(busy.churnPercentile, 1);
  assert.equal(busy.recencyScore, 1);
  assert.equal(busy.hotspotScore, 1);
  assert.equal(busy.hotspotPercentile, 1);
  assert.equal(busy.hotspotBand, "High");
  assert.equal(calculateHotspotScore({ commitFrequencyPercentile: 0, churnPercentile: 0, recencyScore: 1 }), 0.2);
  for (const file of scored) {
    assert.ok(file.hotspotScore >= 0 && file.hotspotScore <= 1);
    assert.ok(file.hotspotPercentile >= 0 && file.hotspotPercentile <= 1);
  }
});

test("generated and lock paths are excluded by default but can be included", () => {
  assert.equal(isGeneratedPath("package-lock.json"), true);
  assert.equal(isGeneratedPath("dist/assets/app.min.js"), true);
  assert.equal(isGeneratedPath("vendor/library.js"), true);
  assert.equal(isGeneratedPath("coverage/lcov.info"), true);
  assert.equal(isGeneratedPath("src/app.min.js"), true);
  assert.equal(isGeneratedPath("src/app.js"), false);

  const files = [
    { path: "src/app.js" },
    { path: "dist/app.js" },
    { path: "package-lock.json" },
    { path: "docs/readme.md" },
  ];
  const filtered = filterGeneratedFiles(files, { pathPrefix: "src" });
  assert.deepEqual(filtered.files.map((file) => file.path), ["src/app.js"]);
  assert.equal(filtered.totalFiles, 4);
  assert.equal(filtered.matchedFiles, 1);
  assert.equal(filtered.excludedGeneratedFiles, 0);
  assert.deepEqual(filterGeneratedFiles(files).files.map((file) => file.path), ["src/app.js", "docs/readme.md"]);
  assert.deepEqual(filterGeneratedFiles(files, { includeGenerated: true }).files.map((file) => file.path), files.map((file) => file.path));
});

test("buildHotspotReport bounds output while preserving scope and raw metrics", () => {
  const index = {
    repositoryKey: "/workspace/repository",
    head: "a".repeat(40),
    generatedAt: "2026-08-10T00:00:00.000Z",
    scope: { maxCommits: 10, processedCommits: 10, truncated: false, filesTruncated: false },
    totals: { commits: 10, files: 3, additions: 42, deletions: 8 },
    files: new Map([
      ["src/app.js", { path: "src/app.js", commits: 4, additions: 30, deletions: 5, authors: new Map(), lastChangedAt: "2026-08-10T00:00:00.000Z" }],
      ["src/old.js", { path: "src/old.js", commits: 1, additions: 1, deletions: 1, authors: new Map(), lastChangedAt: "2025-01-01T00:00:00.000Z" }],
      ["package-lock.json", { path: "package-lock.json", commits: 8, additions: 10, deletions: 2, authors: new Map(), lastChangedAt: "2026-08-09T00:00:00.000Z" }],
    ]),
  };

  const report = buildHotspotReport(index, { limit: 1, now: "2026-08-10T00:00:00.000Z" });
  assert.equal(report.files.length, 1);
  assert.equal(report.files[0].path, "src/app.js");
  assert.equal(report.files[0].commitCount, 4);
  assert.equal(report.files[0].churn, 35);
  assert.equal(report.scope.totalFiles, 3);
  assert.equal(report.scope.eligibleFiles, 2);
  assert.equal(report.scope.returnedFiles, 1);
  assert.equal(report.scope.reportTruncated, true);
  assert.equal(report.filters.excludedGeneratedFiles, 1);
  assert.deepEqual(report.metrics.weights, { commitFrequency: 0.45, churn: 0.35, recency: 0.2 });
});

test("collectFileActivity normalizes file metrics from the shared analytics index", () => {
  const index = {
    files: new Map([
      [
        "src/app.js",
        {
          path: "src/app.js",
          commits: 3,
          additions: 12,
          deletions: 4,
          churn: 16,
          firstSeenAt: "2026-01-01T00:00:00Z",
          lastChangedAt: "2026-08-10T00:00:00Z",
          authors: new Map([["email:ada@example.test", { key: "email:ada@example.test", name: "Ada", commits: 3 }]]),
        },
      ],
      ["deleted.js", { path: "deleted.js", commits: 1, additions: 1, deletions: 0, authors: new Map() }],
    ]),
  };

  assert.deepEqual(collectFileActivity(index), [
    {
      path: "src/app.js",
      commitCount: 3,
      commits: 3,
      commitFrequency: 3,
      additions: 12,
      deletions: 4,
      churn: 16,
      authorCount: 1,
      authors: [{ key: "email:ada@example.test", name: "Ada", commits: 3 }],
      firstSeenAt: "2026-01-01T00:00:00Z",
      lastChangedAt: "2026-08-10T00:00:00Z",
    },
    {
      path: "deleted.js",
      commitCount: 1,
      commits: 1,
      commitFrequency: 1,
      additions: 1,
      deletions: 0,
      churn: 1,
      authorCount: 0,
      authors: [],
      firstSeenAt: null,
      lastChangedAt: null,
    },
  ]);
});
