import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialWorkspaceState,
  workspaceReducer,
} from "../src/app/workspace-reducer.js";
import {
  loadWorkspaceMetadata,
  saveWorkspaceMetadata,
  serializeWorkspaceState,
} from "../src/app/workspace-persistence.js";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function load(state, repositoryPath, name, timestamp) {
  return workspaceReducer(state, {
    type: "SESSION_OPEN_SUCCESS",
    repositoryPath,
    lastActivatedAt: timestamp,
    data: {
      repository: { rootPath: repositoryPath, name, currentBranch: "main", dirty: false },
      commits: [],
    },
  });
}

test("workspace regression keeps navigation state isolated across repository tabs", () => {
  let state = createInitialWorkspaceState();
  state = load(state, "/workspace/alpha", "alpha", 1);
  state = workspaceReducer(state, { type: "SESSION_OPEN_REQUEST", repositoryPath: "/workspace/beta", lastActivatedAt: 2 });
  state = load(state, "/workspace/beta", "beta", 3);

  state = workspaceReducer(state, { type: "session/set-view", sessionId: "/workspace/alpha", view: "commits" });
  state = workspaceReducer(state, {
    type: "session/set-graph-request",
    sessionId: "/workspace/alpha",
    request: { refs: ["feature/alpha"], nonce: 4 },
  });
  state = workspaceReducer(state, {
    type: "session/set-cherry-pick",
    sessionId: "/workspace/alpha",
    value: { hashes: ["a".repeat(40)], nonce: 5 },
  });
  state = workspaceReducer(state, { type: "session/set-view", sessionId: "/workspace/beta", view: "workspace" });
  state = workspaceReducer(state, {
    type: "session/set-compare-init",
    sessionId: "/workspace/beta",
    initial: { base: "main", head: "feature/beta", nonce: 6 },
  });
  state = workspaceReducer(state, {
    type: "session/request-file-selection",
    sessionId: "/workspace/beta",
    path: "src/beta.js",
    nonce: 7,
  });

  const alpha = state.sessions.find((session) => session.id === "/workspace/alpha");
  const beta = state.sessions.find((session) => session.id === "/workspace/beta");
  assert.equal(alpha.activeView, "commits");
  assert.deepEqual(alpha.ui.graphRequest, { refs: ["feature/alpha"], nonce: 4 });
  assert.deepEqual(alpha.ui.cherryPick, { hashes: ["a".repeat(40)], nonce: 5 });
  assert.equal(beta.activeView, "workspace");
  assert.deepEqual(beta.ui.compareInit, { base: "main", head: "feature/beta", nonce: 6 });
  assert.deepEqual(beta.ui.fileSelectionRequest, { path: "src/beta.js", nonce: 7 });

  state = workspaceReducer(state, {
    type: "session/request-file-selection",
    sessionId: "/workspace/alpha",
    path: "src/alpha.js",
    nonce: 8,
    openHistory: true,
  });
  assert.deepEqual(state.sessions.find((session) => session.id === "/workspace/alpha").ui.fileSelectionRequest, {
    path: "src/alpha.js",
    nonce: 8,
    openHistory: true,
  });

  state = workspaceReducer(state, { type: "SESSION_ACTIVATE", sessionId: "/workspace/alpha", lastActivatedAt: 8 });
  assert.equal(state.activeSessionId, "/workspace/alpha");
  assert.equal(state.sessions.find((session) => session.id === "/workspace/beta").activeView, "workspace");

  state = workspaceReducer(state, { type: "SESSION_CLOSE", sessionId: "/workspace/alpha" });
  assert.equal(state.activeSessionId, "/workspace/beta");
  assert.equal(state.sessions.length, 1);
});

test("workspace regression persists only open paths and the active repository", () => {
  let state = createInitialWorkspaceState();
  state = load(state, "/workspace/alpha", "alpha", 10);
  state = workspaceReducer(state, { type: "SESSION_OPEN_REQUEST", repositoryPath: "/workspace/beta", lastActivatedAt: 11 });
  state = load(state, "/workspace/beta", "beta", 12);

  const store = storage();
  saveWorkspaceMetadata(store, state);
  assert.deepEqual(loadWorkspaceMetadata(store), {
    activePath: "/workspace/beta",
    openPaths: ["/workspace/alpha", "/workspace/beta"],
  });
  assert.deepEqual(serializeWorkspaceState(state), {
    activePath: "/workspace/beta",
    openPaths: ["/workspace/alpha", "/workspace/beta"],
  });
});
