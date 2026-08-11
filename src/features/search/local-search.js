import { normalizeBookmarks, normalizeNotes } from "../local-metadata/local-metadata-model.js";
import { getSavedViewConfigSummary } from "../saved-views/saved-view-model.js";
import { scoreSearchResult } from "./search-scoring.js";
import { truncateLocalSnippet } from "../local-metadata/bookmarks-model.js";

export const LOCAL_SEARCH_TYPES = Object.freeze(["bookmark", "note", "saved-view"]);

function shortHash(value) {
  return value ? value.slice(0, 8) : "";
}

function safeSavedViews(value) {
  return Array.isArray(value) ? value.filter((view) => view && typeof view.id === "string" && typeof view.name === "string") : [];
}

function selectTypes(types) {
  if (!Array.isArray(types)) return new Set(LOCAL_SEARCH_TYPES);
  return new Set(types.filter((type) => LOCAL_SEARCH_TYPES.includes(type)));
}

export function buildLocalMetadataRevisionKey({ bookmarks = [], notes = [], savedViews = [] } = {}) {
  const bookmarkKey = normalizeBookmarks(bookmarks)
    .map((bookmark) => [bookmark.id, bookmark.commitHash, bookmark.label ?? "", bookmark.category ?? "", bookmark.updatedAt ?? ""].join(":"))
    .join(",");
  const noteKey = normalizeNotes(notes)
    .map((note) => [note.id, note.targetId, note.title ?? "", note.updatedAt ?? ""].join(":"))
    .join(",");
  const savedViewKey = safeSavedViews(savedViews)
    .map((view) => [view.id, view.name, view.viewType ?? "", view.updatedAt ?? ""].join(":"))
    .join(",");
  return `${bookmarkKey}|${noteKey}|${savedViewKey}`;
}

export function buildLocalMetadataSearchResults({ query = "", types, bookmarks = [], notes = [], savedViews = [] } = {}) {
  const selectedTypes = selectTypes(types);
  const results = [];
  const needle = String(query ?? "").trim();

  if (selectedTypes.has("bookmark")) {
    for (const bookmark of normalizeBookmarks(bookmarks)) {
      const result = {
        type: "bookmark",
        hash: bookmark.commitHash,
        shortHash: shortHash(bookmark.commitHash),
        name: bookmark.label || shortHash(bookmark.commitHash),
        label: bookmark.label,
        category: bookmark.category,
        date: bookmark.updatedAt,
        bookmark,
      };
      const score = scoreSearchResult(result, needle);
      if (score > 0) results.push({ ...result, score });
    }
  }

  if (selectedTypes.has("note")) {
    for (const note of normalizeNotes(notes)) {
      const result = {
        type: "note",
        hash: note.targetId,
        shortHash: shortHash(note.targetId),
        name: note.title || "Local note",
        title: note.title,
        body: truncateLocalSnippet(note.body),
        date: note.updatedAt,
        note,
      };
      const score = scoreSearchResult({ ...result, body: note.body }, needle);
      if (score > 0) results.push({ ...result, score });
    }
  }

  if (selectedTypes.has("saved-view")) {
    for (const view of safeSavedViews(savedViews)) {
      const result = {
        type: "saved-view",
        name: view.name,
        viewType: view.viewType,
        configSummary: getSavedViewConfigSummary(view),
        date: view.updatedAt,
        savedView: view,
      };
      const score = scoreSearchResult(result, needle);
      if (score > 0) results.push({ ...result, score });
    }
  }

  return results;
}
