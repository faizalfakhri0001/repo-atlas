const test = require("node:test");
const assert = require("node:assert/strict");
const {
  aggregateDirectoryOwnership,
  aggregateFileOwnership,
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
