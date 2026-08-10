const DEFAULT_LIMIT = 30;

export class SearchCache {
  constructor(limit = DEFAULT_LIMIT) {
    this.limit = Math.max(1, Number(limit) || DEFAULT_LIMIT);
    this.revisionKey = null;
    this.entries = new Map();
  }

  setRevision(revisionKey) {
    const nextKey = String(revisionKey ?? "");
    if (this.revisionKey === nextKey) return;
    this.revisionKey = nextKey;
    this.entries.clear();
  }

  get(key, revisionKey = this.revisionKey) {
    if (String(revisionKey ?? "") !== this.revisionKey) return null;
    const entry = this.entries.get(String(key));
    if (!entry) return null;
    this.entries.delete(String(key));
    this.entries.set(String(key), entry);
    return entry.value;
  }

  set(key, value, revisionKey = this.revisionKey) {
    if (String(revisionKey ?? "") !== this.revisionKey) return;
    const normalizedKey = String(key);
    this.entries.delete(normalizedKey);
    this.entries.set(normalizedKey, { value });
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }
}
