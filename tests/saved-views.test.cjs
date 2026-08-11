const assert = require("node:assert/strict");
const test = require("node:test");
const {
  SAVED_VIEW_CONFIG_VERSION,
  SavedViewValidationError,
  createSavedViewService,
  migrateSavedView,
  normalizeSavedViewConfig,
  normalizeSavedViewRecord,
} = require("../electron/saved-views.cjs");

const identity = {
  repositoryId: "a".repeat(64),
  commonGitDir: "/workspace/repository/.git",
  name: "repository",
};
const clock = (() => {
  let value = 0;
  return () => `2026-08-11T00:00:0${value++}.000Z`;
})();

function view(overrides = {}) {
  return {
    id: "view-1",
    name: "Backend commits",
    viewType: "commits",
    configVersion: SAVED_VIEW_CONFIG_VERSION,
    config: { refs: ["main"], order: "date", search: "payment" },
    pinned: true,
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    lastOpenedAt: null,
    ...overrides,
  };
}

function createMemoryStore() {
  let metadata = {
    version: 2,
    repository: { id: identity.repositoryId, commonGitDir: identity.commonGitDir, lastKnownName: identity.name },
    savedViews: [],
    bookmarks: [],
    notes: [],
    preferences: {},
    updatedAt: "2026-08-11T00:00:00.000Z",
  };
  return {
    async load() {
      return { metadata, source: "primary", warning: null };
    },
    async save(next) {
      metadata = next;
      return metadata;
    },
  };
}

test("per-view schemas accept semantic configuration and reject unknown state", () => {
  assert.deepEqual(normalizeSavedViewConfig("reflog", { ref: "main", actions: ["commit", "checkout"], search: "payment" }), {
    ref: "main",
    actions: ["commit", "checkout"],
    search: "payment",
  });
  assert.deepEqual(normalizeSavedViewConfig("branches", { status: ["stale"], sort: "date", direction: "desc", localOnly: true }), {
    status: ["stale"],
    sort: "date",
    direction: "desc",
    localOnly: true,
  });
  assert.throws(
    () => normalizeSavedViewConfig("commits", { scrollTop: 200, refs: ["main"] }),
    (error) => error instanceof SavedViewValidationError && error.code === "SAVED_VIEW_INVALID",
  );
  assert.throws(
    () => normalizeSavedViewConfig("compare", { base: "main" }),
    (error) => error instanceof SavedViewValidationError && error.code === "SAVED_VIEW_INVALID",
  );
});

test("saved view records enforce names, versions, and timestamps", () => {
  const normalized = normalizeSavedViewRecord(view());
  assert.equal(normalized.configVersion, 1);
  assert.equal(normalized.config.search, "payment");
  assert.equal(normalized.lastOpenedAt, null);
  assert.throws(() => normalizeSavedViewRecord(view({ name: " " })), /name/);
  assert.throws(() => normalizeSavedViewRecord(view({ configVersion: 2 })), /version/);
  assert.deepEqual(migrateSavedView(view({ configVersion: 1 })).config, view().config);
});

test("saved view service persists create, update, rename, pin, and delete operations", async () => {
  const store = createMemoryStore();
  const service = createSavedViewService({
    store,
    resolveRepository: async () => ({ ...identity }),
    now: clock,
    idFactory: () => "view-created",
  });

  const created = await service.createSavedView("/workspace/repository", {
    name: "Payment commits",
    viewType: "commits",
    config: { search: "payment" },
    pinned: true,
  });
  assert.equal(created.savedView.id, "view-created");
  assert.equal(created.savedViews.length, 1);

  const updated = await service.updateSavedView("/workspace/repository", {
    id: "view-created",
    name: "Payment commits updated",
    pinned: false,
    config: { order: "date" },
  });
  assert.equal(updated.savedView.name, "Payment commits updated");
  assert.equal(updated.savedView.pinned, false);
  assert.deepEqual(updated.savedView.config, { order: "date" });

  const opened = await service.updateSavedView("/workspace/repository", {
    id: "view-created",
    lastOpenedAt: "2026-08-11T01:00:00.000Z",
  });
  assert.equal(opened.savedView.lastOpenedAt, "2026-08-11T01:00:00.000Z");

  const deleted = await service.deleteSavedView("/workspace/repository", { id: "view-created" });
  assert.deepEqual(deleted.savedViews, []);
  await assert.rejects(service.deleteSavedView("/workspace/repository", { id: "missing" }), (error) => error.code === "SAVED_VIEW_NOT_FOUND");
});

test("saved view service keeps records scoped by the resolved repository identity", async () => {
  const stores = new Map();
  const store = {
    async load(currentIdentity) {
      const key = currentIdentity.repositoryId;
      if (!stores.has(key)) stores.set(key, { version: 2, repository: { id: key, commonGitDir: currentIdentity.commonGitDir, lastKnownName: currentIdentity.lastKnownName }, savedViews: [], bookmarks: [], notes: [], preferences: {}, updatedAt: "2026-08-11T00:00:00.000Z" });
      return { metadata: stores.get(key), source: "primary", warning: null };
    },
    async save(metadata) {
      stores.set(metadata.repository.id, metadata);
      return metadata;
    },
  };
  const service = createSavedViewService({
    store,
    resolveRepository: async (repositoryPath) => ({
      ...identity,
      repositoryId: repositoryPath === "/workspace/linked" ? "b".repeat(64) : identity.repositoryId,
      commonGitDir: repositoryPath === "/workspace/linked" ? "/workspace/shared/.git" : identity.commonGitDir,
    }),
    idFactory: () => "scoped-view",
  });

  await service.createSavedView("/workspace/repository", { name: "Main", viewType: "commits", config: {}, pinned: true });
  const linked = await service.listSavedViews("/workspace/linked");
  assert.deepEqual(linked.savedViews, []);
});
