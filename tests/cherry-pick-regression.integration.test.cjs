const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { cherryPickExecute, cherryPickPreview, sequencerAction } = require("../electron/git-service.cjs");

const execFileAsync = promisify(execFile);

test("cherry-pick regression covers preview, apply, conflict, and abort", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-cherry-pick-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  const write = (file, content) => fs.writeFile(path.join(root, file), content);

  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await write("app.js", "base\n");
  await git("add", ".");
  await git("commit", "-m", "Base commit");

  await git("checkout", "-b", "feature/clean");
  await write("clean.txt", "safe change\n");
  await git("add", "clean.txt");
  await git("commit", "-m", "Clean feature");
  const cleanHash = (await git("rev-parse", "HEAD")).stdout.trim();

  await git("checkout", "main");
  await git("checkout", "-b", "feature/conflict");
  await write("app.js", "conflicting change\n");
  await git("add", "app.js");
  await git("commit", "-m", "Conflicting feature");
  const conflictHash = (await git("rev-parse", "HEAD")).stdout.trim();
  await git("checkout", "main");
  await write("app.js", "main change\n");
  await git("commit", "-am", "Main change");

  const preview = await cherryPickPreview(root, [cleanHash, conflictHash]);
  assert.equal(preview.targetBranch, "main");
  assert.equal(preview.blocked, false);
  assert.equal(preview.commits.find((commit) => commit.hash === cleanHash).prediction, "clean");
  assert.equal(preview.commits.find((commit) => commit.hash === conflictHash).prediction, "conflicts");

  const applied = await cherryPickExecute(root, [cleanHash]);
  assert.equal(applied.status, "applied");
  assert.equal(applied.applied, 1);
  assert.equal((await git("status", "--porcelain")).stdout, "");
  assert.equal((await fs.readFile(path.join(root, "clean.txt"), "utf8")), "safe change\n");

  const conflicted = await cherryPickExecute(root, [conflictHash]);
  assert.equal(conflicted.status, "conflict");
  assert.deepEqual(conflicted.conflictFiles, ["app.js"]);

  const aborted = await sequencerAction(root, "abort");
  assert.equal(aborted.status, "applied");
  assert.equal(aborted.state.inProgress, false);
  assert.equal((await fs.readFile(path.join(root, "app.js"), "utf8")), "main change\n");
  assert.equal((await git("status", "--porcelain")).stdout, "");
});
