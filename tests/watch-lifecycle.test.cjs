const test = require("node:test");
const assert = require("node:assert/strict");
const { RepositoryWatcher } = require("../electron/watch/repository-watcher.cjs");
const { WatchManager } = require("../electron/watch/watch-manager.cjs");

function createFakeWatcher() {
  const listeners = new Map();
  return {
    closed: false,
    options: null,
    on(event, listener) {
      listeners.set(event, listener);
      return this;
    },
    emit(event, ...args) {
      listeners.get(event)?.(...args);
    },
    async close() {
      this.closed = true;
    },
  };
}

function createDependencies(fakeWatcher) {
  return {
    repositoryPath: "/workspace/repository",
    mode: "full",
    debounceMs: 5,
    maxWaitMs: 20,
    resolveRepositoryFn: async () => ({ rootPath: "/workspace/repository", gitDir: "/workspace/repository/.git" }),
    countVisibleFilesFn: async () => 12,
    watchFactory: (_targets, options) => {
      fakeWatcher.options = options;
      return fakeWatcher;
    },
  };
}

test("RepositoryWatcher debounces a burst and emits a coalesced change", async () => {
  const fakeWatcher = createFakeWatcher();
  const changes = [];
  const watcher = new RepositoryWatcher({ ...createDependencies(fakeWatcher), onChange: (event) => changes.push(event) });
  await watcher.start();
  fakeWatcher.emit("all", "change", "/workspace/repository/src/app.js");
  fakeWatcher.emit("all", "change", "/workspace/repository/.git/index");
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, "index");
  assert.deepEqual(changes[0].paths, ["index", "src/app.js"]);
  await watcher.stop();
  assert.equal(fakeWatcher.closed, true);
});

test("RepositoryWatcher clears pending events when it stops", async () => {
  const fakeWatcher = createFakeWatcher();
  const changes = [];
  const watcher = new RepositoryWatcher({ ...createDependencies(fakeWatcher), onChange: (event) => changes.push(event) });
  await watcher.start();
  fakeWatcher.emit("all", "change", "/workspace/repository/src/app.js");
  await watcher.stop();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(changes, []);
});

test("WatchManager owns one watcher per session and disposes it", async () => {
  const fakeWatchers = [];
  const manager = new WatchManager({
    watcherFactory: {
      resolveRepositoryFn: async (repositoryPath) => ({ rootPath: repositoryPath, gitDir: `${repositoryPath}/.git` }),
      countVisibleFilesFn: async () => 1,
      watchFactory: (_targets, options) => {
        const watcher = createFakeWatcher();
        watcher.options = options;
        fakeWatchers.push(watcher);
        return watcher;
      },
    },
  });
  await manager.start({ sessionId: "alpha", repositoryPath: "/repo/alpha", mode: "git-only" });
  await manager.start({ sessionId: "alpha", repositoryPath: "/repo/alpha", mode: "git-only" });
  await manager.start({ sessionId: "beta", repositoryPath: "/repo/beta", mode: "git-only" });
  assert.equal(manager.size, 2);
  assert.equal(fakeWatchers[0].closed, true);
  await manager.stop("alpha");
  await manager.stopAll();
  assert.equal(manager.size, 0);
  assert.equal(fakeWatchers[1].closed, true);
  assert.equal(fakeWatchers[2].closed, true);
});
