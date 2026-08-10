const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("repository watch bridge exposes fixed channels and unsubscribe APIs", () => {
  const main = fs.readFileSync(path.join(root, "electron/main.cjs"), "utf8");
  const preload = fs.readFileSync(path.join(root, "electron/preload.cjs"), "utf8");

  assert.match(main, /new WatchManager\(\{/);
  assert.match(main, /"repository:watch-start": \(payload\) => watchManager\.start/);
  assert.match(main, /"repository:watch-stop": \(payload\) => watchManager\.stop/);
  assert.match(main, /window\.webContents\.send\("repository:changed", event\)/);
  assert.match(preload, /refreshRepositoryPartial: \(payload\) => ipcRenderer\.invoke\("repository:refresh-partial", payload\)/);
  assert.match(preload, /startRepositoryWatch: \(payload\) => ipcRenderer\.invoke\("repository:watch-start", payload\)/);
  assert.match(preload, /onRepositoryChanged: \(listener\) => \{/);
  assert.match(preload, /ipcRenderer\.removeListener\("repository:changed", wrapped\)/);
});
