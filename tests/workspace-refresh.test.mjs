import test from "node:test";
import assert from "node:assert/strict";
import {
  createInitialWorkspaceState,
  mergeRepositorySnapshot,
  workspaceReducer,
} from "../src/app/workspace-reducer.js";

function loadedState() {
  let state = createInitialWorkspaceState();
  state = workspaceReducer(state, {
    type: "session/load-success",
    repositoryPath: "/workspace/repository",
    data: {
      scannedAt: "2026-08-10T10:00:00.000Z",
      repository: {
        rootPath: "/workspace/repository",
        name: "repository",
        currentBranch: "main",
        head: "1111111",
        dirty: false,
      },
      status: { branch: "main", oid: "1111111", files: [] },
      branches: [{ name: "main" }],
      commits: [{ hash: "1111111" }],
    },
  });
  return state;
}

test("partial refresh merges only returned data and preserves session context", () => {
  let state = loadedState();
  state = workspaceReducer(state, { type: "session/set-view", view: "files" });
  state = workspaceReducer(state, {
    type: "session/set-file-history",
    value: { selectedPath: "src/app.js", selectedHash: "1111111", scrollTop: 42 },
  });
  state = workspaceReducer(state, {
    type: "session/set-watch-status",
    sessionId: "/workspace/repository",
    status: { strategy: "full", watching: true, active: true },
  });

  const event = { repositoryPath: "/workspace/repository", kind: "worktree", timestamp: 123 };
  state = workspaceReducer(state, {
    type: "session/partial-refresh-success",
    sessionId: "/workspace/repository",
    event,
    parts: ["status"],
    data: {
      scannedAt: "2026-08-10T10:01:00.000Z",
      repository: { currentBranch: "main", head: "1111111", dirty: true },
      status: { branch: "main", oid: "1111111", files: [{ path: "src/app.js", kind: "changed" }] },
    },
  });

  const session = state.sessions[0];
  assert.equal(session.activeView, "files");
  assert.deepEqual(session.ui.fileHistory, { selectedPath: "src/app.js", selectedHash: "1111111", scrollTop: 42 });
  assert.deepEqual(session.ui.watchStatus, { strategy: "full", watching: true, active: true });
  assert.deepEqual(session.ui.lastRepositoryChange, event);
  assert.equal(session.snapshot.repository.name, "repository");
  assert.equal(session.snapshot.repository.dirty, true);
  assert.equal(session.snapshot.scannedAt, "2026-08-10T10:00:00.000Z");
  assert.deepEqual(session.snapshot.branches, [{ name: "main" }]);
  assert.deepEqual(session.snapshot.commits, [{ hash: "1111111" }]);
  assert.deepEqual(session.snapshot.status.files, [{ path: "src/app.js", kind: "changed" }]);
  assert.equal(session.error, null);
});

test("partial refresh failures keep repository data available and expose watcher error state", () => {
  let state = loadedState();
  state = workspaceReducer(state, {
    type: "session/partial-refresh-failure",
    sessionId: "/workspace/repository",
    error: { message: "Git is temporarily unavailable.", code: "GIT_FAILED" },
  });

  assert.equal(state.sessions[0].snapshot.repository.name, "repository");
  assert.deepEqual(state.sessions[0].ui.watchError, { message: "Git is temporarily unavailable.", code: "GIT_FAILED" });
});

test("ref refresh advances the revision timestamp for dependent views", () => {
  let state = loadedState();
  state = workspaceReducer(state, {
    type: "session/partial-refresh-success",
    sessionId: "/workspace/repository",
    parts: ["refs"],
    event: { repositoryPath: "/workspace/repository", kind: "refs", timestamp: 456 },
    data: {
      scannedAt: "2026-08-10T10:02:00.000Z",
      repository: { currentBranch: "main" },
      branches: [{ name: "main" }, { name: "feature" }],
    },
  });

  assert.equal(state.sessions[0].snapshot.scannedAt, "2026-08-10T10:02:00.000Z");
  assert.deepEqual(state.sessions[0].snapshot.branches, [{ name: "main" }, { name: "feature" }]);
});

test("snapshot merge leaves omitted repository sections untouched", () => {
  const snapshot = {
    repository: { rootPath: "/workspace/repository", name: "repository", dirty: false },
    branches: [{ name: "main" }],
  };
  const merged = mergeRepositorySnapshot(snapshot, { repository: { dirty: true } });
  assert.deepEqual(merged, {
    repository: { rootPath: "/workspace/repository", name: "repository", dirty: true },
    branches: [{ name: "main" }],
  });
});
