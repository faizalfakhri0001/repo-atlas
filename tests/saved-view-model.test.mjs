import assert from "node:assert/strict";
import test from "node:test";
import {
  configsEqual,
  getCurrentSavedViewSnapshot,
  getMissingSavedViewReferences,
  getSavedViewNavigation,
  savedViewMatchesCurrent,
  validateSavedViewName,
} from "../src/features/saved-views/saved-view-model.js";

test("saved view model keeps only semantic filters and compares them stably", () => {
  const current = getCurrentSavedViewSnapshot({
    activeView: "commits",
    graphRequest: { refs: ["feature/payments"], query: "webhook", focusHash: "ignored", nonce: 3 },
  });
  assert.deepEqual(current, {
    viewType: "commits",
    configVersion: 1,
    config: { refs: ["feature/payments"], search: "webhook" },
  });
  assert.equal(configsEqual({ b: 2, a: 1 }, { a: 1, b: 2 }), true);
  assert.equal(savedViewMatchesCurrent({ viewType: "commits", config: current.config }, current), true);
  assert.equal(validateSavedViewName("  Release review  "), null);
  assert.match(validateSavedViewName(""), /name/i);
});

test("saved view model routes supported configurations and detects missing refs", () => {
  const view = { viewType: "compare", config: { base: "missing", head: "main" } };
  assert.deepEqual(getSavedViewNavigation(view), { view: "compare", payload: { base: "missing", head: "main" } });
  assert.deepEqual(getMissingSavedViewReferences(view, {
    repository: { currentBranch: "main" },
    branches: [{ name: "main", ref: "refs/heads/main" }],
    tags: [],
  }), ["missing"]);
});

test("saved view model gives activity a valid default configuration", () => {
  const current = getCurrentSavedViewSnapshot({ activeView: "activity" });
  assert.deepEqual(current, {
    viewType: "activity",
    configVersion: 1,
    config: { metric: "commits", range: "12m" },
  });
  assert.deepEqual(getSavedViewNavigation({ viewType: "activity", config: current.config }), {
    view: "activity",
    payload: { metric: "commits", range: "12m" },
  });
});
