const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("repoAtlas", {
  openRepository: () => ipcRenderer.invoke("dialog:open-repository"),
  scanRepository: (repositoryPath) => ipcRenderer.invoke("repository:scan", { repositoryPath }),
  chooseWorktreeLocation: (payload) => ipcRenderer.invoke("dialog:choose-worktree-location", payload),
  worktreeDetails: (payload) => ipcRenderer.invoke("worktree:details", payload),
  worktreeCreatePreview: (payload) => ipcRenderer.invoke("worktree:create-preview", payload),
  worktreeCreate: (payload) => ipcRenderer.invoke("worktree:create", payload),
  worktreeRemovePreview: (payload) => ipcRenderer.invoke("worktree:remove-preview", payload),
  worktreeRemove: (payload) => ipcRenderer.invoke("worktree:remove", payload),
  worktreePrunePreview: (payload) => ipcRenderer.invoke("worktree:prune-preview", payload),
  worktreePrune: (payload) => ipcRenderer.invoke("worktree:prune", payload),
  listRepositoryFiles: (payload) => ipcRenderer.invoke("repository:list-files", payload),
  readRepositoryFile: (payload) => ipcRenderer.invoke("repository:file-content", payload),
  fileHistory: (payload) => ipcRenderer.invoke("file:history", payload),
  fileBlame: (payload) => ipcRenderer.invoke("file:blame", payload),
  refreshRepositoryPartial: (payload) => ipcRenderer.invoke("repository:refresh-partial", payload),
  startRepositoryWatch: (payload) => ipcRenderer.invoke("repository:watch-start", payload),
  stopRepositoryWatch: (sessionId) => ipcRenderer.invoke("repository:watch-stop", { sessionId }),
  setRepositoryWatchActivity: (payload) => ipcRenderer.invoke("repository:watch-activity", payload),
  getRepositoryWatchStatus: (sessionId) => ipcRenderer.invoke("repository:watch-status", { sessionId }),
  readFileAtRevision: (payload) => ipcRenderer.invoke("file:content-at-revision", payload),
  revealRepositoryFile: (payload) => ipcRenderer.invoke("repository:reveal-file", payload),
  revealRepository: (repositoryPath) => ipcRenderer.invoke("repository:reveal", repositoryPath),
  listCommits: (payload) => ipcRenderer.invoke("commits:list", payload),
  listCommitsRange: (payload) => ipcRenderer.invoke("commits:list-range", payload),
  listReflog: (payload) => ipcRenderer.invoke("reflog:list", payload),
  commitReachability: (payload) => ipcRenderer.invoke("commit:reachability", payload),
  commitDetails: (payload) => ipcRenderer.invoke("commit:details", payload),
  fileDiff: (payload) => ipcRenderer.invoke("diff:file", payload),
  compareRefs: (payload) => ipcRenderer.invoke("compare:refs", payload),
  cherryPickPreview: (payload) => ipcRenderer.invoke("cherry-pick:preview", payload),
  cherryPickExecute: (payload) => ipcRenderer.invoke("cherry-pick:execute", payload),
  sequencerAction: (payload) => ipcRenderer.invoke("sequencer:action", payload),
  repositorySearch: (payload) => ipcRenderer.invoke("repository:search", payload),
  analyticsSummary: (payload) => ipcRenderer.invoke("analytics:summary", payload),
  activity: (payload) => ipcRenderer.invoke("analytics:activity", payload),
  hotspots: (payload) => ipcRenderer.invoke("analytics:hotspots", payload),
  ownership: (payload) => ipcRenderer.invoke("analytics:ownership", payload),
  repositoryHealth: (payload) => ipcRenderer.invoke("repository:health", payload),
  branchIntelligence: (payload) => ipcRenderer.invoke("branches:intelligence", payload),
  listSavedViews: (payload) => ipcRenderer.invoke("saved-view:list", payload),
  createSavedView: (payload) => ipcRenderer.invoke("saved-view:create", payload),
  updateSavedView: (payload) => ipcRenderer.invoke("saved-view:update", payload),
  deleteSavedView: (payload) => ipcRenderer.invoke("saved-view:delete", payload),
  listBookmarks: (payload) => ipcRenderer.invoke("bookmark:list", payload),
  createBookmark: (payload) => ipcRenderer.invoke("bookmark:create", payload),
  updateBookmark: (payload) => ipcRenderer.invoke("bookmark:update", payload),
  deleteBookmark: (payload) => ipcRenderer.invoke("bookmark:delete", payload),
  listNotes: (payload) => ipcRenderer.invoke("note:list", payload),
  createNote: (payload) => ipcRenderer.invoke("note:create", payload),
  updateNote: (payload) => ipcRenderer.invoke("note:update", payload),
  deleteNote: (payload) => ipcRenderer.invoke("note:delete", payload),
  getOperationMode: () => ipcRenderer.invoke("settings:get-operation-mode"),
  setOperationMode: (payload) => ipcRenderer.invoke("settings:set-operation-mode", payload),
  stageFiles: (payload) => ipcRenderer.invoke("workspace:stage-files", payload),
  unstageFiles: (payload) => ipcRenderer.invoke("workspace:unstage-files", payload),
  stageHunk: (payload) => ipcRenderer.invoke("workspace:stage-hunk", payload),
  unstageHunk: (payload) => ipcRenderer.invoke("workspace:unstage-hunk", payload),
  onRepositoryChanged: (listener) => {
    if (typeof listener !== "function") return () => {};
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on("repository:changed", wrapped);
    return () => ipcRenderer.removeListener("repository:changed", wrapped);
  },
  onRepositoryWatchStatus: (listener) => {
    if (typeof listener !== "function") return () => {};
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on("repository:watch-status", wrapped);
    return () => ipcRenderer.removeListener("repository:watch-status", wrapped);
  },
  onRepositoryWatchError: (listener) => {
    if (typeof listener !== "function") return () => {};
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on("repository:watch-error", wrapped);
    return () => ipcRenderer.removeListener("repository:watch-error", wrapped);
  },
  platform: process.platform,
});
