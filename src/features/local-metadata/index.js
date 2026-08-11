export {
  MAX_BOOKMARK_CATEGORY_LENGTH,
  MAX_BOOKMARK_LABEL_LENGTH,
  MAX_NOTE_BODY_LENGTH,
  MAX_NOTE_TITLE_LENGTH,
  findOrphanBookmarks,
  getBookmarkedHashes,
  getBookmarkForCommit,
  getNoteForCommit,
  normalizeBookmarks,
  normalizeCommitHash,
  normalizeNotes,
} from "./local-metadata-model";
export { useLocalMetadata } from "./use-local-metadata";
