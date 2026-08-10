const { RepositoryWatcher } = require("./repository-watcher.cjs");
const { coalesceRepositoryChanges } = require("./event-classifier.cjs");

const DEFAULT_TRANSACTION_GRACE_MS = 1_750;

class WatchManager {
  constructor({ onChange = () => {}, onError = () => {}, onStatus = () => {}, watcherFactory = {}, transactionGraceMs = DEFAULT_TRANSACTION_GRACE_MS } = {}) {
    this.onChange = onChange;
    this.onError = onError;
    this.onStatus = onStatus;
    this.watcherFactory = watcherFactory;
    this.transactionGraceMs = transactionGraceMs;
    this.transactionCounter = 0;
    this.transactions = new Map();
    this.watchers = new Map();
  }

  async start({ sessionId, repositoryPath, mode = "smart" } = {}) {
    if (!sessionId || !repositoryPath) throw new Error("A session and repository path are required to start watching.");
    await this.stop(sessionId);
    const watcher = new RepositoryWatcher({
      repositoryPath,
      mode,
      ...(this.watcherFactory.watchFactory ? { watchFactory: this.watcherFactory.watchFactory } : {}),
      ...(this.watcherFactory.resolveRepositoryFn ? { resolveRepositoryFn: this.watcherFactory.resolveRepositoryFn } : {}),
      ...(this.watcherFactory.countVisibleFilesFn ? { countVisibleFilesFn: this.watcherFactory.countVisibleFilesFn } : {}),
      ...(this.watcherFactory.pollStatusFn ? { pollStatusFn: this.watcherFactory.pollStatusFn } : {}),
      onChange: (event) => this.handleChange(sessionId, event),
      onError: (error) => this.onError(error, sessionId),
      onStatus: (status) => this.onStatus({ ...status, sessionId }),
    });
    this.watchers.set(sessionId, watcher);
    try {
      return await watcher.start();
    } catch (error) {
      this.watchers.delete(sessionId);
      throw error;
    }
  }

  async stop(sessionId) {
    this.cancelTransaction(sessionId);
    const watcher = this.watchers.get(sessionId);
    if (!watcher) return false;
    this.watchers.delete(sessionId);
    await watcher.stop();
    return true;
  }

  async stopAll() {
    const sessions = [...this.watchers.keys()];
    await Promise.all(sessions.map((sessionId) => this.stop(sessionId)));
    for (const sessionId of this.transactions.keys()) this.cancelTransaction(sessionId);
  }

  handleChange(sessionId, event) {
    const transaction = this.transactions.get(sessionId);
    if (transaction) {
      transaction.events.push(event);
      return;
    }
    this.onChange({ ...event, sessionId });
  }

  beginTransaction(sessionId) {
    if (!sessionId) throw new Error("A session is required for a workspace transaction.");
    if (this.transactions.has(sessionId)) throw new Error("A workspace operation is already in progress.");
    const transactionId = `${sessionId}:${++this.transactionCounter}`;
    this.transactions.set(sessionId, { id: transactionId, events: [], timer: null });
    return transactionId;
  }

  endTransaction(sessionId, transactionId) {
    const transaction = this.transactions.get(sessionId);
    if (!transaction || transaction.id !== transactionId) return false;
    transaction.timer = setTimeout(() => this.flushTransaction(sessionId, transactionId), this.transactionGraceMs);
    return transactionId;
  }

  flushTransaction(sessionId, transactionId) {
    const transaction = this.transactions.get(sessionId);
    if (!transaction || transaction.id !== transactionId) return false;
    this.transactions.delete(sessionId);
    if (transaction.timer) clearTimeout(transaction.timer);
    const event = coalesceRepositoryChanges(transaction.events);
    if (event) this.onChange({ ...event, sessionId, transactionId });
    return true;
  }

  cancelTransaction(sessionId) {
    const transaction = this.transactions.get(sessionId);
    if (!transaction) return false;
    if (transaction.timer) clearTimeout(transaction.timer);
    this.transactions.delete(sessionId);
    return true;
  }

  getStatus(sessionId) {
    return this.watchers.get(sessionId)?.getStatus() ?? null;
  }

  setActivity(sessionId, active) {
    const watcher = this.watchers.get(sessionId);
    if (!watcher) return false;
    watcher.setActive(active);
    return true;
  }

  get size() {
    return this.watchers.size;
  }
}

module.exports = {
  DEFAULT_TRANSACTION_GRACE_MS,
  WatchManager,
};
