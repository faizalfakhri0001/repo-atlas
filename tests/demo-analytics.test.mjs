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

test("demo API provides hotspot metrics and generated-file controls", async () => {
  const api = createDemoApi();
  const response = await api.hotspots({ limit: 3 });

  assert.equal(response.ok, true);
  assert.ok(response.data.files.length <= 3);
  assert.deepEqual(response.data.metrics.weights, { commitFrequency: 0.45, churn: 0.35, recency: 0.2 });
  assert.ok(response.data.files.every((file) => Number.isFinite(file.hotspotScore)));
  assert.ok(response.data.files.every((file) => Number.isFinite(file.commitCount) && Number.isFinite(file.churn)));
  assert.equal(response.data.filters.includeGenerated, false);
});

test("demo API provides bounded ownership tree data for both periods", async () => {
  const api = createDemoApi();
  const allTime = await api.ownership({ period: "all", limit: 10 });
  const recent = await api.ownership({ period: "12m", limit: 10 });

  assert.equal(allTime.ok, true);
  assert.equal(recent.ok, true);
  assert.equal(allTime.data.period, "all");
  assert.equal(recent.data.period, "12m");
  assert.ok(allTime.data.nodes.length > 0);
  assert.ok(allTime.data.summary.primaryContributor);
  assert.ok(allTime.data.nodes.every((node) => Array.isArray(node.topContributors)));
  assert.ok(recent.data.scope.returnedNodes <= 10);
});
