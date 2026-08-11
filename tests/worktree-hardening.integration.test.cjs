const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const {
  assertRelativePath,
  createRepositoryId,
  normalizeIdentityPath,
} = require("../electron/git/core.cjs");
const {
  getWorktreeDetails,
  previewWorktreeRemove,
  previewWorktreePrune,
  pruneWorktrees,
  removeWorktree,
  scanRepository,
} = require("../electron/git-service.cjs");

const execFileAsync = promisify(execFile);

test("multiple linked worktrees keep dirty, locked, and stale states distinguishable", async (t) => {
  const container = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas worktree-é-"));
  const root = path.join(container, "main space-東京");
  const clean = path.join(container, "linked clean-é");
  const dirty = path.join(container, "linked dirty-é");
  const locked = path.join(container, "linked locked-東京");
  const stale = path.join(container, "linked stale-é");
  await fs.mkdir(root);
  t.after(() => fs.rm(container, { recursive: true, force: true }));

  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "README.md"), "worktrees\n");
  await git("add", "README.md");
  await git("commit", "-m", "Initial commit");
  await Promise.all([
    git("branch", "feature/clean"),
    git("branch", "feature/dirty"),
    git("branch", "feature/locked"),
    git("branch", "feature/stale"),
  ]);
  await git("worktree", "add", "--", clean, "feature/clean");
  await git("worktree", "add", "--", dirty, "feature/dirty");
  await git("worktree", "add", "--", locked, "feature/locked");
  await git("worktree", "add", "--", stale, "feature/stale");
  await fs.writeFile(path.join(dirty, "space file-é.txt"), "uncommitted\n");
  await git("worktree", "lock", "--reason", "maintenance", locked);
  await fs.rm(stale, { recursive: true, force: true });

  const snapshot = await scanRepository(root);
  const listedPaths = snapshot.worktrees.map((worktree) => worktree.path);
  assert.equal(snapshot.worktrees.length, 5);
  assert.ok(listedPaths.includes(await fs.realpath(root)));
  assert.ok(listedPaths.includes(await fs.realpath(clean)));
  assert.ok(listedPaths.includes(await fs.realpath(dirty)));
  assert.ok(snapshot.worktrees.some((worktree) => worktree.branch === "feature/locked" && worktree.locked));
  assert.ok(snapshot.worktrees.some((worktree) => worktree.branch === "feature/stale" && worktree.prunable));

  const dirtyDetails = await getWorktreeDetails(root, dirty);
  assert.equal(dirtyDetails.dirty, true);
  assert.equal(dirtyDetails.changes, 1);
  assert.equal(dirtyDetails.worktree.branch, "feature/dirty");

  const cleanPreview = await previewWorktreeRemove(root, clean, { operationMode: "safe-write", currentWorktreePath: root });
  assert.equal(cleanPreview.allowed, true);
  const removed = await removeWorktree(root, clean, { operationMode: "safe-write", currentWorktreePath: root });
  assert.equal(removed.worktrees.some((worktree) => worktree.branch === "feature/clean"), false);
  await assert.rejects(() => fs.stat(clean), (error) => error?.code === "ENOENT");

  const dirtyPreview = await previewWorktreeRemove(root, dirty, { operationMode: "safe-write", currentWorktreePath: root });
  assert.equal(dirtyPreview.allowed, false);
  assert.ok(dirtyPreview.blockingReasons.some((reason) => reason.startsWith("DIRTY_WORKTREE_CANNOT_BE_REMOVED")));

  const lockedPreview = await previewWorktreeRemove(root, locked, { operationMode: "safe-write", currentWorktreePath: root });
  assert.equal(lockedPreview.allowed, false);
  assert.ok(lockedPreview.blockingReasons.some((reason) => reason.startsWith("LOCKED_WORKTREE_CANNOT_BE_REMOVED")));

  const stalePreview = await previewWorktreeRemove(root, stale, { operationMode: "safe-write", currentWorktreePath: root });
  assert.equal(stalePreview.allowed, false);
  assert.ok(stalePreview.prunable);
  await assert.rejects(
    () => getWorktreeDetails(root, stale),
    (error) => error?.code === "WORKTREE_UNAVAILABLE",
  );
  assert.ok(stalePreview.blockingReasons.some((reason) => reason.startsWith("WORKTREE_UNAVAILABLE")));

  const prunePreview = await previewWorktreePrune(root, { operationMode: "safe-write" });
  assert.equal(prunePreview.allowed, true);
  assert.ok(prunePreview.items.some((item) => item.raw.includes("stale")));
  const pruned = await pruneWorktrees(root, { operationMode: "safe-write" });
  assert.ok(pruned.worktrees.every((worktree) => worktree.branch !== "feature/stale" && !worktree.prunable));
});

test("path validation handles spaces, Unicode, Windows drives, and UNC forms", () => {
  assert.equal(assertRelativePath("src\\shared folder\\café.txt"), "src/shared folder/café.txt");
  for (const value of [
    "C:\\Users\\developer\\outside.txt",
    "C:/Users/developer/outside.txt",
    "\\\\server\\share\\outside.txt",
  ]) {
    assert.throws(() => assertRelativePath(value), (error) => error?.code === "INVALID_PATH");
  }

  assert.equal(normalizeIdentityPath("C:\\Projects\\Repo\\.git\\"), "c:/Projects/Repo/.git");
  assert.equal(normalizeIdentityPath("\\\\server\\share\\Repo\\.git\\"), "//server/share/Repo/.git");
  assert.equal(createRepositoryId("C:\\Projects\\Repo\\.git\\").length, 64);
});
