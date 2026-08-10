const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("ownership analytics is wired through the Electron service contract", () => {
  const service = fs.readFileSync(path.join(root, "electron/git-service.cjs"), "utf8");
  const main = fs.readFileSync(path.join(root, "electron/main.cjs"), "utf8");
  const preload = fs.readFileSync(path.join(root, "electron/preload.cjs"), "utf8");

  assert.match(service, /ownershipSummary/);
  assert.match(main, /"analytics:ownership": \(payload\) => ownershipSummary\(/);
  assert.match(preload, /ownership: \(payload\) => ipcRenderer\.invoke\("analytics:ownership", payload\)/);
});
