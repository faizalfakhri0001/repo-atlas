const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const {
  previewWorktreeRemove,
  removeWorktree,
  previewWorktreePrune,
  pruneWorktrees,
} = require("../electron/git-service.cjs");

test("worktree removal preview enforces main, dirty, locked, unknown, and write guards", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-worktree-cleanup-"));
  const clean = `${root}-clean`;
  const dirty = `${root}-dirty`;
  const locked = `${root}-locked`;
  const stale = `${root}-stale`;
  t.after(() => Promise.all([
    fs.rm(root, { recursive: true, force: true }),
    fs.rm(clean, { recursive: true, force: true }),
    fs.rm(dirty, { recursive: true, force: true }),
    fs.rm(locked, { recursive: true, force: true }),
    fs.rm(stale, { recursive: true, force: true }),
  ]));

  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "README.md"), "cleanup\n");
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
  await fs.writeFile(path.join(dirty, "uncommitted.txt"), "dirty\n");
  await git("worktree", "lock", "--reason", "maintenance", locked);
  await fs.rm(stale, { recursive: true, force: true });

  const mainPreview = await previewWorktreeRemove(root, root, { operationMode: "safe-write", currentWorktreePath: root });
  assert.equal(mainPreview.allowed, false);
  assert.equal(mainPreview.main, true);
  assert.ok(mainPreview.blockingReasons.some((reason) => reason.startsWith("MAIN_WORKTREE_CANNOT_BE_REMOVED")));
  assert.ok(mainPreview.blockingReasons.some((reason) => reason.startsWith("CURRENT_WORKTREE_CANNOT_BE_REMOVED")));

  const unknownPreview = await previewWorktreeRemove(root, `${root}-unknown`, { operationMode: "safe-write" });
  assert.equal(unknownPreview.allowed, false);
  assert.ok(unknownPreview.blockingReasons.some((reason) => reason.startsWith("WORKTREE_NOT_FOUND")));

  const readOnlyPreview = await previewWorktreeRemove(root, clean);
  assert.equal(readOnlyPreview.allowed, false);
  assert.ok(readOnlyPreview.blockingReasons.some((reason) => reason.startsWith("READ_ONLY_MODE")));

  const dirtyPreview = await previewWorktreeRemove(root, dirty, { operationMode: "safe-write" });
  assert.equal(dirtyPreview.allowed, false);
  assert.equal(dirtyPreview.dirty, true);
  assert.equal(dirtyPreview.changes, 1);
  assert.ok(dirtyPreview.blockingReasons.some((reason) => reason.startsWith("DIRTY_WORKTREE_CANNOT_BE_REMOVED")));

  const lockedPreview = await previewWorktreeRemove(root, locked, { operationMode: "safe-write" });
  assert.equal(lockedPreview.allowed, false);
  assert.equal(lockedPreview.locked, true);
  assert.ok(lockedPreview.blockingReasons.some((reason) => reason.startsWith("LOCKED_WORKTREE_CANNOT_BE_REMOVED")));

  const cleanPreview = await previewWorktreeRemove(root, clean, { operationMode: "safe-write" });
  assert.equal(cleanPreview.allowed, true);
  const cleanCanonicalPath = await fs.realpath(clean);
  const removed = await removeWorktree(root, clean, { operationMode: "safe-write" });
  assert.equal(removed.removedPath, cleanCanonicalPath);
  await assert.rejects(() => fs.stat(clean), (error) => error?.code === "ENOENT");
  assert.equal(removed.worktrees.some((worktree) => worktree.branch === "feature/clean"), false);
});

test("worktree prune preview requires confirmation and removes only stale metadata", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-worktree-prune-"));
  const stale = `${root}-stale`;
  t.after(() => Promise.all([
    fs.rm(root, { recursive: true, force: true }),
    fs.rm(stale, { recursive: true, force: true }),
  ]));

  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "README.md"), "prune\n");
  await git("add", "README.md");
  await git("commit", "-m", "Initial commit");
  await git("branch", "feature/stale");
  await git("worktree", "add", "--", stale, "feature/stale");
  await fs.rm(stale, { recursive: true, force: true });

  const readOnly = await previewWorktreePrune(root);
  assert.equal(readOnly.allowed, false);
  assert.ok(readOnly.items.length > 0);
  assert.ok(readOnly.blockingReasons.some((reason) => reason.startsWith("READ_ONLY_MODE")));

  const preview = await previewWorktreePrune(root, { operationMode: "safe-write" });
  assert.equal(preview.allowed, true);
  assert.ok(preview.items.length > 0);

  const pruned = await pruneWorktrees(root, { operationMode: "safe-write" });
  assert.ok(pruned.items.length > 0);
  assert.equal(pruned.worktrees.some((worktree) => worktree.prunable || worktree.path === stale), false);
});
