const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { compareRefs } = require("../electron/git-service.cjs");

const execFileAsync = promisify(execFile);

test("compare regression reports ancestry, changed files, and conflicts", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-compare-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  const write = (file, content) => fs.writeFile(path.join(root, file), content);

  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await write("app.js", "base\n");
  await git("add", ".");
  await git("commit", "-m", "Base commit");
  const baseHash = (await git("rev-parse", "HEAD")).stdout.trim();

  await git("checkout", "-b", "feature/compare");
  await write("feature.txt", "feature change\n");
  await git("add", "feature.txt");
  await git("commit", "-m", "Feature change");
  const featureHash = (await git("rev-parse", "HEAD")).stdout.trim();

  await git("checkout", "main");
  await write("app.js", "main change\n");
  await git("commit", "-am", "Main change");
  const mainHash = (await git("rev-parse", "HEAD")).stdout.trim();

  const clean = await compareRefs(root, "main", "feature/compare");
  assert.equal(clean.base.hash, mainHash);
  assert.equal(clean.head.hash, featureHash);
  assert.equal(clean.mergeBase, baseHash);
  assert.equal(clean.ahead, 1);
  assert.equal(clean.behind, 1);
  assert.equal(clean.fastForwardPossible, false);
  assert.equal(clean.conflicts.status, "clean");
  assert.equal(clean.commits.length, 1);
  assert.equal(clean.commits[0].hash, featureHash);
  assert.deepEqual(clean.files.map((file) => file.path), ["feature.txt"]);

  await git("checkout", "-b", "feature/conflict", baseHash);
  await write("app.js", "conflicting feature\n");
  await git("commit", "-am", "Conflicting feature");

  const conflict = await compareRefs(root, "main", "feature/conflict");
  assert.equal(conflict.mergeBase, baseHash);
  assert.equal(conflict.ahead, 1);
  assert.equal(conflict.behind, 1);
  assert.equal(conflict.conflicts.status, "conflicts");
  assert.deepEqual(conflict.conflicts.files, ["app.js"]);
});
