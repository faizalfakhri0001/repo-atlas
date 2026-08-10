const test = require("node:test");
const assert = require("node:assert/strict");
const { WatchManager } = require("../electron/watch/watch-manager.cjs");

function createFakeWatcher() {
  const listeners = new Map();
  return {
    closed: false,
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

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

test("WatchManager coalesces watcher events inside a workspace transaction", async () => {
  const changes = [];
  const manager = new WatchManager({
    transactionGraceMs: 10,
    onChange: (event) => changes.push(event),
    watcherFactory: {
      resolveRepositoryFn: async () => ({ rootPath: "/repo", gitDir: "/repo/.git" }),
      countVisibleFilesFn: async () => 1,
      watchFactory: () => createFakeWatcher(),
    },
  });
  await manager.start({ sessionId: "session", repositoryPath: "/repo", mode: "full" });
  const transactionId = manager.beginTransaction("session");
  manager.handleChange("session", { repositoryPath: "/repo", kind: "worktree", paths: ["app.js"], timestamp: 1 });
  manager.handleChange("session", { repositoryPath: "/repo", kind: "index", paths: ["index"], timestamp: 2 });
  await sleep(15);
  assert.deepEqual(changes, []);
  manager.endTransaction("session", transactionId);
  await sleep(30);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].transactionId, transactionId);
  assert.equal(changes[0].kind, "index");
  assert.deepEqual(changes[0].paths, ["app.js", "index"]);
  await manager.stopAll();
});

test("WatchManager rejects concurrent transactions and cancels on stop", async () => {
  const manager = new WatchManager({ transactionGraceMs: 10 });
  const transactionId = manager.beginTransaction("session");
  assert.throws(() => manager.beginTransaction("session"), /already in progress/);
  assert.equal(manager.endTransaction("other", transactionId), false);
  await manager.stop("session");
  assert.equal(manager.transactions.size, 0);
});
