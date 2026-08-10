import test from "node:test";
import assert from "node:assert/strict";
import { createInitialWorkspaceState, workspaceReducer } from "../src/app/workspace-reducer.js";

function createLoadedState() {
  return workspaceReducer(createInitialWorkspaceState(), {
    type: "session/load-success",
    repositoryPath: "/workspace/repository",
    data: {
      scannedAt: "2026-08-10T10:00:00.000Z",
      repository: { rootPath: "/workspace/repository", name: "repository", currentBranch: "main", dirty: true },
      status: { branch: "main", files: [{ path: "app.js", kind: "changed", index: "M", worktree: "." }] },
      branches: [{ name: "main" }],
      commits: [{ hash: "abc" }],
    },
  });
}

test("workspace operation response updates status without replacing repository context", () => {
  let state = createLoadedState();
  state = workspaceReducer(state, { type: "session/set-view", view: "workspace" });
  state = workspaceReducer(state, {
    type: "session/set-file-history",
    value: { selectedPath: "app.js", selectedHash: "abc", scrollTop: 19 },
  });
  state = workspaceReducer(state, {
    type: "session/workspace-operation-success",
    sessionId: "/workspace/repository",
    data: {
      changed: true,
      paths: ["app.js"],
      operation: "stage",
      transactionId: "session:1",
      repository: { dirty: false },
      status: { branch: "main", files: [{ path: "app.js", kind: "changed", index: "M", worktree: ".", staged: true, unstaged: false }] },
    },
  });

  const session = state.sessions[0];
  assert.equal(session.activeView, "workspace");
  assert.deepEqual(session.ui.fileHistory, { selectedPath: "app.js", selectedHash: "abc", scrollTop: 19 });
  assert.deepEqual(session.snapshot.commits, [{ hash: "abc" }]);
  assert.equal(session.snapshot.repository.dirty, false);
  assert.equal(session.snapshot.status.files[0].staged, true);
  assert.deepEqual(session.ui.lastWorkspaceOperation.paths, ["app.js"]);
  assert.equal(session.ui.lastWorkspaceOperation.transactionId, "session:1");
});

test("workspace operation failures stay local to the session", () => {
  let state = createLoadedState();
  state = workspaceReducer(state, {
    type: "session/workspace-operation-failure",
    sessionId: "/workspace/repository",
    error: { message: "Safe Write is disabled.", code: "READ_ONLY_MODE" },
  });
  assert.deepEqual(state.sessions[0].ui.workspaceOperationError, { message: "Safe Write is disabled.", code: "READ_ONLY_MODE" });
  assert.equal(state.sessions[0].snapshot.status.files[0].index, "M");
});
