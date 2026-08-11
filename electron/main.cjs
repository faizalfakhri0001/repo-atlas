const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const {
  scanRepository,
  listRepositoryFiles,
  readRepositoryFile,
  listFileHistory,
  readFileAtRevision,
  fileBlame,
  resolveRepositoryFilePath,
  listCommits,
  listCommitsRange,
  getCommitDetails,
  getFileDiff,
  compareRefs,
  cherryPickPreview,
  cherryPickExecute,
  sequencerAction,
  searchRepository,
  analyticsSummary,
  activitySummary,
  hotspotSummary,
  ownershipSummary,
  repositoryHealth,
  branchIntelligence,
  listReflog,
  getCommitReachability,
  stageFiles,
  unstageFiles,
  stageHunk,
  unstageHunk,
  refreshRepositoryPartial,
  GitServiceError,
} = require("./git-service.cjs");
const { createPreferencesStore } = require("./preferences.cjs");
const { createRepositoryMetadataStore } = require("./repository-metadata.cjs");
const { createLocalMetadataService } = require("./local-metadata.cjs");
const { createSavedViewService } = require("./saved-views.cjs");
const { WatchManager } = require("./watch/watch-manager.cjs");

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const preferences = createPreferencesStore({ filePath: () => path.join(app.getPath("userData"), "preferences.json") });
const repositoryMetadata = createRepositoryMetadataStore({ userDataPath: () => app.getPath("userData") });
const localMetadata = createLocalMetadataService({ store: repositoryMetadata });
const savedViews = createSavedViewService({ store: repositoryMetadata });
const watchManager = new WatchManager({
  onChange: (event) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send("repository:changed", event);
  },
  onError: (error, sessionId) => {
    const payload = {
      sessionId,
      message: error?.message ?? "Repository watcher failed.",
      code: error?.code ?? "WATCH_ERROR",
    };
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send("repository:watch-error", payload);
  },
  onStatus: (status) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send("repository:watch-status", status);
  },
});

async function executeWorkspaceOperation(payload, operation) {
  const sessionId = payload?.sessionId;
  const transactionId = watchManager.beginTransaction(sessionId);
  try {
    const operationMode = await preferences.getOperationMode();
    const data = await operation({ operationMode });
    return { ...data, transactionId };
  } finally {
    watchManager.endTransaction(sessionId, transactionId);
  }
}

function serializeError(error) {
  if (error instanceof GitServiceError) {
    return {
      message: error.message,
      code: error.code,
      details: error.details,
    };
  }
  return {
    message: error?.message || "Unexpected application error.",
    code: "UNEXPECTED_ERROR",
    details: "",
  };
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: "#09090b",
    title: "Repo Atlas",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    const allowed = isDevelopment
      ? url.startsWith(process.env.VITE_DEV_SERVER_URL)
      : url.startsWith("file://");
    if (!allowed) event.preventDefault();
  });

  if (isDevelopment) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function registerIpcHandlers() {
  ipcMain.handle("dialog:open-repository", async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(focusedWindow ?? undefined, {
      title: "Open Git repository",
      properties: ["openDirectory"],
      buttonLabel: "Open Repository",
    });
    return result.canceled ? null : result.filePaths[0];
  });

  const invokeHandlers = {
    "repository:scan": (payload) => scanRepository(payload?.repositoryPath ?? payload),
    "repository:list-files": (payload) => listRepositoryFiles(payload?.repositoryPath ?? payload),
    "repository:file-content": (payload) => readRepositoryFile(payload?.repositoryPath, payload?.path),
    "file:history": (payload) => listFileHistory(payload?.repositoryPath, payload ?? {}),
    "file:content-at-revision": (payload) => readFileAtRevision(payload?.repositoryPath, payload ?? {}),
    "file:blame": (payload) => fileBlame(payload?.repositoryPath, payload ?? {}),
    "repository:reveal-file": async (payload) => {
      const target = await resolveRepositoryFilePath(payload?.repositoryPath, payload?.path);
      shell.showItemInFolder(target);
      return null;
    },
    "commits:list": (payload) => listCommits(payload?.repositoryPath, payload ?? {}),
    "commits:list-range": (payload) => listCommitsRange(payload?.repositoryPath, payload ?? {}),
    "reflog:list": (payload) => listReflog(payload?.repositoryPath, payload ?? {}),
    "commit:reachability": (payload) => getCommitReachability(payload?.repositoryPath, payload?.hash),
    "commit:details": (payload) => getCommitDetails(payload?.repositoryPath, payload?.hash),
    "diff:file": (payload) => getFileDiff(payload?.repositoryPath, payload ?? {}),
    "compare:refs": (payload) => compareRefs(payload?.repositoryPath, payload?.base, payload?.head),
    "cherry-pick:preview": (payload) => cherryPickPreview(payload?.repositoryPath, payload?.hashes),
    "cherry-pick:execute": (payload) => cherryPickExecute(payload?.repositoryPath, payload?.hashes),
    "sequencer:action": (payload) => sequencerAction(payload?.repositoryPath, payload?.action),
    "repository:search": (payload) => searchRepository(payload?.repositoryPath, payload ?? {}),
    "analytics:summary": (payload) => analyticsSummary(payload?.repositoryPath, payload ?? {}),
    "analytics:activity": (payload) => activitySummary(payload?.repositoryPath, payload ?? {}),
    "analytics:hotspots": (payload) => hotspotSummary(payload?.repositoryPath, payload ?? {}),
    "analytics:ownership": (payload) => ownershipSummary(payload?.repositoryPath, payload ?? {}),
    "repository:health": (payload) => repositoryHealth(payload?.repositoryPath, payload ?? {}),
    "branches:intelligence": (payload) => branchIntelligence(payload?.repositoryPath, payload ?? {}),
    "saved-view:list": (payload) => savedViews.listSavedViews(payload?.repositoryPath),
    "saved-view:create": (payload) => savedViews.createSavedView(payload?.repositoryPath, payload ?? {}),
    "saved-view:update": (payload) => savedViews.updateSavedView(payload?.repositoryPath, payload ?? {}),
    "saved-view:delete": (payload) => savedViews.deleteSavedView(payload?.repositoryPath, payload ?? {}),
    "bookmark:list": (payload) => localMetadata.listBookmarks(payload?.repositoryPath),
    "bookmark:create": (payload) => localMetadata.createBookmark(payload?.repositoryPath, payload ?? {}),
    "bookmark:update": (payload) => localMetadata.updateBookmark(payload?.repositoryPath, payload ?? {}),
    "bookmark:delete": (payload) => localMetadata.deleteBookmark(payload?.repositoryPath, payload ?? {}),
    "note:list": (payload) => localMetadata.listNotes(payload?.repositoryPath),
    "note:create": (payload) => localMetadata.createNote(payload?.repositoryPath, payload ?? {}),
    "note:update": (payload) => localMetadata.updateNote(payload?.repositoryPath, payload ?? {}),
    "note:delete": (payload) => localMetadata.deleteNote(payload?.repositoryPath, payload ?? {}),
    "settings:get-operation-mode": async () => ({ operationMode: await preferences.getOperationMode() }),
    "settings:set-operation-mode": async (payload) => ({ operationMode: await preferences.setOperationMode(payload?.mode) }),
    "workspace:stage-files": (payload) => executeWorkspaceOperation(payload, ({ operationMode }) => stageFiles(payload?.repositoryPath, payload?.paths, { operationMode })),
    "workspace:unstage-files": (payload) => executeWorkspaceOperation(payload, ({ operationMode }) => unstageFiles(payload?.repositoryPath, payload?.paths, { operationMode })),
    "workspace:stage-hunk": (payload) => executeWorkspaceOperation(payload, ({ operationMode }) => stageHunk(payload?.repositoryPath, {
      path: payload?.path,
      hunkId: payload?.hunkId,
      source: payload?.source,
    }, { operationMode })),
    "workspace:unstage-hunk": (payload) => executeWorkspaceOperation(payload, ({ operationMode }) => unstageHunk(payload?.repositoryPath, {
      path: payload?.path,
      hunkId: payload?.hunkId,
      source: payload?.source,
    }, { operationMode })),
    "repository:refresh-partial": (payload) => refreshRepositoryPartial(payload?.repositoryPath, payload?.parts),
    "repository:watch-start": (payload) => watchManager.start({ sessionId: payload?.sessionId, repositoryPath: payload?.repositoryPath, mode: payload?.mode }),
    "repository:watch-stop": (payload) => watchManager.stop(payload?.sessionId),
    "repository:watch-activity": (payload) => watchManager.setActivity(payload?.sessionId, payload?.active),
    "repository:watch-status": (payload) => watchManager.getStatus(payload?.sessionId),
  };

  for (const [channel, task] of Object.entries(invokeHandlers)) {
    ipcMain.handle(channel, async (_event, payload) => {
      try {
        const data = await task(payload);
        return { ok: true, data };
      } catch (error) {
        return { ok: false, error: serializeError(error) };
      }
    });
  }

  ipcMain.handle("repository:reveal", async (_event, repositoryPath) => {
    if (typeof repositoryPath !== "string" || repositoryPath.length === 0) {
      return { ok: false };
    }
    shell.showItemInFolder(path.resolve(repositoryPath));
    return { ok: true };
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void watchManager.stopAll();
});
