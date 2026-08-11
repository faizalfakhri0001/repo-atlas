import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialWorkspaceState,
  workspaceReducer,
} from "../src/app/workspace-reducer.js";

const identity = {
  repositoryId: "a".repeat(64),
  commonGitDir: "/workspace/repository/.git",
};

function open(state, repositoryPath, branch, timestamp) {
  state = workspaceReducer(state, {
    type: "SESSION_OPEN_REQUEST",
    repositoryPath,
    lastActivatedAt: timestamp,
  });
  return workspaceReducer(state, {
    type: "SESSION_OPEN_SUCCESS",
    repositoryPath,
    lastActivatedAt: timestamp + 1,
    data: {
      repository: {
        rootPath: repositoryPath,
        name: "repository",
        currentBranch: branch,
        gitDir: `${repositoryPath}/.git`,
        ...identity,
        isLinkedWorktree: branch !== "main",
      },
      commits: [],
    },
  });
}

test("main and linked worktrees keep separate sessions while sharing repository identity", () => {
  let state = createInitialWorkspaceState();
  state = open(state, "/workspace/repository", "main", 1);
  state = open(state, "/workspace/repository-payment", "feature/payment", 3);

  assert.equal(state.sessions.length, 2);
  assert.deepEqual(
    state.sessions.map((session) => ({
      id: session.id,
      path: session.path,
      repositoryId: session.repositoryId,
      commonGitDir: session.commonGitDir,
      isLinkedWorktree: session.isLinkedWorktree,
    })),
    [
      {
        id: "/workspace/repository",
        path: "/workspace/repository",
        repositoryId: identity.repositoryId,
        commonGitDir: identity.commonGitDir,
        isLinkedWorktree: false,
      },
      {
        id: "/workspace/repository-payment",
        path: "/workspace/repository-payment",
        repositoryId: identity.repositoryId,
        commonGitDir: identity.commonGitDir,
        isLinkedWorktree: true,
      },
    ],
  );

  state = workspaceReducer(state, {
    type: "SESSION_OPEN_REQUEST",
    repositoryPath: "/workspace/repository",
    lastActivatedAt: 6,
  });
  assert.equal(state.sessions.length, 2);
  assert.equal(state.activeSessionId, "/workspace/repository");
});
