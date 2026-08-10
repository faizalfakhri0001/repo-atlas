const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateChurn, collectFileActivity } = require("../electron/git/analytics/hotspots.cjs");

test("calculateChurn is the sum of line additions and deletions", () => {
  assert.equal(calculateChurn(14, 6), 20);
  assert.equal(calculateChurn("4", "3"), 7);
  assert.equal(calculateChurn(undefined, 3), 3);
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
