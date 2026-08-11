export const MAX_BOOKMARK_LABEL_LENGTH = 120;
export const MAX_BOOKMARK_CATEGORY_LENGTH = 60;
export const MAX_NOTE_TITLE_LENGTH = 120;
export const MAX_NOTE_BODY_LENGTH = 10_000;

export function normalizeCommitHash(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

export function normalizeBookmarks(value) {
  return Array.isArray(value)
    ? value.filter((bookmark) => bookmark && typeof bookmark.id === "string" && typeof bookmark.commitHash === "string").map((bookmark) => ({
      ...bookmark,
      commitHash: normalizeCommitHash(bookmark.commitHash),
      label: bookmark.label || null,
      category: bookmark.category || null,
    }))
    : [];
}

export function normalizeNotes(value) {
  return Array.isArray(value)
    ? value.filter((note) => note && typeof note.id === "string" && note.targetType === "commit" && typeof note.targetId === "string" && typeof note.body === "string").map((note) => ({
      ...note,
      targetId: normalizeCommitHash(note.targetId),
      title: note.title || undefined,
    }))
    : [];
}

export function getBookmarkForCommit(bookmarks, commitHash) {
  const normalizedHash = normalizeCommitHash(commitHash);
  return normalizeBookmarks(bookmarks).find((bookmark) => bookmark.commitHash === normalizedHash) ?? null;
}

export function getNoteForCommit(notes, commitHash) {
  const normalizedHash = normalizeCommitHash(commitHash);
  return normalizeNotes(notes).find((note) => note.targetId === normalizedHash) ?? null;
}

export function getBookmarkedHashes(bookmarks) {
  return new Set(normalizeBookmarks(bookmarks).map((bookmark) => bookmark.commitHash));
}

export function findOrphanBookmarks(bookmarks, commitHashes) {
  const available = new Set(Array.from(commitHashes ?? [], normalizeCommitHash));
  return normalizeBookmarks(bookmarks).filter((bookmark) => !available.has(bookmark.commitHash));
}
