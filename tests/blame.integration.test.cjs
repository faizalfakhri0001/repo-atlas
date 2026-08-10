const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { fileBlame } = require("../electron/git-service.cjs");

const execFileAsync = promisify(execFile);

test("fileBlame resolves HEAD and specific revisions with safe path validation", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-blame-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  const head = async () => (await git("rev-parse", "HEAD")).stdout.trim();

  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "app.js"), "export const value = 1;\nexport const ready = true;\n");
  await git("add", "app.js");
  await git("commit", "-m", "Add app");
  const firstHash = await head();
  await fs.writeFile(path.join(root, "app.js"), "export const value = 2;\nexport const ready = true;\n");
  await git("commit", "-am", "Update value");
  const secondHash = await head();

  const latest = await fileBlame(root, { path: "app.js" });
  assert.equal(latest.path, "app.js");
  assert.equal(latest.revision, secondHash);
  assert.equal(latest.lines.length, 2);
  assert.equal(latest.lines[0].commitHash, secondHash);
  assert.equal(latest.lines[1].commitHash, firstHash);
  assert.equal(latest.lines[0].summary, "Update value");
  assert.equal(latest.workingTreeDirty, false);

  const original = await fileBlame(root, { path: "app.js", revision: firstHash });
  assert.equal(original.revision, firstHash);
  assert.equal(original.lines.length, 2);
  assert.equal(original.lines[0].content, "export const value = 1;");

  await fs.writeFile(path.join(root, "app.js"), "uncommitted change\n");
  const dirty = await fileBlame(root, { path: "app.js" });
  assert.equal(dirty.workingTreeDirty, true);

  await assert.rejects(() => fileBlame(root, { path: "../outside.txt" }), (error) => error?.code === "PATH_OUTSIDE_REPOSITORY");
  await assert.rejects(() => fileBlame(root, { path: "app.js", revision: "--output=/tmp/file" }), (error) => error?.code === "INVALID_ARGUMENT");
});

test("fileBlame returns a safe binary response", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-blame-binary-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });

  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "image.bin"), Buffer.from([0, 1, 2, 3, 255]));
  await git("add", "image.bin");
  await git("commit", "-m", "Add binary");

  const result = await fileBlame(root, { path: "image.bin" });
  assert.equal(result.binary, true);
  assert.equal(result.message, "Blame unavailable for binary files.");
  assert.deepEqual(result.lines, []);
});
