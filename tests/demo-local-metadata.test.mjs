import assert from "node:assert/strict";
import test from "node:test";
import { createDemoApi } from "../src/lib/demo.js";

function installStorage() {
  const previous = globalThis.localStorage;
  const values = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  });
  return () => {
    if (previous === undefined) delete globalThis.localStorage;
    else Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previous });
  };
}

test("demo mode persists bookmarks and notes locally", async () => {
  const restore = installStorage();
  try {
    const first = createDemoApi();
    const scan = await first.scanRepository();
    const hash = scan.data.repository.head;
    const bookmark = await first.createBookmark({ commitHash: hash, label: "Review", category: "release" });
    assert.equal(bookmark.ok, true);
    const note = await first.createNote({ targetId: hash, title: "Context", body: "Keep this local." });
    assert.equal(note.ok, true);

    const second = createDemoApi();
    assert.equal((await second.listBookmarks()).data.bookmarks[0].label, "Review");
    assert.equal((await second.listNotes()).data.notes[0].body, "Keep this local.");
    assert.equal((await second.deleteBookmark({ id: bookmark.data.bookmark.id })).ok, true);
    assert.equal((await second.deleteNote({ id: note.data.note.id })).ok, true);
  } finally {
    restore();
  }
});
