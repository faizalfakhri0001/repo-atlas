import test from "node:test";
import assert from "node:assert/strict";
import { resolveHealthNavigation } from "../src/features/health/health-actions.js";

test("health navigation allowlist keeps signal actions read-only and scoped", () => {
  assert.deepEqual(resolveHealthNavigation({ payload: { view: "branches", filter: "stale" } }), { view: "branches", payload: { filter: "stale" } });
  assert.deepEqual(resolveHealthNavigation({ payload: { view: "hotspots", filter: "concentrated" } }), { view: "hotspots", payload: { filter: "concentrated" } });
  assert.deepEqual(resolveHealthNavigation({ payload: { view: "ownership" } }), { view: "ownership", payload: {} });
  assert.equal(resolveHealthNavigation({ payload: { view: "stage-files" } }), null);
  assert.equal(resolveHealthNavigation({ payload: { view: "files", filter: "arbitrary-query" } }).payload.filter, undefined);
});
