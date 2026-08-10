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
  await git("checkout", "-b", "feature/merged");
  await write("merged.txt", "merged\n");
  await git("add", "merged.txt");
  await git("commit", "-m", "Add merged change");
  await git("checkout", "main");
  await git("merge", "--ff-only", "feature/merged");
  await git("branch", "feature/ahead", "main");
  await git("checkout", "feature/ahead");
  await write("ahead.txt", "ahead\n");
  await git("add", "ahead.txt");
  await git("commit", "-m", "Add ahead change");
  await git("checkout", "main");
  await git("branch", "feature/behind", "main~1");
  await git("checkout", "-b", "feature/diverged", "main~1");
  await write("diverged.txt", "diverged\n");
  await git("add", "diverged.txt");
  await git("commit", "-m", "Add diverged change");
  await git("checkout", "main");
  await git("branch", "feature/gone", "main");
  await git("remote", "add", "origin", "/tmp/repo-atlas-missing-remote.git");
  const goneHash = (await git("rev-parse", "feature/gone")).stdout.trim();
  await git("update-ref", "refs/remotes/origin/feature/gone", goneHash);
  await git("branch", "--set-upstream-to=origin/feature/gone", "feature/gone");
  await git("update-ref", "-d", "refs/remotes/origin/feature/gone");

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
  assert.equal(ahead.mergeBase, await git("rev-parse", "main").then((result) => result.stdout.trim().slice(0, 40)));
  const merged = result.branches.find((branch) => branch.name === "feature/merged");
  assert.equal(merged.mergedIntoDefault, true);
  assert.equal(merged.status, "merged");
  const gone = result.branches.find((branch) => branch.name === "feature/gone");
  assert.equal(gone.goneUpstream, true);
  assert.equal(gone.status, "gone");
  const diverged = result.branches.find((branch) => branch.name === "feature/diverged");
  assert.deepEqual({ ahead: diverged.aheadOfDefault, behind: diverged.behindDefault }, { ahead: 1, behind: 1 });
  assert.equal(diverged.status, "diverged");
});

test("branch intelligence keeps five hundred local branches bounded", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-branch-limit-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "README.md"), "initial\n");
  await git("add", "README.md");
  await git("commit", "-m", "Initial commit");
  for (let index = 0; index < 500; index += 1) {
    await git("branch", `feature/bounded-${String(index).padStart(3, "0")}`, "main");
  }

  const result = await branchIntelligence(root);
  assert.equal(result.scope.totalLocal, 501);
  assert.equal(result.scope.analyzedLocal, 500);
  assert.equal(result.scope.omittedLocal, 1);
  const analyzedLocal = result.branches.filter((branch) => !branch.remote);
  assert.equal(analyzedLocal.length, 500);
  assert.equal(new Set(analyzedLocal.map((branch) => branch.name)).size, 500);
  assert.equal(analyzedLocal.every((branch) => branch.analyzed), true);
  assert.equal(result.scope.concurrency, 4);
  assert.equal(result.scope.truncated, true);
});
