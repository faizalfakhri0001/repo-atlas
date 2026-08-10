const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("visual blame is exposed through the Electron service contract", () => {
  const service = fs.readFileSync(path.join(root, "electron/git-service.cjs"), "utf8");
  const main = fs.readFileSync(path.join(root, "electron/main.cjs"), "utf8");
  const preload = fs.readFileSync(path.join(root, "electron/preload.cjs"), "utf8");

  assert.match(service, /const \{ fileBlame \} = require\("\.\/git\/blame\.cjs"\)/);
  assert.match(service, /fileBlame,/);
  assert.match(main, /"file:blame": \(payload\) => fileBlame\(payload\?\.repositoryPath, payload \?\? \{\}\)/);
  assert.match(preload, /fileBlame: \(payload\) => ipcRenderer\.invoke\("file:blame", payload\)/);
});
