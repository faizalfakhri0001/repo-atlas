const test = require("node:test");
const assert = require("node:assert/strict");
const { RepositoryWatcher, resolveWatchStrategy } = require("../electron/watch/repository-watcher.cjs");

function createFakeWatcher() {
  const listeners = new Map();
  return {
    on(event, listener) {
      listeners.set(event, listener);
      return this;
    },
    async close() {},
  };
}

test("smart mode selects full watching below the visible-file threshold", () => {
  assert.deepEqual(resolveWatchStrategy("smart", 49_999), {
    requestedMode: "smart",
    strategy: "full",
    watchGit: true,
    watchWorktree: true,
    polling: false,
    visibleFileCount: 49_999,
    threshold: 50_000,
  });
});

test("smart mode selects Git metadata and polling for large repositories", () => {
  assert.deepEqual(resolveWatchStrategy("smart", 50_001), {
    requestedMode: "smart",
    strategy: "git-only",
    watchGit: true,
    watchWorktree: false,
    polling: true,
    fallbackReason: "large-repository",
    visibleFileCount: 50_001,
    threshold: 50_000,
  });
  assert.equal(resolveWatchStrategy("off", 1).strategy, "off");
  assert.equal(resolveWatchStrategy("git-only", 1).strategy, "git-only");
  assert.equal(resolveWatchStrategy("full", 100_000).strategy, "full");
});

test("polling emits worktree and head changes from a bounded fingerprint", async () => {
  const snapshots = [
    { fingerprint: "one", oid: "a", branch: "main" },
    { fingerprint: "two", oid: "a", branch: "main" },
    { fingerprint: "three", oid: "b", branch: "main" },
  ];
  const changes = [];
  const watcher = new RepositoryWatcher({
    repositoryPath: "/workspace/repository",
    mode: "smart",
    activePollMs: 50,
    inactivePollMs: 100,
    resolveRepositoryFn: async () => ({ rootPath: "/workspace/repository", gitDir: "/workspace/repository/.git" }),
    countVisibleFilesFn: async () => 50_001,
    watchFactory: () => createFakeWatcher(),
    pollStatusFn: async () => snapshots.shift(),
    onChange: (event) => changes.push(event),
  });
  await watcher.start();
  await watcher.pollNow();
  await watcher.pollNow();
  assert.deepEqual(changes.map((event) => event.kind), ["worktree", "head"]);
  await watcher.stop();
});
