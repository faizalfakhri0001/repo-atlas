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
  getCommitDetails,
  getFileDiff,
  compareRefs,
  cherryPickPreview,
  cherryPickExecute,
  sequencerAction,
  searchRepository,
  analyticsSummary,
  hotspotSummary,
  ownershipSummary,
  repositoryHealth,
  branchIntelligence,
  refreshRepositoryPartial,
  GitServiceError,
} = require("./git-service.cjs");
const { WatchManager } = require("./watch/watch-manager.cjs");

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
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
    "commit:details": (payload) => getCommitDetails(payload?.repositoryPath, payload?.hash),
    "diff:file": (payload) => getFileDiff(payload?.repositoryPath, payload ?? {}),
    "compare:refs": (payload) => compareRefs(payload?.repositoryPath, payload?.base, payload?.head),
    "cherry-pick:preview": (payload) => cherryPickPreview(payload?.repositoryPath, payload?.hashes),
    "cherry-pick:execute": (payload) => cherryPickExecute(payload?.repositoryPath, payload?.hashes),
    "sequencer:action": (payload) => sequencerAction(payload?.repositoryPath, payload?.action),
    "repository:search": (payload) => searchRepository(payload?.repositoryPath, payload ?? {}),
    "analytics:summary": (payload) => analyticsSummary(payload?.repositoryPath, payload ?? {}),
    "analytics:hotspots": (payload) => hotspotSummary(payload?.repositoryPath, payload ?? {}),
    "analytics:ownership": (payload) => ownershipSummary(payload?.repositoryPath, payload ?? {}),
    "repository:health": (payload) => repositoryHealth(payload?.repositoryPath, payload ?? {}),
    "branches:intelligence": (payload) => branchIntelligence(payload?.repositoryPath, payload ?? {}),
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
