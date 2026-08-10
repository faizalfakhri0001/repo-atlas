import test from "node:test";
import assert from "node:assert/strict";
import { countDiffLines, limitDiffHunks, parseUnifiedDiff } from "../src/features/diff/diff-parser.js";
import { clearTokenCache, tokenCacheSize, tokenizeLine, TOKEN_CACHE_SIZE } from "../src/features/diff/syntax-highlighter.js";

test("large diffs retain their model while the renderer can cap visible lines", () => {
  const source = ["@@ -1,5000 +1,5000 @@", ...Array.from({ length: 5000 }, (_, index) => ` line ${index + 1}`)].join("\n");
  const parsed = parseUnifiedDiff(source);

  assert.equal(countDiffLines(parsed.hunks), 5000);
  const visible = limitDiffHunks(parsed.hunks, 500);
  assert.equal(countDiffLines(visible.hunks), 500);
  assert.equal(visible.truncated, true);
  assert.equal(visible.hunks[0].lines.at(-1).text, "line 500");
});

test("syntax tokenization remains bounded for long lines and repeated content", () => {
  clearTokenCache();
  const longLine = "x".repeat(20_001);
  assert.deepEqual(tokenizeLine(longLine, "javascript"), [{ type: "plain", text: longLine }]);

  for (let index = 0; index < TOKEN_CACHE_SIZE + 64; index += 1) tokenizeLine(`const value${index} = ${index};`, "javascript");
  assert.ok(tokenCacheSize() <= TOKEN_CACHE_SIZE);
});
