const test = require("node:test");
const assert = require("node:assert/strict");
const { BlameCache } = require("../electron/git/blame-cache.cjs");

test("BlameCache is bounded and evicts the least recently used entry", () => {
  const cache = new BlameCache(2);
  cache.set("/repo", "a", "one.js", { value: 1 });
  cache.set("/repo", "a", "two.js", { value: 2 });
  assert.deepEqual(cache.get("/repo", "a", "one.js"), { value: 1 });
  cache.set("/repo", "a", "three.js", { value: 3 });
  assert.equal(cache.get("/repo", "a", "two.js"), undefined);
  assert.equal(cache.size, 2);
  assert.deepEqual(cache.get("/repo", "a", "one.js"), { value: 1 });
  assert.deepEqual(cache.get("/repo", "a", "three.js"), { value: 3 });
});

test("BlameCache invalidates stale revisions only for the requested repository", () => {
  const cache = new BlameCache(10);
  cache.set("/repo", "old", "app.js", { value: "old" });
  cache.set("/repo", "new", "app.js", { value: "new" });
  cache.set("/other", "old", "app.js", { value: "other" });
  cache.invalidateHead("/repo", "new");
  assert.equal(cache.get("/repo", "old", "app.js"), undefined);
  assert.deepEqual(cache.get("/repo", "new", "app.js"), { value: "new" });
  assert.deepEqual(cache.get("/other", "old", "app.js"), { value: "other" });
});
