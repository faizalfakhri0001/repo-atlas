import assert from "node:assert/strict";
import test from "node:test";
import { buildLocalMetadataRevisionKey, buildLocalMetadataSearchResults } from "../src/features/search/local-search.js";

const hash = "a".repeat(40);

test("local search covers bookmarks, notes, and saved views without exceeding note snippets", () => {
  const results = buildLocalMetadataSearchResults({
    query: "release",
    bookmarks: [{ id: "bookmark-1", commitHash: hash, label: "Release baseline", category: "release" }],
    notes: [{ id: "note-1", targetType: "commit", targetId: hash, title: "Release context", body: `${"retry ".repeat(30)}details` }],
    savedViews: [{ id: "view-1", name: "Release review", viewType: "commits", config: { search: "release" } }],
  });

  assert.deepEqual(results.map((result) => result.type).sort(), ["bookmark", "note", "saved-view"]);
  assert.ok(results.find((result) => result.type === "bookmark").score > 0);
  const note = results.find((result) => result.type === "note");
  assert.ok(note.body.length <= 120);
  assert.equal(note.note.body.length > note.body.length, true);
});

test("local search can restrict a query to one metadata category and revision keys change with updates", () => {
  const bookmark = { id: "bookmark-1", commitHash: hash, label: "Release baseline", updatedAt: "2026-08-10T00:00:00Z" };
  const first = buildLocalMetadataSearchResults({ query: "release", types: ["bookmark"], bookmarks: [bookmark], notes: [{ id: "note-1", targetType: "commit", targetId: hash, body: "release" }] });
  assert.deepEqual(first.map((result) => result.type), ["bookmark"]);

  const firstKey = buildLocalMetadataRevisionKey({ bookmarks: [bookmark] });
  const secondKey = buildLocalMetadataRevisionKey({ bookmarks: [{ ...bookmark, updatedAt: "2026-08-11T00:00:00Z" }] });
  assert.notEqual(firstKey, secondKey);
});
