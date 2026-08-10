import test from "node:test";
import assert from "node:assert/strict";
import { clearTokenCache, tokenCacheSize, tokenizeLine, TOKEN_CACHE_SIZE, TOKENIZE_LIMIT } from "../src/features/diff/syntax-highlighter.js";
import { languageForPath } from "../src/features/diff/language-map.js";

test("languageForPath maps supported extensions and falls back to text", () => {
  assert.equal(languageForPath("src/app.jsx"), "jsx");
  assert.equal(languageForPath("config.yml"), "yaml");
  assert.equal(languageForPath("README.unknown"), "text");
});

test("tokenizeLine returns safe tokens that preserve source text", () => {
  clearTokenCache();
  const source = "const answer = 42; // comment";
  const tokens = tokenizeLine(source, "javascript");

  assert.equal(tokens.map((token) => token.text).join(""), source);
  assert.equal(tokens.some((token) => token.type === "keyword" && token.text === "const"), true);
  assert.equal(tokens.some((token) => token.type === "number" && token.text === "42"), true);
  assert.equal(tokens.some((token) => token.type === "comment"), true);
});

test("tokenizeLine uses bounded plain rendering for very long lines and cache", () => {
  clearTokenCache();
  const longLine = "x".repeat(TOKENIZE_LIMIT + 1);
  assert.deepEqual(tokenizeLine(longLine, "javascript"), [{ type: "plain", text: longLine }]);

  for (let index = 0; index < TOKEN_CACHE_SIZE + 20; index += 1) tokenizeLine(`const value${index} = ${index};`, "javascript");
  assert.ok(tokenCacheSize() <= TOKEN_CACHE_SIZE);
});
