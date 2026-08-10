const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const {
  GitServiceError,
  getFileDiff,
  stageHunk,
  unstageHunk,
} = require("../electron/git-service.cjs");
const { parseWorkspacePatch } = require("../electron/git/workspace-operations.cjs");

const execFileAsync = promisify(execFile);

async function createRepository(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-workspace-hunks-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  const initial = Array.from({ length: 20 }, (_, index) => `line ${index + 1}\n`).join("");
  await fs.writeFile(path.join(root, "app.js"), initial);
  await git("add", "app.js");
  await git("commit", "-m", "Initial commit");
  return { root, git, initial };
}

async function createTwoHunkChange(repository) {
  const changed = repository.initial
    .replace("line 2\n", "line 2 changed\n")
    .replace("line 18\n", "line 18 changed\n");
  await fs.writeFile(path.join(repository.root, "app.js"), changed);
}

test("workspace diffs expose stable hunk IDs and apply one hunk at a time", async (t) => {
  const repository = await createRepository(t);
  await createTwoHunkChange(repository);

  const currentDiff = await getFileDiff(repository.root, { type: "workspace", path: "app.js" });
  assert.equal(currentDiff.hunks.length, 2);
  assert.equal(currentDiff.hunks[0].id.length, 64);
  const parsed = parseWorkspacePatch(currentDiff.diff, "app.js", GitServiceError);
  assert.deepEqual(currentDiff.hunks.map((hunk) => hunk.id), parsed.hunks.map((hunk) => hunk.id));

  const staged = await stageHunk(
    repository.root,
    { path: "app.js", hunkId: currentDiff.hunks[0].id, source: "unstaged" },
    { operationMode: "safe-write" },
  );
  const stagedFile = staged.status.files.find((file) => file.path === "app.js");
  assert.equal(staged.operation, "stage");
  assert.equal(staged.hunkId, currentDiff.hunks[0].id);
  assert.equal(stagedFile.staged, true);
  assert.equal(stagedFile.unstaged, true);

  const stagedDiff = await repository.git("diff", "--cached", "--", "app.js");
  const remainingDiff = await repository.git("diff", "--", "app.js");
  assert.match(stagedDiff.stdout, /line 2 changed/);
  assert.doesNotMatch(stagedDiff.stdout, /line 18 changed/);
  assert.match(remainingDiff.stdout, /line 18 changed/);
  assert.doesNotMatch(remainingDiff.stdout, /line 2 changed/);

  const stagedView = await getFileDiff(repository.root, { type: "workspace", staged: true, path: "app.js" });
  assert.equal(stagedView.hunks.length, 1);
  const unstaged = await unstageHunk(
    repository.root,
    { path: "app.js", hunkId: stagedView.hunks[0].id, source: "staged" },
    { operationMode: "safe-write" },
  );
  const unstagedFile = unstaged.status.files.find((file) => file.path === "app.js");
  assert.equal(unstaged.operation, "unstage");
  assert.equal(unstagedFile.staged, false);
  assert.equal(unstagedFile.unstaged, true);
  assert.equal((await repository.git("diff", "--cached", "--", "app.js")).stdout, "");
});

test("workspace hunk operations reject stale IDs and renderer patch input", async (t) => {
  const repository = await createRepository(t);
  await createTwoHunkChange(repository);
  const currentDiff = await getFileDiff(repository.root, { type: "workspace", path: "app.js" });

  await assert.rejects(
    () => stageHunk(repository.root, { path: "app.js", hunkId: currentDiff.hunks[0].id, patch: "arbitrary" }, { operationMode: "safe-write" }),
    (error) => error?.code === "INVALID_ARGUMENT",
  );
  await assert.rejects(
    () => stageHunk(repository.root, { path: "../outside", hunkId: currentDiff.hunks[0].id }, { operationMode: "safe-write" }),
    (error) => error?.code === "PATH_OUTSIDE_REPOSITORY",
  );

  await fs.writeFile(path.join(repository.root, "app.js"), repository.initial.replace("line 2\n", "line 2 changed again\n").replace("line 18\n", "line 18 changed\n"));
  await assert.rejects(
    () => stageHunk(repository.root, { path: "app.js", hunkId: currentDiff.hunks[0].id, source: "unstaged" }, { operationMode: "safe-write" }),
    (error) => error?.code === "STALE_DIFF",
  );
});
