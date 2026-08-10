const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const {
  scanRepository,
  listRepositoryFiles,
  readRepositoryFile,
  listFileHistory,
  resolveRepositoryFilePath,
  listCommits,
  getCommitDetails,
  getFileDiff,
  compareRefs,
  cherryPickPreview,
  cherryPickExecute,
  sequencerAction,
  GitServiceError,
} = require("./git-service.cjs");

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

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
