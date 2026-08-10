const { RepositoryWatcher } = require("./repository-watcher.cjs");

class WatchManager {
  constructor({ onChange = () => {}, onError = () => {}, onStatus = () => {}, watcherFactory = {} } = {}) {
    this.onChange = onChange;
    this.onError = onError;
    this.onStatus = onStatus;
    this.watcherFactory = watcherFactory;
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
      onChange: (event) => this.onChange({ ...event, sessionId }),
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
    const watcher = this.watchers.get(sessionId);
    if (!watcher) return false;
    this.watchers.delete(sessionId);
    await watcher.stop();
    return true;
  }

  async stopAll() {
    const sessions = [...this.watchers.keys()];
    await Promise.all(sessions.map((sessionId) => this.stop(sessionId)));
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
  WatchManager,
};
