const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("bookmark and note metadata use narrow IPC handlers and preload methods", () => {
  const main = fs.readFileSync(path.join(root, "electron/main.cjs"), "utf8");
  const preload = fs.readFileSync(path.join(root, "electron/preload.cjs"), "utf8");
  const service = fs.readFileSync(path.join(root, "electron/local-metadata.cjs"), "utf8");

  assert.match(service, /createLocalMetadataService/);
  for (const [channel, method] of [
    ["bookmark:list", "listBookmarks"],
    ["bookmark:create", "createBookmark"],
    ["bookmark:update", "updateBookmark"],
    ["bookmark:delete", "deleteBookmark"],
    ["note:list", "listNotes"],
    ["note:create", "createNote"],
    ["note:update", "updateNote"],
    ["note:delete", "deleteNote"],
  ]) {
    assert.match(main, new RegExp(`"${channel}": \\(payload\\) => localMetadata\\.${method}`));
    assert.match(preload, new RegExp(`${method}: \\(payload\\) => ipcRenderer\\.invoke\\("${channel}"`));
  }
});
