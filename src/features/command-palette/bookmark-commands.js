import { createCommand } from "./command-registry.js";

export function createBookmarkCommands() {
  return [
    createCommand({
      id: "bookmarks.open",
      label: "Open Bookmarks",
      category: "Bookmarks",
      keywords: ["bookmarks", "notes", "local", "commits", "history"],
      enabled: ({ activeRepository, navigate }) => Boolean(activeRepository && navigate),
      run: ({ navigate }) => navigate("bookmarks"),
    }),
    createCommand({
      id: "bookmarks.bookmark-current",
      label: "Bookmark Current Commit",
      category: "Bookmarks",
      keywords: ["bookmark", "commit", "star", "local"],
      enabled: ({ activeRepository, currentCommitHash, openBookmarkEditor }) => Boolean(activeRepository && currentCommitHash && openBookmarkEditor),
      run: ({ currentCommitHash, openBookmarkEditor }) => openBookmarkEditor(currentCommitHash),
    }),
    createCommand({
      id: "bookmarks.note-current",
      label: "Edit Current Commit Note",
      category: "Bookmarks",
      keywords: ["note", "context", "commit", "local"],
      enabled: ({ activeRepository, currentCommitHash, openNoteEditor }) => Boolean(activeRepository && currentCommitHash && openNoteEditor),
      run: ({ currentCommitHash, openNoteEditor }) => openNoteEditor(currentCommitHash),
    }),
  ];
}
