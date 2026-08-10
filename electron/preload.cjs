const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("repoAtlas", {
  openRepository: () => ipcRenderer.invoke("dialog:open-repository"),
  scanRepository: (repositoryPath) => ipcRenderer.invoke("repository:scan", { repositoryPath }),
  listRepositoryFiles: (payload) => ipcRenderer.invoke("repository:list-files", payload),
  readRepositoryFile: (payload) => ipcRenderer.invoke("repository:file-content", payload),
  revealRepositoryFile: (payload) => ipcRenderer.invoke("repository:reveal-file", payload),
  revealRepository: (repositoryPath) => ipcRenderer.invoke("repository:reveal", repositoryPath),
  listCommits: (payload) => ipcRenderer.invoke("commits:list", payload),
  commitDetails: (payload) => ipcRenderer.invoke("commit:details", payload),
  fileDiff: (payload) => ipcRenderer.invoke("diff:file", payload),
  compareRefs: (payload) => ipcRenderer.invoke("compare:refs", payload),
  cherryPickPreview: (payload) => ipcRenderer.invoke("cherry-pick:preview", payload),
  cherryPickExecute: (payload) => ipcRenderer.invoke("cherry-pick:execute", payload),
  sequencerAction: (payload) => ipcRenderer.invoke("sequencer:action", payload),
  platform: process.platform,
});
