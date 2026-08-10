import assert from "node:assert/strict";
import test from "node:test";
import { createDemoApi } from "../src/lib/demo.js";

test("demo API provides bounded analytics file and author data", async () => {
  const api = createDemoApi();
  const response = await api.analyticsSummary({ maxCommits: 10, limit: 5 });

  assert.equal(response.ok, true);
  assert.equal(response.data.scope.maxCommits, 10);
  assert.equal(response.data.scope.processedCommits, 10);
  assert.equal(response.data.scope.truncated, true);
  assert.ok(response.data.files.length <= 5);
  assert.ok(response.data.authors.length > 0);
  assert.ok(response.data.files.every((file) => Array.isArray(file.authors)));
  assert.equal(response.data.repositoryKey, "/demo/acme-storefront");
});
