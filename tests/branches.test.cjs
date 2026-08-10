const test = require("node:test");
const assert = require("node:assert/strict");

const { parseBranchRows, resolveDefaultBranch } = require("../electron/git/analytics/branches.cjs");

test("default branch resolution records a remote source when origin/HEAD is available", () => {
  const result = resolveDefaultBranch({
    branches: [
      { name: "main", remote: false },
      { name: "origin/main", remote: true },
      { name: "feature/demo", remote: false },
    ],
    currentBranch: "feature/demo",
    originHead: "origin/main",
  });

  assert.deepEqual(result, {
    defaultBranch: "main",
    defaultBranchRef: "main",
    defaultBranchSource: "remote",
  });
});

test("default branch resolution falls back to current and then conventional names", () => {
  assert.deepEqual(
    resolveDefaultBranch({ branches: [{ name: "feature/demo", remote: false }], currentBranch: "feature/demo" }),
    { defaultBranch: "feature/demo", defaultBranchRef: "feature/demo", defaultBranchSource: "current" },
  );
  assert.deepEqual(
    resolveDefaultBranch({ branches: [{ name: "master", remote: false }], currentBranch: "Detached HEAD" }),
    { defaultBranch: "master", defaultBranchRef: "master", defaultBranchSource: "fallback" },
  );
});

test("default branch resolution stays unknown when no safe baseline exists", () => {
  assert.deepEqual(resolveDefaultBranch({ branches: [], currentBranch: "Detached HEAD" }), {
    defaultBranch: null,
    defaultBranchRef: null,
    defaultBranchSource: "unknown",
  });
});

test("branch row parsing preserves upstream and current metadata", () => {
  const hash = "a".repeat(40);
  const rows = parseBranchRows(
    [
      ["refs/heads/main", "main", hash, "origin/main", "2026-08-10T10:00:00+00:00", "Repo Atlas", "Initial", "[ahead 2, behind 1]"].join("\0"),
      ["refs/remotes/origin/main", "origin/main", hash, "", "2026-08-10T10:00:00+00:00", "Repo Atlas", "Initial", ""].join("\0"),
    ].join("\n"),
    "main",
  );

  assert.equal(rows.length, 2);
  assert.equal(rows[0].current, true);
  assert.deepEqual({ ahead: rows[0].ahead, behind: rows[0].behind, gone: rows[0].gone }, { ahead: 2, behind: 1, gone: false });
  assert.equal(rows[1].remote, true);
});
