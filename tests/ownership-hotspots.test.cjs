const test = require("node:test");
const assert = require("node:assert/strict");
const { buildHotspotReport } = require("../electron/git/analytics/hotspots.cjs");

test("hotspot report includes explainable ownership context without changing hotspot score", () => {
  const report = buildHotspotReport({
    repositoryKey: "/workspace/repository",
    head: "a".repeat(40),
    scope: { processedCommits: 2, truncated: false },
    files: new Map([
      ["src/app.js", {
        path: "src/app.js",
        commits: 2,
        additions: 10,
        deletions: 0,
        authors: new Map([
          ["email:ada@example.test", { name: "Ada", email: "ada@example.test", commits: 2, additions: 10, deletions: 0, churn: 10 }],
        ]),
        lastChangedAt: "2026-08-10T00:00:00.000Z",
      }],
    ]),
  }, { now: "2026-08-10T00:00:00.000Z" });

  assert.equal(report.files[0].hotspotScore, 1);
  assert.equal(report.files[0].ownershipScore, 1);
  assert.equal(report.files[0].ownershipConcentration, 1);
  assert.equal(report.files[0].primaryContributor.name, "Ada");
  assert.equal(report.files[0].topContributors[0].ownershipScore, 1);
});
