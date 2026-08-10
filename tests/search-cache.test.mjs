import assert from "node:assert/strict";
import test from "node:test";
import { SearchCache } from "../src/features/search/search-cache.js";

test("search cache is bounded and invalidated by repository revision", () => {
  const cache = new SearchCache(2);
  cache.setRevision("repo:head-a");
  cache.set("one", 1);
  cache.set("two", 2);
  cache.set("three", 3);
  assert.equal(cache.get("one", "repo:head-a"), null);
  assert.equal(cache.get("two", "repo:head-a"), 2);
  assert.equal(cache.size, 2);

  cache.setRevision("repo:head-b");
  assert.equal(cache.get("two", "repo:head-b"), null);
});
