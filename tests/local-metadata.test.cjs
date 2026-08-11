const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_BOOKMARK_CATEGORY_LENGTH,
  MAX_BOOKMARK_LABEL_LENGTH,
  MAX_NOTE_BODY_LENGTH,
  MAX_NOTE_TITLE_LENGTH,
  LocalMetadataValidationError,
  createLocalMetadataService,
  normalizeBookmarkRecord,
  normalizeNoteRecord,
} = require("../electron/local-metadata.cjs");

const identity = {
  repositoryId: "a".repeat(64),
  commonGitDir: "/workspace/repository/.git",
  name: "repository",
};

function createMemoryStore(initial = {}) {
  let metadata = {
    version: 2,
    repository: { id: identity.repositoryId, commonGitDir: identity.commonGitDir, lastKnownName: identity.name },
    savedViews: [],
    bookmarks: [],
    notes: [],
    preferences: {},
    updatedAt: "2026-08-11T00:00:00.000Z",
    ...initial,
  };
  return {
    async load() {
      return { metadata, source: "primary", warning: null };
    },
    async save(next) {
      metadata = next;
      return metadata;
    },
    current() {
      return metadata;
    },
  };
}

const repository = { ...identity, rootPath: "/workspace/repository", commonGitDir: identity.commonGitDir };
const commitHash = "a".repeat(40);
const secondCommitHash = "b".repeat(40);

test("local metadata records enforce bookmark and note limits", () => {
  const bookmark = normalizeBookmarkRecord({ id: "bookmark-1", commitHash, label: ` ${"x".repeat(MAX_BOOKMARK_LABEL_LENGTH)} `, category: "release" }, { now: "2026-08-11T00:00:00.000Z" });
  assert.equal(bookmark.label.length, MAX_BOOKMARK_LABEL_LENGTH);
  assert.throws(() => normalizeBookmarkRecord({ id: "bookmark-1", commitHash, category: "x".repeat(MAX_BOOKMARK_CATEGORY_LENGTH + 1) }), LocalMetadataValidationError);

  const note = normalizeNoteRecord({ id: "note-1", targetType: "commit", targetId: commitHash, title: " Context ", body: "body" }, { now: "2026-08-11T00:00:00.000Z" });
  assert.equal(note.title, "Context");
  assert.throws(() => normalizeNoteRecord({ id: "note-1", targetType: "commit", targetId: commitHash, title: "x".repeat(MAX_NOTE_TITLE_LENGTH + 1), body: "body" }), LocalMetadataValidationError);
  assert.throws(() => normalizeNoteRecord({ id: "note-1", targetType: "commit", targetId: commitHash, body: "x".repeat(MAX_NOTE_BODY_LENGTH + 1) }), LocalMetadataValidationError);
});

test("local metadata service persists bookmark and note CRUD without Git writes", async () => {
  const store = createMemoryStore();
  const checkedCommits = [];
  let sequence = 0;
  const service = createLocalMetadataService({
    store,
    resolveRepository: async () => repository,
    commitExists: async (_repository, hash) => checkedCommits.push(hash),
    now: () => "2026-08-11T00:00:01.000Z",
    idFactory: () => `record-${++sequence}`,
  });

  const createdBookmark = await service.createBookmark("/workspace/repository", { commitHash, label: "Important", category: "release" });
  assert.equal(createdBookmark.bookmark.id, "record-1");
  assert.equal(createdBookmark.bookmarks.length, 1);
  const updatedBookmark = await service.updateBookmark("/workspace/repository", { id: "record-1", label: "Updated" });
  assert.equal(updatedBookmark.bookmark.label, "Updated");

  const createdNote = await service.createNote("/workspace/repository", { targetId: commitHash, title: "Why", body: "Keep this context." });
  assert.equal(createdNote.note.id, "record-2");
  const updatedNote = await service.updateNote("/workspace/repository", { id: "record-2", body: "Updated context." });
  assert.equal(updatedNote.note.body, "Updated context.");
  assert.deepEqual(await service.listBookmarks("/workspace/repository").then((result) => result.bookmarks.map((item) => item.id)), ["record-1"]);
  assert.deepEqual(await service.listNotes("/workspace/repository").then((result) => result.notes.map((item) => item.id)), ["record-2"]);

  await service.deleteBookmark("/workspace/repository", { id: "record-1" });
  await service.deleteNote("/workspace/repository", { id: "record-2" });
  assert.deepEqual(store.current().bookmarks, []);
  assert.deepEqual(store.current().notes, []);
  assert.deepEqual(checkedCommits, [commitHash, commitHash]);
});

test("loading orphaned records is allowed, but new or moved targets must resolve", async () => {
  const store = createMemoryStore({
    bookmarks: [{ id: "orphan-bookmark", commitHash: secondCommitHash, label: null, category: null, createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" }],
    notes: [{ id: "orphan-note", targetType: "commit", targetId: secondCommitHash, body: "old context", createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" }],
  });
  const service = createLocalMetadataService({
    store,
    resolveRepository: async () => repository,
    commitExists: async () => { throw new Error("not available"); },
  });

  assert.equal((await service.listBookmarks("/workspace/repository")).bookmarks[0].commitHash, secondCommitHash);
  assert.equal((await service.listNotes("/workspace/repository")).notes[0].targetId, secondCommitHash);
  await assert.rejects(service.createBookmark("/workspace/repository", { commitHash }), /not available/);
  await assert.rejects(service.updateNote("/workspace/repository", { id: "orphan-note", targetId: commitHash }), /not available/);
});
