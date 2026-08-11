const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("activity analytics is wired through the Electron service contract", () => {
  const service = fs.readFileSync(path.join(root, "electron/git-service.cjs"), "utf8");
  const main = fs.readFileSync(path.join(root, "electron/main.cjs"), "utf8");
  const preload = fs.readFileSync(path.join(root, "electron/preload.cjs"), "utf8");

  assert.match(service, /activitySummary/);
  assert.match(service, /listCommitsRange/);
  assert.match(main, /"analytics:activity": \(payload\) => activitySummary\(/);
  assert.match(main, /"commits:list-range": \(payload\) => listCommitsRange\(/);
  assert.match(preload, /activity: \(payload\) => ipcRenderer\.invoke\("analytics:activity", payload\)/);
  assert.match(preload, /listCommitsRange: \(payload\) => ipcRenderer\.invoke\("commits:list-range", payload\)/);
});
