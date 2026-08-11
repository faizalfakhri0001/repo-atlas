import assert from "node:assert/strict";
import test from "node:test";
import {
  findOrphanBookmarks,
  getBookmarkedHashes,
  getBookmarkForCommit,
  getNoteForCommit,
  normalizeBookmarks,
  normalizeNotes,
} from "../src/features/local-metadata/local-metadata-model.js";

const firstHash = "A".repeat(40);
const secondHash = "b".repeat(40);

test("local metadata model normalizes commit references and finds related records", () => {
  const bookmarks = normalizeBookmarks([{ id: "bookmark-1", commitHash: firstHash, label: "Release", category: "release" }]);
  const notes = normalizeNotes([{ id: "note-1", targetType: "commit", targetId: firstHash, body: "context" }]);
  assert.equal(getBookmarkForCommit(bookmarks, firstHash.toLowerCase()).id, "bookmark-1");
  assert.equal(getNoteForCommit(notes, firstHash.toLowerCase()).id, "note-1");
  assert.deepEqual([...getBookmarkedHashes(bookmarks)], [firstHash.toLowerCase()]);
});

test("orphan bookmarks remain available when their commit is absent", () => {
  const bookmarks = normalizeBookmarks([
    { id: "bookmark-1", commitHash: firstHash },
    { id: "bookmark-2", commitHash: secondHash },
  ]);
  assert.deepEqual(findOrphanBookmarks(bookmarks, [firstHash]), [bookmarks[1]]);
});
