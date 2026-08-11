const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("saved view service is exposed through granular Electron IPC methods", () => {
  const main = fs.readFileSync(path.join(root, "electron/main.cjs"), "utf8");
  const preload = fs.readFileSync(path.join(root, "electron/preload.cjs"), "utf8");
  const savedViews = fs.readFileSync(path.join(root, "electron/saved-views.cjs"), "utf8");

  assert.match(savedViews, /createSavedViewService/);
  assert.match(main, /"saved-view:list": \(payload\) => savedViews\.listSavedViews\(payload\?\.repositoryPath\)/);
  assert.match(main, /"saved-view:create": \(payload\) => savedViews\.createSavedView\(payload\?\.repositoryPath, payload \?\? \{\}\)/);
  assert.match(main, /"saved-view:update": \(payload\) => savedViews\.updateSavedView\(payload\?\.repositoryPath, payload \?\? \{\}\)/);
  assert.match(main, /"saved-view:delete": \(payload\) => savedViews\.deleteSavedView\(payload\?\.repositoryPath, payload \?\? \{\}\)/);
  assert.match(preload, /listSavedViews: \(payload\) => ipcRenderer\.invoke\("saved-view:list", payload\)/);
  assert.match(preload, /createSavedView: \(payload\) => ipcRenderer\.invoke\("saved-view:create", payload\)/);
  assert.match(preload, /updateSavedView: \(payload\) => ipcRenderer\.invoke\("saved-view:update", payload\)/);
  assert.match(preload, /deleteSavedView: \(payload\) => ipcRenderer\.invoke\("saved-view:delete", payload\)/);
});
