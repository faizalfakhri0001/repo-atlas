import assert from "node:assert/strict";
import test from "node:test";
import { isHashLike, parseSearchQuery, searchTypesForQuery } from "../src/features/search/query-parser.js";

test("parses free text and quoted qualifiers", () => {
  const query = parseSearchQuery('author:"Ada Lovelace" type:commit login');
  assert.equal(query.text, "login");
  assert.equal(query.author, "Ada Lovelace");
  assert.equal(query.type, "commit");
  assert.deepEqual(query.errors, []);
});

test("keeps unknown qualifiers searchable and reports invalid dates", () => {
  const query = parseSearchQuery("owner:repo after:2026-02-30");
  assert.equal(query.text, "owner:repo");
  assert.equal(query.after, undefined);
  assert.equal(query.errors.length, 1);
});

test("accepts valid date bounds and selected result type", () => {
  const query = parseSearchQuery("path:src/api after:2026-01-01 before:2026-08-01");
  assert.equal(query.path, "src/api");
  assert.equal(query.after, "2026-01-01");
  assert.equal(query.before, "2026-08-01");
  assert.deepEqual(searchTypesForQuery(query, "file"), ["file"]);
  assert.equal(searchTypesForQuery(parseSearchQuery("login")), undefined);
});

test("recognizes only hash-like values with seven to forty hex characters", () => {
  assert.equal(isHashLike("abcdef1"), true);
  assert.equal(isHashLike("ABCDEF1234567"), true);
  assert.equal(isHashLike("abcdef"), false);
  assert.equal(isHashLike("g".repeat(7)), false);
});
