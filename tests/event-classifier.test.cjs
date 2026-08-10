const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyGitPath, classifyRepositoryPath, coalesceRepositoryChanges } = require("../electron/watch/event-classifier.cjs");

test("classifyGitPath maps metadata and operation paths to safe event kinds", () => {
  assert.equal(classifyGitPath("HEAD"), "head");
  assert.equal(classifyGitPath("index"), "index");
  assert.equal(classifyGitPath("refs/heads/main"), "refs");
  assert.equal(classifyGitPath("packed-refs"), "refs");
  assert.equal(classifyGitPath("rebase-merge/git-rebase-todo"), "operation-state");
  assert.equal(classifyGitPath("objects/pack/pack-a.idx"), null);
});

test("classifyRepositoryPath keeps repository paths relative and ignores noisy directories", () => {
  const repositoryRoot = "/workspace/repository";
  const gitDir = "/workspace/repository/.git";
  assert.deepEqual(classifyRepositoryPath({ repositoryRoot, gitDir, changedPath: "/workspace/repository/.git/HEAD" }).kind, "head");
  const worktree = classifyRepositoryPath({ repositoryRoot, gitDir, changedPath: "/workspace/repository/src/app.js", eventType: "change" });
  assert.deepEqual({ ...worktree, timestamp: undefined }, {
    repositoryPath: repositoryRoot,
    kind: "worktree",
    paths: ["src/app.js"],
    eventType: "change",
    timestamp: undefined,
  });
  assert.equal(typeof worktree.timestamp, "number");
  assert.equal(classifyRepositoryPath({ repositoryRoot, gitDir, changedPath: "/workspace/repository/node_modules/pkg/index.js" }), null);
  assert.equal(classifyRepositoryPath({ repositoryRoot, gitDir, changedPath: "/tmp/outside.js" }), null);
});

test("coalesceRepositoryChanges chooses the strongest event and deduplicates paths", () => {
  const events = [
    { repositoryPath: "/repo", kind: "worktree", paths: ["src/app.js"], timestamp: 10 },
    { repositoryPath: "/repo", kind: "refs", paths: ["refs/heads/main"], timestamp: 20 },
    { repositoryPath: "/repo", kind: "index", paths: ["index"], timestamp: 30 },
    { repositoryPath: "/repo", kind: "refs", paths: ["refs/heads/main"], timestamp: 40 },
  ];
  assert.deepEqual(coalesceRepositoryChanges(events), {
    repositoryPath: "/repo",
    kind: "refs",
    kinds: ["worktree", "index", "refs"],
    paths: ["index", "refs/heads/main", "src/app.js"],
    timestamp: 40,
  });
});
