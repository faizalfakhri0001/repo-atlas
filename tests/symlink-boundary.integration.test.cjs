const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { getFileDiff, readFileAtRevision, readRepositoryFile } = require("../electron/git-service.cjs");

const execFileAsync = promisify(execFile);

test("file, revision, and diff APIs reject symlinks outside the repository", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-symlink-root-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-symlink-outside-"));
  t.after(() => Promise.all([
    fs.rm(root, { recursive: true, force: true }),
    fs.rm(outside, { recursive: true, force: true }),
  ]));

  await execFileAsync("git", ["init", "-b", "main"], { cwd: root, encoding: "utf8" });
  await fs.writeFile(path.join(outside, "secret.txt"), "private material\n");
  try {
    await fs.symlink(path.join(outside, "secret.txt"), path.join(root, "linked.txt"));
  } catch (error) {
    t.skip(`symlink creation is unavailable: ${error.code ?? error.message}`);
    return;
  }

  const outsidePath = (error) => error?.code === "PATH_OUTSIDE_REPOSITORY";
  await assert.rejects(() => readRepositoryFile(root, "linked.txt"), outsidePath);
  await assert.rejects(() => readFileAtRevision(root, { hash: "a".repeat(40), path: "linked.txt" }), outsidePath);
  await assert.rejects(() => getFileDiff(root, { type: "workspace", path: "linked.txt" }), outsidePath);
});
