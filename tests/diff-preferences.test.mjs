import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DIFF_PREFERENCES,
  DIFF_PREFERENCES_KEY,
  loadDiffPreferences,
  saveDiffPreferences,
} from "../src/features/diff/diff-preferences.js";

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  };
}

test("diff preferences use safe defaults and persist normalized values", () => {
  const target = storage();
  assert.deepEqual(loadDiffPreferences(target), DEFAULT_DIFF_PREFERENCES);

  saveDiffPreferences({ mode: "split", wrap: 1, syntaxHighlight: false, unknown: true }, target);
  assert.deepEqual(loadDiffPreferences(target), { mode: "split", wrap: false, syntaxHighlight: false });
  assert.equal(target.values.has(DIFF_PREFERENCES_KEY), true);
});

test("diff preferences recover from malformed storage", () => {
  const target = storage({ [DIFF_PREFERENCES_KEY]: "{bad" });
  assert.deepEqual(loadDiffPreferences(target), DEFAULT_DIFF_PREFERENCES);
});
