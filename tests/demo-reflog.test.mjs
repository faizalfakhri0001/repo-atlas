import assert from "node:assert/strict";
import test from "node:test";
import { createDemoApi } from "../src/lib/demo.js";

test("demo mode provides a paginated reflog and on-demand reachability", async () => {
  const api = createDemoApi();
  const firstPage = await api.listReflog({ ref: "HEAD", limit: 3, skip: 0 });
  assert.equal(firstPage.ok, true);
  assert.equal(firstPage.data.entries.length, 3);
  assert.equal(firstPage.data.hasMore, true);
  assert.deepEqual(firstPage.data.entries.map((entry) => entry.index), [0, 1, 2]);
  assert.ok(firstPage.data.entries.some((entry) => entry.action === "checkout"));

  const branchPage = await api.listReflog({ ref: "main", limit: 3 });
  assert.equal(branchPage.ok, true);
  assert.equal(branchPage.data.ref, "refs/heads/main");
  assert.ok(branchPage.data.entries.every((entry) => entry.refName === "refs/heads/main"));

  const reachability = await api.commitReachability({ hash: firstPage.data.entries[0].hash });
  assert.equal(reachability.ok, true);
  assert.equal(reachability.data.hash, firstPage.data.entries[0].hash);
  assert.equal(reachability.data.reachableFromAnyKnownRef, true);
});
