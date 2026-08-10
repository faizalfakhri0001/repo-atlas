const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const { branchIntelligence } = require("../electron/git-service.cjs");

const execFileAsync = promisify(execFile);

test("branch intelligence reports ahead and behind counts against the current default", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-branches-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  const write = (name, contents) => fs.writeFile(path.join(root, name), contents);

  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await write("README.md", "initial\n");
  await git("add", "README.md");
  await git("commit", "-m", "Initial commit");
  await write("README.md", "main\n");
  await git("add", "README.md");
  await git("commit", "-m", "Advance main");
  await git("branch", "feature/ahead", "main");
  await git("checkout", "feature/ahead");
  await write("ahead.txt", "ahead\n");
  await git("add", "ahead.txt");
  await git("commit", "-m", "Add ahead change");
  await git("checkout", "main");
  await git("branch", "feature/behind", "main~1");

  const result = await branchIntelligence(root);
  const ahead = result.branches.find((branch) => branch.name === "feature/ahead");
  const behind = result.branches.find((branch) => branch.name === "feature/behind");

  assert.equal(result.defaultBranch, "main");
  assert.equal(result.defaultBranchSource, "current");
  assert.deepEqual(
    { ahead: ahead.aheadOfDefault, behind: ahead.behindDefault },
    { ahead: 1, behind: 0 },
  );
  assert.deepEqual(
    { ahead: behind.aheadOfDefault, behind: behind.behindDefault },
    { ahead: 0, behind: 1 },
  );
});
