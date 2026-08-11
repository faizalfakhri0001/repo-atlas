const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const service = require("../electron/git-service.cjs");

const root = path.resolve(__dirname, "..");

test("reflog backend is exposed through granular Electron IPC methods", () => {
  const main = fs.readFileSync(path.join(root, "electron/main.cjs"), "utf8");
  const preload = fs.readFileSync(path.join(root, "electron/preload.cjs"), "utf8");

  assert.equal(typeof service.listReflog, "function");
  assert.equal(typeof service.getCommitReachability, "function");
  assert.match(main, /"reflog:list": \(payload\) => listReflog\(payload\?\.repositoryPath, payload \?\? \{\}\)/);
  assert.match(main, /"commit:reachability": \(payload\) => getCommitReachability\(payload\?\.repositoryPath, payload\?\.hash\)/);
  assert.match(preload, /listReflog: \(payload\) => ipcRenderer\.invoke\("reflog:list", payload\)/);
  assert.match(preload, /commitReachability: \(payload\) => ipcRenderer\.invoke\("commit:reachability", payload\)/);
});
