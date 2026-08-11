import assert from "node:assert/strict";
import test from "node:test";
import { createDemoApi } from "../src/lib/demo.js";

test("demo API exposes repository activity with bounded day detail", async () => {
  const api = createDemoApi();
  const response = await api.activity({ range: "12m", metric: "commits", timeZone: "UTC" });
  assert.equal(response.ok, true);
  assert.equal(response.data.range, "12m");
  assert.ok(response.data.buckets.length >= 365);
  assert.ok(response.data.stats.totalCommits > 0);
  assert.ok(response.data.buckets.some((bucket) => bucket.entries.length > 0));
  assert.ok(response.data.buckets.every((bucket) => bucket.entries.length <= 50));
  assert.equal(response.data.timezonePolicy, "user-local calendar day");

  const author = response.data.authors[0]?.key;
  assert.ok(author);
  const filtered = await api.activity({ range: "all", metric: "churn", author, timeZone: "UTC" });
  assert.equal(filtered.ok, true);
  assert.ok(filtered.data.stats.totalCommits > 0);
  assert.ok(filtered.data.stats.totalChurn >= 0);
});
