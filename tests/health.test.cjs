const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildHealthReport,
  parseTrackedFileRows,
  HEALTH_THRESHOLDS,
} = require("../electron/git/analytics/health.cjs");

const NOW = "2026-08-10T00:00:00.000Z";

function baseInput(overrides = {}) {
  return {
    status: { files: [] },
    branches: { defaultBranch: "main", currentBranch: "main", scope: {}, branches: [] },
    analytics: { commits: [], totals: { commits: 0 }, scope: { processedCommits: 0, maxCommits: 10, truncated: false } },
    trackedFiles: { files: [], totalEntries: 0, truncated: false },
    hotspots: { files: [], scope: { eligibleFiles: 0, returnedFiles: 0, truncated: false } },
    ...overrides,
  };
}

test("tracked file parser preserves paths with spaces and reports bounded output", () => {
  const raw = [
    "100644 blob abc123 42\tsrc/main file.js",
    "100644 blob def456 1048576\tdocs/readme.md",
  ].join("\0");
  const result = parseTrackedFileRows(raw, { limit: 1 });
  assert.deepEqual(result.files, [{ path: "src/main file.js", size: 42 }]);
  assert.equal(result.totalEntries, 2);
  assert.equal(result.truncated, true);
});

test("empty repository stays healthy and activity advisory is non-penalizing", () => {
  const report = buildHealthReport(baseInput(), { now: NOW });
  assert.equal(report.score, 100);
  assert.equal(report.grade, "healthy");
  assert.equal(report.signals[0].id, "empty-history");
  assert.equal(report.signals[0].penalty, 0);
  assert.equal(report.categories.activity.status, "healthy");
});

test("conflict penalty is explainable and capped", () => {
  const report = buildHealthReport(baseInput({
    status: { files: Array.from({ length: 7 }, (_, index) => ({ kind: "conflict", path: `src/file-${index}.js` })) },
  }), { now: NOW });
  const conflict = report.signals.find((signal) => signal.id === "working-tree-conflicts");
  assert.equal(conflict.penalty, HEALTH_THRESHOLDS.conflictPenaltyMaximum);
  assert.equal(conflict.severity, "high");
  assert.deepEqual(conflict.action.payload, { view: "workspace", filter: "conflicts" });
  assert.equal(report.score, 80);
  assert.equal(report.grade, "warning");
});

test("branch penalties are capped independently and expose raw branch facts", () => {
  const branches = Array.from({ length: 12 }, (_, index) => ({
    name: `legacy/${index}`,
    remote: false,
    current: false,
    stale: true,
    ageDays: 240,
    behindDefault: 120,
    goneUpstream: true,
  }));
  const report = buildHealthReport(baseInput({ branches: { defaultBranch: "main", currentBranch: "main", branches, scope: {} } }), { now: NOW });
  assert.equal(report.categories.branches.penalty, 30);
  assert.equal(report.facts.staleBranchCount, 12);
  assert.equal(report.facts.behindBranchCount, 12);
  assert.equal(report.facts.goneBranchCount, 12);
  assert.equal(report.score, 70);
  assert.equal(report.categories.branches.status, "attention");
});

test("large tracked files and concentrated hotspots contribute separate explainable penalties", () => {
  const report = buildHealthReport(baseInput({
    trackedFiles: {
      files: [{ path: "assets/archive.bin", size: HEALTH_THRESHOLDS.veryLargeFileBytes }],
      totalEntries: 1,
      truncated: false,
    },
    hotspots: {
      files: [
        { path: "src/auth.js", hotspotBand: "High", hotspotScore: 0.92, ownershipConcentration: 0.91 },
        { path: "src/payments.js", hotspotBand: "High", hotspotScore: 0.84, ownershipConcentration: 0.88 },
      ],
      scope: { eligibleFiles: 2, returnedFiles: 2, truncated: false },
    },
  }), { now: NOW });
  assert.equal(report.categories.repository.penalty, 2);
  assert.equal(report.categories.ownership.penalty, 4);
  assert.equal(report.facts.largeFileCount, 1);
  assert.equal(report.facts.concentratedHotspotCount, 2);
  assert.deepEqual(report.signals.find((signal) => signal.id === "concentrated-hotspots").relatedActions[0].payload, { view: "ownership" });
});

test("health report keeps the same score for the same input and marks truncated sources", () => {
  const input = baseInput({
    analytics: { commits: [{ hash: "a", authoredAt: "2026-08-01T00:00:00.000Z" }], totals: { commits: 1 }, scope: { maxCommits: 1, processedCommits: 1, truncated: true } },
    branches: { defaultBranch: "main", currentBranch: "main", branches: [], scope: { truncated: false } },
  });
  const first = buildHealthReport(input, { now: NOW });
  const second = buildHealthReport(input, { now: NOW });
  assert.equal(first.score, second.score);
  assert.deepEqual(first.categories, second.categories);
  assert.equal(first.scope.sourceTruncated, true);
  assert.equal(first.scope.analytics.truncated, true);
});
