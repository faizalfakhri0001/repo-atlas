const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { readFileAtRevision } = require("../electron/git-service.cjs");

const execFileAsync = promisify(execFile);

test("readFileAtRevision reads text and binary blobs with safe validation", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-revision-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  const head = async () => (await git("rev-parse", "HEAD")).stdout.trim();

  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "app.js"), "export const answer = 42;\n");
  await git("add", "app.js");
  await git("commit", "-m", "Add app");
  const textHash = await head();

  const text = await readFileAtRevision(root, { hash: textHash, path: "app.js" });
  assert.deepEqual(text, {
    hash: textHash,
    path: "app.js",
    text: "export const answer = 42;\n",
    binary: false,
    truncated: false,
    size: 26,
    language: "JavaScript",
  });

  await fs.writeFile(path.join(root, "image.bin"), Buffer.from([0, 1, 2, 3, 4, 255]));
  await git("add", "image.bin");
  await git("commit", "-m", "Add binary image");
  const binaryHash = await head();
  const binary = await readFileAtRevision(root, { hash: binaryHash, path: "image.bin" });
  assert.equal(binary.binary, true);
  assert.equal(binary.text, null);
  assert.equal(binary.size, 6);

  await assert.rejects(() => readFileAtRevision(root, { hash: textHash, path: "../outside.txt" }), (error) => error?.code === "PATH_OUTSIDE_REPOSITORY");
  await assert.rejects(() => readFileAtRevision(root, { hash: "not-a-hash", path: "app.js" }), (error) => error?.code === "INVALID_ARGUMENT");
  await assert.rejects(() => readFileAtRevision(root, { hash: textHash, path: "missing.js" }), (error) => error?.code === "PATH_NOT_FOUND");
});
