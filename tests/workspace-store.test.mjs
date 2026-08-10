import test from "node:test";
import assert from "node:assert/strict";
import {
  createInitialWorkspaceState,
  createRepositorySession,
  workspaceReducer,
} from "../src/app/workspace-reducer.js";

test("workspace reducer keeps repository data and view state inside a session", () => {
  let state = createInitialWorkspaceState();
  state = workspaceReducer(state, {
    type: "session/load-start",
    repositoryPath: "/tmp/storefront",
    lastActivatedAt: 1,
  });

  assert.equal(state.activeSessionId, "/tmp/storefront");
  assert.equal(state.sessions.length, 1);
  assert.equal(state.sessions[0].loading, true);

  const snapshot = {
    repository: { rootPath: "/tmp/storefront", name: "storefront", currentBranch: "main" },
    commits: [],
  };
  state = workspaceReducer(state, {
    type: "session/load-success",
    repositoryPath: "/tmp/storefront",
    data: snapshot,
    lastActivatedAt: 2,
  });
  state = workspaceReducer(state, { type: "session/set-view", view: "compare" });
  state = workspaceReducer(state, {
    type: "session/set-compare-init",
    initial: { base: "main", head: "feature/demo", nonce: 3 },
  });

  const session = state.sessions[0];
  assert.equal(session.snapshot, snapshot);
  assert.equal(session.loading, false);
  assert.equal(session.activeView, "compare");
  assert.deepEqual(session.ui.compareInit, { base: "main", head: "feature/demo", nonce: 3 });
});

test("new sessions start with isolated navigation state", () => {
  const session = createRepositorySession("C:\\work\\repo", 10);
  assert.equal(session.id, "c:\\work\\repo");
  assert.equal(session.name, "repo");
  assert.equal(session.activeView, "overview");
  assert.deepEqual(session.ui, { graphRequest: null, compareInit: null, cherryPick: null });
  assert.equal(session.lastActivatedAt, 10);
});

test("session lifecycle canonicalizes repository roots and prevents duplicate tabs", () => {
  let state = createInitialWorkspaceState();
  state = workspaceReducer(state, {
    type: "SESSION_OPEN_REQUEST",
    repositoryPath: "/workspace/repository/src",
    lastActivatedAt: 1,
  });
  assert.equal(state.sessions[0].status, "loading");

  state = workspaceReducer(state, {
    type: "SESSION_OPEN_SUCCESS",
    repositoryPath: "/workspace/repository/src",
    data: { repository: { rootPath: "/workspace/repository", name: "repository", currentBranch: "main", dirty: true } },
    lastActivatedAt: 2,
  });
  assert.equal(state.sessions.length, 1);
  assert.equal(state.sessions[0].id, "/workspace/repository");
  assert.equal(state.sessions[0].status, "ready");

  state = workspaceReducer(state, {
    type: "SESSION_OPEN_REQUEST",
    repositoryPath: "/workspace/repository",
    lastActivatedAt: 3,
  });
  assert.equal(state.sessions.length, 1);
  assert.equal(state.activeSessionId, "/workspace/repository");
  assert.equal(state.recentRepositories[0].lastOpenedAt, 3);

  state = workspaceReducer(state, {
    type: "SESSION_OPEN_REQUEST",
    repositoryPath: "/workspace/other",
    lastActivatedAt: 4,
  });
  assert.equal(state.sessions.length, 2);
  state = workspaceReducer(state, { type: "SESSION_CLOSE", sessionId: "/workspace/other" });
  assert.equal(state.sessions.length, 1);
  assert.equal(state.activeSessionId, "/workspace/repository");
});

test("repository success updates recent metadata without storing a snapshot in the recent entry", () => {
  let state = createInitialWorkspaceState();
  state = workspaceReducer(state, { type: "SESSION_OPEN_REQUEST", repositoryPath: "/workspace/repository", lastActivatedAt: 10 });
  state = workspaceReducer(state, {
    type: "SESSION_OPEN_SUCCESS",
    repositoryPath: "/workspace/repository",
    lastActivatedAt: 20,
    data: {
      repository: { rootPath: "/workspace/repository", name: "repository", currentBranch: "main", dirty: false },
      commits: [{ hash: "not-persisted" }],
    },
  });

  assert.deepEqual(state.recentRepositories, [
    { path: "/workspace/repository", name: "repository", lastKnownBranch: "main", lastOpenedAt: 20, pinned: false },
  ]);
});

test("workspace restore recreates lightweight sessions and keeps the last active repository", () => {
  const state = workspaceReducer(createInitialWorkspaceState(), {
    type: "WORKSPACE_RESTORE",
    openPaths: ["/workspace/repository", "/workspace/other"],
    activePath: "/workspace/other",
    recentRepositories: [{ path: "/workspace/repository", name: "repository" }],
    lastActivatedAt: 30,
  });

  assert.equal(state.activeSessionId, "/workspace/other");
  assert.deepEqual(
    state.sessions.map(({ id, path, status, loading, snapshot }) => ({ id, path, status, loading, snapshot })),
    [
      { id: "/workspace/repository", path: "/workspace/repository", status: "created", loading: false, snapshot: null },
      { id: "/workspace/other", path: "/workspace/other", status: "created", loading: false, snapshot: null },
    ],
  );
  assert.deepEqual(state.recentRepositories, [{ path: "/workspace/repository", name: "repository" }]);
});
