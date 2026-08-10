class BlameCache {
  constructor(limit = 10) {
    this.limit = Math.max(1, Number(limit) || 10);
    this.entries = new Map();
  }

  makeKey(repositoryRoot, revision, filePath) {
    return `${repositoryRoot}\u0000${revision}\u0000${filePath}`;
  }

  get(repositoryRoot, revision, filePath) {
    const key = this.makeKey(repositoryRoot, revision, filePath);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(repositoryRoot, revision, filePath, value) {
    const key = this.makeKey(repositoryRoot, revision, filePath);
    this.entries.delete(key);
    this.entries.set(key, { repositoryRoot, revision, filePath, value });
    while (this.entries.size > this.limit) {
      const oldestKey = this.entries.keys().next().value;
      this.entries.delete(oldestKey);
    }
    return value;
  }

  invalidateHead(repositoryRoot, revision) {
    for (const [key, entry] of this.entries) {
      if (entry.repositoryRoot === repositoryRoot && entry.revision !== revision) this.entries.delete(key);
    }
  }

  clear(repositoryRoot = null) {
    if (repositoryRoot == null) {
      this.entries.clear();
      return;
    }
    for (const [key, entry] of this.entries) {
      if (entry.repositoryRoot === repositoryRoot) this.entries.delete(key);
    }
  }

  get size() {
    return this.entries.size;
  }
}

module.exports = {
  BlameCache,
};
