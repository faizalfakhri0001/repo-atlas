const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MetadataValidationError,
  createEmptyMetadata,
  normalizeMetadata,
} = require("../electron/repository-metadata.cjs");

const identity = {
  repositoryId: "a".repeat(64),
  commonGitDir: "/Users/example/project/.git",
  lastKnownName: "project",
};
const timestamps = {
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T01:00:00.000Z",
};
const storedRepository = {
  id: identity.repositoryId,
  commonGitDir: identity.commonGitDir,
  lastKnownName: identity.lastKnownName,
};

function savedView(overrides = {}) {
  return {
    id: "view-1",
    name: "Recent commits",
    viewType: "commits",
    configVersion: 1,
    config: { order: "date", search: "payment" },
    pinned: true,
    ...timestamps,
    lastOpenedAt: null,
    ...overrides,
  };
}

function bookmark(overrides = {}) {
  return {
    id: "bookmark-1",
    commitHash: "b".repeat(40),
    label: "Release",
    category: "release",
    ...timestamps,
    ...overrides,
  };
}

function note(overrides = {}) {
  return {
    id: "note-1",
    targetType: "commit",
    targetId: "c".repeat(40),
    title: "Context",
    body: "This commit starts the migration.",
    ...timestamps,
    ...overrides,
  };
}

test("createEmptyMetadata returns the version 2 repository contract", () => {
  const metadata = createEmptyMetadata(identity, "2026-08-11T02:00:00.000Z");

  assert.deepEqual(metadata, {
    version: 2,
    repository: {
      id: identity.repositoryId,
      commonGitDir: identity.commonGitDir,
      lastKnownName: identity.lastKnownName,
    },
    savedViews: [],
    bookmarks: [],
    notes: [],
    preferences: {},
    updatedAt: "2026-08-11T02:00:00.000Z",
  });
});

test("normalizeMetadata keeps valid records and drops malformed optional entries", () => {
  const result = normalizeMetadata(
    {
      version: 2,
      repository: storedRepository,
      savedViews: [savedView(), { id: "broken" }],
      bookmarks: [bookmark(), { id: "broken", commitHash: "not-a-hash" }],
      notes: [note(), { id: "broken", targetType: "file" }],
      preferences: {
        heatmap: { enabled: true },
        reflog: "invalid",
      },
      updatedAt: timestamps.updatedAt,
    },
    identity,
  );

  assert.equal(result.migrated, false);
  assert.equal(result.metadata.savedViews.length, 1);
  assert.equal(result.metadata.bookmarks.length, 1);
  assert.equal(result.metadata.notes.length, 1);
  assert.deepEqual(result.metadata.preferences, { heatmap: { enabled: true } });
  assert.ok(result.issues.length >= 3);
});

test("normalizeMetadata migrates path-scoped version 1 data to the shared identity", () => {
  const result = normalizeMetadata(
    {
      version: 1,
      repository: {
        rootPath: "/Users/example/project",
        lastKnownName: "legacy-project",
      },
      views: [savedView({ id: "legacy-view" })],
      bookmarks: [bookmark({ id: "legacy-bookmark" })],
      notes: [note({ id: "legacy-note" })],
      updatedAt: timestamps.updatedAt,
    },
    identity,
    "2026-08-11T03:00:00.000Z",
  );

  assert.equal(result.migrated, true);
  assert.equal(result.metadata.version, 2);
  assert.deepEqual(result.metadata.repository, {
    id: identity.repositoryId,
    commonGitDir: identity.commonGitDir,
    lastKnownName: "legacy-project",
  });
  assert.equal(result.metadata.savedViews[0].id, "legacy-view");
  assert.equal(result.metadata.bookmarks[0].id, "legacy-bookmark");
  assert.equal(result.metadata.notes[0].id, "legacy-note");
  assert.equal(result.metadata.updatedAt, timestamps.updatedAt);
});

test("normalizeMetadata rejects metadata from another repository", () => {
  assert.throws(
    () => normalizeMetadata({ ...createEmptyMetadata({ ...identity, repositoryId: "d".repeat(64) }) }, identity),
    (error) => error instanceof MetadataValidationError && error.code === "METADATA_INVALID",
  );
});

test("normalizeMetadata rejects unsupported roots instead of treating them as usable data", () => {
  assert.throws(
    () => normalizeMetadata({ version: 99, repository: identity }, identity),
    (error) => error instanceof MetadataValidationError && error.code === "METADATA_INVALID",
  );
});
