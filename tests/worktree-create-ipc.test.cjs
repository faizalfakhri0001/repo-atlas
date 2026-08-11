const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("worktree creation stays behind explicit service and IPC contracts", () => {
  const service = require(path.join(root, "electron/git-service.cjs"));
  const main = fs.readFileSync(path.join(root, "electron/main.cjs"), "utf8");
  const preload = fs.readFileSync(path.join(root, "electron/preload.cjs"), "utf8");

  assert.equal(typeof service.previewWorktreeCreate, "function");
  assert.equal(typeof service.createWorktree, "function");
  assert.equal(typeof service.previewWorktreeRemove, "function");
  assert.equal(typeof service.removeWorktree, "function");
  assert.equal(typeof service.previewWorktreePrune, "function");
  assert.equal(typeof service.pruneWorktrees, "function");
  assert.match(main, /"dialog:choose-worktree-location": async \(payload\) =>/);
  assert.match(main, /properties: \["openDirectory", "createDirectory"\]/);
  assert.match(main, /"worktree:create-preview": async \(payload\) => previewWorktreeCreate\(/);
  assert.match(main, /"worktree:create": \(payload\) => executeWorkspaceOperation\(payload, \(\{ operationMode \}\) => createWorktree\(/);
  assert.match(preload, /chooseWorktreeLocation: \(payload\) => ipcRenderer\.invoke\("dialog:choose-worktree-location", payload\)/);
  assert.match(preload, /worktreeCreatePreview: \(payload\) => ipcRenderer\.invoke\("worktree:create-preview", payload\)/);
  assert.match(preload, /worktreeCreate: \(payload\) => ipcRenderer\.invoke\("worktree:create", payload\)/);
  assert.match(main, /"worktree:remove-preview": async \(payload\) => previewWorktreeRemove\(/);
  assert.match(main, /"worktree:remove": \(payload\) => executeWorkspaceOperation\(payload, \(\{ operationMode \}\) => removeWorktree\(/);
  assert.match(main, /"worktree:prune-preview": async \(payload\) => previewWorktreePrune\(/);
  assert.match(main, /"worktree:prune": \(payload\) => executeWorkspaceOperation\(payload, \(\{ operationMode \}\) => pruneWorktrees\(/);
  assert.match(preload, /worktreeRemovePreview: \(payload\) => ipcRenderer\.invoke\("worktree:remove-preview", payload\)/);
  assert.match(preload, /worktreeRemove: \(payload\) => ipcRenderer\.invoke\("worktree:remove", payload\)/);
  assert.match(preload, /worktreePrunePreview: \(payload\) => ipcRenderer\.invoke\("worktree:prune-preview", payload\)/);
  assert.match(preload, /worktreePrune: \(payload\) => ipcRenderer\.invoke\("worktree:prune", payload\)/);
  assert.match(main, /watchManager\.beginTransaction\(sessionId\)/);
  assert.match(main, /watchManager\.endTransaction\(sessionId, transactionId\)/);
});
