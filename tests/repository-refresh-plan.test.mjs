import assert from "node:assert/strict";
import test from "node:test";
import { getRepositoryRefreshPlan, mergeRepositoryRefreshPlans } from "../src/app/repository-refresh-plan.js";

test("repository refresh plans keep worktree changes targeted", () => {
  assert.deepEqual(getRepositoryRefreshPlan("worktree"), { parts: ["status", "worktrees"], invalidates: [] });
  assert.deepEqual(getRepositoryRefreshPlan("index"), { parts: ["status"], invalidates: [] });
  assert.deepEqual(getRepositoryRefreshPlan("head"), { parts: ["head"], invalidates: ["blame-head", "search-commits"] });
});

test("repository refresh plans invalidate ref-dependent analytics", () => {
  assert.deepEqual(getRepositoryRefreshPlan("refs"), {
    parts: ["refs"],
    invalidates: ["analytics", "branch-intelligence", "health"],
  });
  assert.deepEqual(mergeRepositoryRefreshPlans([getRepositoryRefreshPlan("refs"), getRepositoryRefreshPlan("operation-state")]), {
    parts: ["refs", "status", "state"],
    invalidates: ["analytics", "branch-intelligence", "health"],
  });
});
