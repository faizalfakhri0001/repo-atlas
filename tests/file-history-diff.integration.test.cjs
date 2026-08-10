const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { getFileDiff } = require("../electron/git-service.cjs");

const execFileAsync = promisify(execFile);

test("getFileDiff handles root, deleted, and binary file history entries", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-history-diff-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  const head = async () => (await git("rev-parse", "HEAD")).stdout.trim();

  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "app.js"), "export const answer = 42;\n");
  await git("add", "app.js");
  await git("commit", "-m", "Add app");
  const rootHash = await head();

  await fs.unlink(path.join(root, "app.js"));
  await git("commit", "-am", "Delete app");
  const deletedHash = await head();
  const deletedParent = (await git("rev-parse", `${deletedHash}^1`)).stdout.trim();

  await fs.writeFile(path.join(root, "image.bin"), Buffer.from([0, 1, 2, 3, 4, 255]));
  await git("add", "image.bin");
  await git("commit", "-m", "Add binary image");
  const binaryParent = await head();
  await fs.writeFile(path.join(root, "image.bin"), Buffer.from([0, 1, 2, 3, 4, 254]));
  await git("commit", "-am", "Update binary image");
  const binaryHash = await head();

  const rootDiff = await getFileDiff(root, { type: "commit", from: null, to: rootHash, path: "app.js" });
  assert.equal(rootDiff.binary, false);
  assert.match(rootDiff.diff, /\+export const answer = 42;/);

  const deletedDiff = await getFileDiff(root, { type: "commit", from: deletedParent, to: deletedHash, path: "app.js" });
  assert.equal(deletedDiff.binary, false);
  assert.match(deletedDiff.diff, /deleted file mode/);
  assert.match(deletedDiff.diff, /-export const answer = 42;/);

  const binaryDiff = await getFileDiff(root, { type: "commit", from: binaryParent, to: binaryHash, path: "image.bin" });
  assert.equal(binaryDiff.binary, true);
});
