const test = require("node:test");
const assert = require("node:assert/strict");
const {
  aggregateDirectoryOwnership,
  aggregateFileOwnership,
  aggregateOwnershipByPeriod,
  buildOwnershipReport,
  calculateOwnershipMetrics,
  contributorKey,
  normalizeOwnershipPeriod,
} = require("../electron/git/analytics/ownership.cjs");

test("aggregateFileOwnership normalizes author identities and preserves raw activity", () => {
  const index = {
    files: new Map([
      [
        "src/app.js",
        {
          path: "src/app.js",
          commits: 4,
          additions: 24,
          deletions: 6,
          churn: 30,
          firstSeenAt: "2025-01-01T00:00:00Z",
          lastChangedAt: "2026-08-10T00:00:00Z",
          authors: new Map([
            ["email:faizal@example.test", { name: "Faizal", email: "FAIZAL@EXAMPLE.TEST", commits: 2, additions: 20, deletions: 4, churn: 24, lastChangedAt: "2026-08-10T00:00:00Z" }],
            ["email:sarah@example.test", { name: "Sarah", email: "sarah@example.test", commits: 2, additions: 4, deletions: 2, churn: 6, lastChangedAt: "2026-07-01T00:00:00Z" }],
          ]),
        },
      ],
    ]),
  };

  const files = aggregateFileOwnership(index);
  const app = files.get("src/app.js");
  assert.equal(app.type, "file");
  assert.equal(app.totalCommits, 4);
  assert.equal(app.totalChurn, 30);
  assert.equal(app.contributors.size, 2);
  assert.equal(app.contributors.get("email:faizal@example.test").churn, 24);
  assert.equal(contributorKey({ name: "Faizal", email: "FAIZAL@EXAMPLE.TEST" }), "email:faizal@example.test");
  assert.equal(normalizeOwnershipPeriod("unknown"), "all");
  assert.equal(normalizeOwnershipPeriod("12m"), "12m");
});

test("aggregateDirectoryOwnership sums every file into each ancestor directory", () => {
  const files = aggregateFileOwnership({
    files: new Map([
      ["src/components/a.jsx", { path: "src/components/a.jsx", commits: 2, additions: 5, deletions: 1, authors: new Map([["email:ada@example.test", { name: "Ada", email: "ada@example.test", commits: 2, additions: 5, deletions: 1 }]]) }],
      ["src/components/b.jsx", { path: "src/components/b.jsx", commits: 1, additions: 2, deletions: 0, authors: new Map([["email:grace@example.test", { name: "Grace", email: "grace@example.test", commits: 1, additions: 2, deletions: 0 }]]) }],
      ["src/index.js", { path: "src/index.js", commits: 3, additions: 3, deletions: 2, authors: new Map([["email:ada@example.test", { name: "Ada", email: "ada@example.test", commits: 3, additions: 3, deletions: 2 }]]) }],
    ]),
  });
  const directories = aggregateDirectoryOwnership(files);

  assert.equal(directories.get("src/components").fileCount, 2);
  assert.equal(directories.get("src/components").totalCommits, 3);
  assert.equal(directories.get("src/components").totalChurn, 8);
  assert.equal(directories.get("src").fileCount, 3);
  assert.equal(directories.get("").fileCount, 3);
  assert.equal(directories.get("src/components").contributors.size, 2);
});

test("calculateOwnershipMetrics exposes weighted shares and concentration labels", () => {
  const metrics = calculateOwnershipMetrics({
    path: "src/app.js",
    type: "file",
    totalCommits: 10,
    totalChurn: 100,
    contributors: new Map([
      ["email:ada@example.test", { key: "email:ada@example.test", name: "Ada", email: "ada@example.test", commits: 8, churn: 20 }],
      ["email:grace@example.test", { key: "email:grace@example.test", name: "Grace", email: "grace@example.test", commits: 2, churn: 80 }],
    ]),
  });

  assert.equal(metrics.primaryContributor.name, "Grace");
  assert.equal(metrics.primaryContributor.commitShare, 0.2);
  assert.equal(metrics.primaryContributor.churnShare, 0.8);
  assert.equal(metrics.primaryContributor.ownershipScore, 0.56);
  assert.equal(metrics.top1Share, 0.56);
  assert.equal(metrics.top2Share, 1);
  assert.equal(metrics.concentration, 0.56);
  assert.equal(metrics.concentrationLabel, "Distributed");

  const single = calculateOwnershipMetrics({ totalCommits: 1, totalChurn: 0, contributors: new Map([["name:ada", { key: "name:ada", name: "Ada", commits: 1, churn: 0 }]]) });
  assert.equal(single.primaryContributor.ownershipScore, 1);
  assert.equal(single.concentrationLabel, "Highly concentrated");
});

test("aggregateOwnershipByPeriod keeps all-time and last twelve months data separate", () => {
  const index = {
    files: new Map([
      ["src/app.js", { path: "src/app.js", commits: 2, additions: 10, deletions: 2, authors: new Map([
        ["email:old@example.test", { name: "Old", email: "old@example.test", commits: 1, additions: 5, deletions: 1 }],
        ["email:new@example.test", { name: "New", email: "new@example.test", commits: 1, additions: 5, deletions: 1 }],
      ]) }],
    ]),
    commits: [
      { authoredAt: "2025-01-01T00:00:00Z", author: { name: "Old", email: "old@example.test" }, files: [{ path: "src/app.js", additions: 5, deletions: 1 }] },
      { authoredAt: "2026-08-01T00:00:00Z", author: { name: "New", email: "new@example.test" }, files: [{ path: "src/app.js", additions: 5, deletions: 1 }] },
    ],
  };

  const allTime = aggregateOwnershipByPeriod(index, { period: "all" }).get("src/app.js");
  const recent = aggregateOwnershipByPeriod(index, { period: "12m", now: "2026-08-10T00:00:00Z" }).get("src/app.js");
  assert.equal(allTime.totalCommits, 2);
  assert.equal(allTime.contributors.size, 2);
  assert.equal(recent.totalCommits, 1);
  assert.equal(recent.totalChurn, 6);
  assert.deepEqual([...recent.contributors.keys()], ["email:new@example.test"]);
});

test("buildOwnershipReport returns bounded directory children and a repository summary", () => {
  const report = buildOwnershipReport({
    repositoryKey: "/workspace/repository",
    head: "a".repeat(40),
    scope: { processedCommits: 4, truncated: false },
    files: new Map([
      ["src/components/a.jsx", { path: "src/components/a.jsx", commits: 2, additions: 5, deletions: 1, authors: new Map([["email:ada@example.test", { name: "Ada", email: "ada@example.test", commits: 2, additions: 5, deletions: 1 }]]) }],
      ["src/index.js", { path: "src/index.js", commits: 1, additions: 3, deletions: 0, authors: new Map([["email:grace@example.test", { name: "Grace", email: "grace@example.test", commits: 1, additions: 3, deletions: 0 }]]) }],
    ]),
  }, { path: "src", limit: 10 });

  assert.equal(report.path, "src");
  assert.equal(report.summary.name, "Repository");
  assert.deepEqual(report.nodes.map((node) => [node.type, node.path]), [["directory", "src/components"], ["file", "src/index.js"]]);
  assert.equal(report.nodes[0].primaryContributor.name, "Ada");
  assert.equal(report.scope.totalFiles, 2);
  assert.equal(report.scope.returnedNodes, 2);
});
