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
  assert.match(main, /"worktree:create-preview": async \(payload\) => previewWorktreeCreate\(/);
  assert.match(main, /"worktree:create": \(payload\) => executeWorkspaceOperation\(payload, \(\{ operationMode \}\) => createWorktree\(/);
  assert.match(preload, /worktreeCreatePreview: \(payload\) => ipcRenderer\.invoke\("worktree:create-preview", payload\)/);
  assert.match(preload, /worktreeCreate: \(payload\) => ipcRenderer\.invoke\("worktree:create", payload\)/);
  assert.match(main, /watchManager\.beginTransaction\(sessionId\)/);
  assert.match(main, /watchManager\.endTransaction\(sessionId, transactionId\)/);
});
