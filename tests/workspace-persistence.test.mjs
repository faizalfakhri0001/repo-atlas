import test from "node:test";
import assert from "node:assert/strict";
import {
  loadRecentRepositories,
  loadWorkspaceMetadata,
  saveRecentRepositories,
  saveWorkspaceMetadata,
  serializeWorkspaceState,
  upsertRecentRepository,
} from "../src/app/workspace-persistence.js";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("workspace persistence stores only active/open paths and restores them", () => {
  const storage = createStorage();
  const state = {
    activeSessionId: "/workspace/repository",
    sessions: [
      { id: "/workspace/repository", path: "/workspace/repository", snapshot: { commits: ["large"] } },
      { id: "/workspace/other", path: "/workspace/other", snapshot: { commits: ["large"] } },
    ],
  };

  saveWorkspaceMetadata(storage, state);
  assert.deepEqual(loadWorkspaceMetadata(storage), {
    activePath: "/workspace/repository",
    openPaths: ["/workspace/repository", "/workspace/other"],
  });
  assert.deepEqual(serializeWorkspaceState(state), {
    activePath: "/workspace/repository",
    openPaths: ["/workspace/repository", "/workspace/other"],
  });
});

test("recent repositories sort pinned first and preserve pinned entries beyond the eviction limit", () => {
  let recent = [];
  for (let index = 0; index < 20; index += 1) {
    recent = upsertRecentRepository(recent, { path: `/workspace/repo-${index}`, name: `repo-${index}` }, index);
  }
  recent = upsertRecentRepository(recent, { path: "/workspace/pinned", name: "pinned", pinned: true }, 100);
  recent = upsertRecentRepository(recent, { path: "/workspace/new", name: "new" }, 101);

  assert.equal(recent[0].path, "/workspace/pinned");
  assert.ok(recent.some((repository) => repository.path === "/workspace/pinned"));
  assert.equal(recent.length, 20);

  const storage = createStorage();
  saveRecentRepositories(storage, recent);
  assert.deepEqual(loadRecentRepositories(storage), recent);
});
