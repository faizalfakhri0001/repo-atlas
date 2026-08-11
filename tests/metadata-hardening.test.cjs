const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const test = require("node:test");
const {
  createEmptyMetadata,
  createRepositoryMetadataStore,
} = require("../electron/repository-metadata.cjs");
const {
  createMetadataFixture,
} = require("./helpers/metadata-fixture.cjs");

const identity = {
  repositoryId: "a".repeat(64),
  commonGitDir: "/Users/example/project/.git",
  lastKnownName: "project",
};
const timestamp = "2026-08-11T04:00:00.000Z";

function savedView(overrides = {}) {
  return {
    id: "view-legacy",
    name: "Legacy commits",
    viewType: "commits",
    configVersion: 1,
    config: { refs: ["main"] },
    pinned: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: null,
    ...overrides,
  };
}

function bookmark(overrides = {}) {
  return {
    id: "bookmark-legacy",
    commitHash: "b".repeat(40),
    label: "Release",
    category: "release",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function note(overrides = {}) {
  return {
    id: "note-legacy",
    targetType: "commit",
    targetId: "c".repeat(40),
    body: "Historical context",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

test("metadata repair keeps valid repository data and discards malformed optional records", async (t) => {
  const valid = createEmptyMetadata(identity, timestamp);
  const fixture = await createMetadataFixture(t, {
    identity,
    primary: {
      ...valid,
      savedViews: [{ id: "broken-view" }],
      bookmarks: "not-an-array",
      notes: [{ id: "broken-note", targetType: "file" }],
      preferences: { heatmap: "invalid", reflog: { actions: ["commit"] } },
      updatedAt: "\u0000",
    },
    now: () => timestamp,
  });

  const result = await fixture.store.load(identity);
  const repaired = JSON.parse(await fs.readFile(fixture.paths.filePath, "utf8"));
  const backup = JSON.parse(await fs.readFile(fixture.paths.backupPath, "utf8"));

  assert.equal(result.source, "primary");
  assert.equal(result.repaired, true);
  assert.ok(result.issues.length >= 4);
  assert.deepEqual(result.metadata.savedViews, []);
  assert.deepEqual(result.metadata.bookmarks, []);
  assert.deepEqual(result.metadata.notes, []);
  assert.deepEqual(result.metadata.preferences, { reflog: { actions: ["commit"] } });
  assert.equal(repaired.version, 2);
  assert.equal(repaired.updatedAt, timestamp);
  assert.equal(backup.updatedAt, "\u0000");
});

test("metadata migration preserves valid legacy records and writes a versioned primary copy", async (t) => {
  const fixture = await createMetadataFixture(t, {
    identity,
    primary: {
      version: 1,
      repository: { rootPath: "/Users/example/project", lastKnownName: "legacy-project" },
      savedViews: [savedView()],
      bookmarks: [bookmark()],
      notes: [note()],
      preferences: { heatmap: { enabled: true } },
      updatedAt: timestamp,
    },
    now: () => timestamp,
  });

  const result = await fixture.store.load(identity);
  const primary = JSON.parse(await fs.readFile(fixture.paths.filePath, "utf8"));
  const backup = JSON.parse(await fs.readFile(fixture.paths.backupPath, "utf8"));

  assert.equal(result.source, "primary");
  assert.equal(result.migrated, true);
  assert.equal(result.metadata.repository.lastKnownName, "legacy-project");
  assert.equal(result.metadata.savedViews[0].id, "view-legacy");
  assert.equal(result.metadata.bookmarks[0].commitHash, "b".repeat(40));
  assert.equal(result.metadata.notes[0].targetId, "c".repeat(40));
  assert.equal(primary.version, 2);
  assert.equal(backup.version, 1);
});

test("saved-view references and bookmarks remain safe when their Git objects are gone", async () => {
  const { getMissingSavedViewReferences } = await import("../src/features/saved-views/saved-view-model.js");
  const { findOrphanBookmarks, normalizeBookmarks } = await import("../src/features/local-metadata/local-metadata-model.js");
  const availableHash = "d".repeat(40);
  const orphanHash = "e".repeat(40);
  const bookmarks = normalizeBookmarks([
    { id: "available", commitHash: availableHash },
    { id: "orphan", commitHash: orphanHash },
  ]);

  assert.deepEqual(findOrphanBookmarks(bookmarks, [availableHash]).map((item) => item.id), ["orphan"]);
  assert.deepEqual(
    getMissingSavedViewReferences(
      { viewType: "commits", config: { refs: ["main", "refs/heads/release", "refs/tags/v1", "missing"] } },
      {
        repository: { currentBranch: "main" },
        branches: [{ name: "release", ref: "refs/heads/release" }],
        tags: [{ name: "v1", ref: "refs/tags/v1" }],
      },
    ),
    ["missing"],
  );
});

test("metadata path remains scoped to a repository identity", async (t) => {
  const userDataPath = await fs.mkdtemp(require("node:path").join(require("node:os").tmpdir(), "repo-atlas-metadata-scope-"));
  t.after(() => fs.rm(userDataPath, { recursive: true, force: true }));
  const store = createRepositoryMetadataStore({ userDataPath, now: () => timestamp });
  const otherIdentity = { ...identity, repositoryId: "f".repeat(64), commonGitDir: "/Users/example/other/.git" };

  await store.save(createEmptyMetadata(identity, timestamp));
  await store.save({ ...createEmptyMetadata(otherIdentity, timestamp), preferences: { worktree: { showAll: true } } });

  const first = await store.load(identity);
  const second = await store.load(otherIdentity);
  assert.deepEqual(first.metadata.preferences, {});
  assert.deepEqual(second.metadata.preferences, { worktree: { showAll: true } });
  assert.notEqual(store.getPaths(identity).filePath, store.getPaths(otherIdentity).filePath);
});
