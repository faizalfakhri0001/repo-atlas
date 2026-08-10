import assert from "node:assert/strict";
import test from "node:test";
import { groupSearchResults, scoreFile, scoreText } from "../src/features/search/search-scoring.js";

test("file scoring prefers exact names, prefixes, and path segments", () => {
  const exact = scoreFile({ path: "src/auth/login.js", name: "login.js", extension: "js" }, "login.js");
  const prefix = scoreFile({ path: "src/auth/login-form.js", name: "login-form.js", extension: "js" }, "login");
  const pathSegment = scoreFile({ path: "src/auth/session.js", name: "session.js", extension: "js" }, "auth");
  assert.ok(exact > prefix);
  assert.ok(prefix > pathSegment);
});

test("text scoring is case insensitive and supports fuzzy matches", () => {
  assert.ok(scoreText("Fix Login Session", "login") > 0);
  assert.ok(scoreText("repository", "rps") > 0);
  assert.equal(scoreText("branch", "xyz"), 0);
});

test("groups results with category and overall bounds", () => {
  const results = Array.from({ length: 25 }, (_, index) => ({ type: "file", path: `file-${index}.js`, score: index }));
  results.push({ type: "commit", hash: "a", subject: "login", score: 999 });
  const grouped = groupSearchResults(results, { limitPerType: 20, limit: 10 });
  assert.equal(grouped.groups.file.length, 20);
  assert.equal(grouped.all.length, 10);
  assert.equal(grouped.all[0].type, "commit");
});
