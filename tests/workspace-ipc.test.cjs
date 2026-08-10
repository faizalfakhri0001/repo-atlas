const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("workspace operation IPC exposes policy and fixed file-operation channels", () => {
  const main = fs.readFileSync(path.join(root, "electron/main.cjs"), "utf8");
  const preload = fs.readFileSync(path.join(root, "electron/preload.cjs"), "utf8");

  assert.match(main, /"settings:get-operation-mode": async \(\) =>/);
  assert.match(main, /"settings:set-operation-mode": async \(payload\) =>/);
  assert.match(main, /"workspace:stage-files": \(payload\) => executeWorkspaceOperation\(payload, stageFiles\)/);
  assert.match(main, /"workspace:unstage-files": \(payload\) => executeWorkspaceOperation\(payload, unstageFiles\)/);
  assert.match(preload, /getOperationMode: \(\) => ipcRenderer\.invoke\("settings:get-operation-mode"\)/);
  assert.match(preload, /stageFiles: \(payload\) => ipcRenderer\.invoke\("workspace:stage-files", payload\)/);
  assert.match(preload, /unstageFiles: \(payload\) => ipcRenderer\.invoke\("workspace:unstage-files", payload\)/);
});
