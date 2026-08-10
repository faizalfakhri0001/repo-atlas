import test from "node:test";
import assert from "node:assert/strict";
import { countDiffLines, parseUnifiedDiff } from "../src/features/diff/diff-parser.js";

test("parseUnifiedDiff returns a normalized model with metadata and line numbers", () => {
  const parsed = parseUnifiedDiff([
    "diff --git a/src/user.js b/src/account.js",
    "similarity index 96%",
    "rename from src/user.js",
    "rename to src/account.js",
    "@@ -2,2 +2,3 @@ export function account()",
    " const active = true;",
    "-return user;",
    "+return account;",
    "+return active;",
  ].join("\n"));

  assert.deepEqual(parsed.meta, [
    "diff --git a/src/user.js b/src/account.js",
    "similarity index 96%",
    "rename from src/user.js",
    "rename to src/account.js",
  ]);
  assert.deepEqual(parsed.hunks[0], {
    header: "@@ -2,2 +2,3 @@ export function account()",
    context: "export function account()",
    oldStart: 2,
    newStart: 2,
    lines: [
      { type: "context", oldLine: 2, newLine: 2, text: "const active = true;" },
      { type: "delete", oldLine: 3, newLine: null, text: "return user;" },
      { type: "add", oldLine: null, newLine: 3, text: "return account;" },
      { type: "add", oldLine: null, newLine: 4, text: "return active;" },
    ],
  });
  assert.equal(countDiffLines(parsed.hunks), 4);
});

test("parseUnifiedDiff keeps empty hunks and no-newline markers safe", () => {
  const parsed = parseUnifiedDiff("@@ -0,0 +1,0 @@\n\\ No newline at end of file");

  assert.equal(parsed.hunks.length, 1);
  assert.deepEqual(parsed.hunks[0].lines, [{ type: "note", oldLine: null, newLine: null, text: "\\ No newline at end of file" }]);
  assert.equal(parseUnifiedDiff("").hunks.length, 0);
});
