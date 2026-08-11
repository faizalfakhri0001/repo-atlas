import { normalizeCommitHash, normalizeBookmarks, normalizeNotes } from "./local-metadata-model.js";

export const LOCAL_SEARCH_SNIPPET_LENGTH = 120;

function normalizeQuery(value) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
}

function includesQuery(values, query) {
  if (!query) return true;
  return values.filter(Boolean).some((value) => String(value).toLocaleLowerCase().includes(query));
}

export function truncateLocalSnippet(value, maximum = LOCAL_SEARCH_SNIPPET_LENGTH) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maximum) return text;
  return `${text.slice(0, Math.max(0, maximum - 1)).trimEnd()}…`;
}

export function filterBookmarkRecords(bookmarks, query = "", detailsByHash = new Map()) {
  const needle = normalizeQuery(query);
  return normalizeBookmarks(bookmarks).filter((bookmark) => {
    const detail = detailsByHash.get(bookmark.commitHash);
    return includesQuery([
      bookmark.commitHash,
      bookmark.label,
      bookmark.category,
      detail?.subject,
      detail?.shortHash,
    ], needle);
  });
}

export function filterNoteRecords(notes, query = "", detailsByHash = new Map()) {
  const needle = normalizeQuery(query);
  return normalizeNotes(notes).filter((note) => {
    const detail = detailsByHash.get(normalizeCommitHash(note.targetId));
    return includesQuery([
      note.targetId,
      note.title,
      note.body,
      detail?.subject,
      detail?.shortHash,
    ], needle);
  });
}

export function getLocalCommitStatus(record, detailsByHash, unavailableHashes = null) {
  const hash = normalizeCommitHash(record?.commitHash ?? record?.targetId);
  return {
    hash,
    detail: detailsByHash?.get(hash) ?? null,
    orphan: unavailableHashes ? unavailableHashes.has(hash) : !detailsByHash?.has(hash),
  };
}
