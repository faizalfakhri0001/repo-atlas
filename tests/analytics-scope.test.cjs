const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_ANALYTICS_COMMITS,
  MAX_ANALYTICS_COMMITS,
  analyticsReadLimit,
  applyCommitScope,
  limitFilesForCommit,
  normalizeAnalyticsScope,
} = require("../electron/git/analytics/limits.cjs");

test("analytics scope clamps commit requests and reads one extra record for truncation detection", () => {
  assert.deepEqual(normalizeAnalyticsScope(), { maxCommits: DEFAULT_ANALYTICS_COMMITS, maxFilesPerCommit: 5_000 });
  assert.equal(normalizeAnalyticsScope({ maxCommits: 75_000 }).maxCommits, MAX_ANALYTICS_COMMITS);
  assert.equal(normalizeAnalyticsScope({ maxCommits: 0 }).maxCommits, 1);
  assert.equal(analyticsReadLimit(10_000), 10_001);

  const result = applyCommitScope([{ id: 1 }, { id: 2 }, { id: 3 }], { maxCommits: 2 });
  assert.deepEqual(result.commits, [{ id: 1 }, { id: 2 }]);
  assert.equal(result.processedCommits, 2);
  assert.equal(result.truncated, true);
});

test("analytics scope bounds files from a single very large commit", () => {
  const result = limitFilesForCommit([1, 2, 3], 2);
  assert.deepEqual(result.files, [1, 2]);
  assert.equal(result.truncated, true);
});
