const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { getFileDiff, readFileAtRevision, readRepositoryFile } = require("../electron/git-service.cjs");

const execFileAsync = promisify(execFile);

test("binary files remain binary in workspace, revision, and diff responses", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-binary-files-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  const binaryPath = path.join(root, "assets", "logo.bin");
  const firstBytes = Buffer.from([0, 1, 2, 3, 255, 10, 11, 12]);
  const secondBytes = Buffer.from([0, 1, 2, 3, 254, 10, 11, 12]);

  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.mkdir(path.dirname(binaryPath), { recursive: true });
  await fs.writeFile(binaryPath, firstBytes);
  await git("add", "assets/logo.bin");
  await git("commit", "-m", "Add binary asset");
  const firstHash = (await git("rev-parse", "HEAD")).stdout.trim();

  const workspace = await readRepositoryFile(root, "assets/logo.bin");
  assert.equal(workspace.binary, true);
  assert.equal(workspace.text, null);
  assert.equal(workspace.size, firstBytes.length);

  const revision = await readFileAtRevision(root, { path: "assets/logo.bin", hash: firstHash });
  assert.equal(revision.binary, true);
  assert.equal(revision.text, null);
  assert.equal(revision.hash, firstHash);
  assert.equal(revision.size, firstBytes.length);

  await fs.writeFile(binaryPath, secondBytes);
  await git("commit", "-am", "Update binary asset");
  const secondHash = (await git("rev-parse", "HEAD")).stdout.trim();
  const diff = await getFileDiff(root, {
    type: "commit",
    from: firstHash,
    to: secondHash,
    path: "assets/logo.bin",
  });

  assert.equal(diff.binary, true);
  assert.equal(diff.truncated, false);
});
