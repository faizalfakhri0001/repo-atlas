const crypto = require("node:crypto");

const DEFAULT_MAX_FULL_INDEXES = 3;

function buildAnalyticsCacheKey({ rootPath, head, refsFingerprint, maxCommits, maxFilesPerCommit, pathPrefix }) {
  const value = JSON.stringify({ rootPath, head, refsFingerprint, maxCommits, maxFilesPerCommit, pathPrefix: pathPrefix || null });
  return crypto.createHash("sha256").update(value).digest("hex");
}

class AnalyticsCache {
  constructor(maxEntries = DEFAULT_MAX_FULL_INDEXES) {
    this.maxEntries = Math.max(1, Number(maxEntries) || DEFAULT_MAX_FULL_INDEXES);
    this.entries = new Map();
    this.clock = 0;
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    entry.usedAt = ++this.clock;
    return entry.value;
  }

  set(key, value, metadata = {}) {
    this.entries.delete(key);
    this.entries.set(key, { key, value, metadata, usedAt: ++this.clock });
    while (this.entries.size > this.maxEntries) {
      const oldest = [...this.entries.values()].sort((left, right) => left.usedAt - right.usedAt)[0];
      this.entries.delete(oldest.key);
    }
    return value;
  }

  invalidate(key) {
    return this.entries.delete(key);
  }

  invalidateRepository(rootPath) {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.metadata.rootPath === rootPath) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }
}

module.exports = {
  AnalyticsCache,
  DEFAULT_MAX_FULL_INDEXES,
  buildAnalyticsCacheKey,
};
