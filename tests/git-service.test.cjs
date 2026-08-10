const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const {
  parseCommits,
  parseStatus,
  parseWorktrees,
  parseRemotes,
  parseNumstatZ,
  parseNameStatusZ,
  parseMergeTreeConflicts,
  parseUpstreamTrack,
  scanRepository,
  listRepositoryFiles,
  parseRepositoryFileList,
  readRepositoryFile,
  listCommits,
  getCommitDetails,
  getFileDiff,
  compareRefs,
  cherryPickPreview,
  cherryPickExecute,
  sequencerAction,
} = require("../electron/git-service.cjs");

test("parseStatus reads branch metadata and file states", () => {
  const raw = [
    "# branch.oid 1234567890abcdef",
    "# branch.head main",
    "# branch.upstream origin/main",
    "# branch.ab +2 -1",
    "1 .M N... 100644 100644 100644 abcdef0 abcdef0 src/app.js",
    "? notes.txt",
  ].join("\n");

  const parsed = parseStatus(raw);
  assert.equal(parsed.branch, "main");
  assert.equal(parsed.upstream, "origin/main");
  assert.equal(parsed.ahead, 2);
  assert.equal(parsed.behind, 1);
  assert.equal(parsed.files.length, 2);
  assert.equal(parsed.files[0].path, "src/app.js");
  assert.equal(parsed.files[1].kind, "untracked");
});

test("parseWorktrees reads porcelain blocks", () => {
  const raw = [
    "worktree /tmp/repo",
    "HEAD 1111111111111111111111111111111111111111",
    "branch refs/heads/main",
    "",
    "worktree /tmp/repo-feature",
    "HEAD 2222222222222222222222222222222222222222",
    "detached",
  ].join("\n");

  const worktrees = parseWorktrees(raw);
  assert.equal(worktrees.length, 2);
  assert.equal(worktrees[0].branch, "main");
  assert.equal(worktrees[1].detached, true);
});

test("parseCommits reads record and field separators", () => {
  const raw = "a".repeat(40) + "\x1f" + "b".repeat(40) + "\x1fHEAD -> main, tag: v1.0.0\x1fAda\x1fada@example.com\x1f2026-07-25T10:00:00+07:00\x1fInitial commit\x1e";
  const commits = parseCommits(raw);
  assert.equal(commits.length, 1);
  assert.equal(commits[0].shortHash, "aaaaaaaa");
  assert.deepEqual(commits[0].refs, ["HEAD -> main", "tag: v1.0.0"]);
  assert.equal(commits[0].parents.length, 1);
});

test("parseRemotes groups fetch and push URLs", () => {
  const remotes = parseRemotes("origin\thttps://example.com/repo.git (fetch)\norigin\thttps://example.com/repo.git (push)");
  assert.deepEqual(remotes, [{ name: "origin", fetchUrl: "https://example.com/repo.git", pushUrl: "https://example.com/repo.git" }]);
});

test("parseNumstatZ handles plain entries, renames, and binary files", () => {
  const raw = ["3\t1\tsrc/app.js", "2\t0\t", "old/name.js", "new/name.js", "-\t-\tlogo.png", ""].join("\0");
  const items = parseNumstatZ(raw);
  assert.equal(items.length, 3);
  assert.deepEqual(items[0], { path: "src/app.js", oldPath: "", additions: 3, deletions: 1, binary: false });
  assert.deepEqual(items[1], { path: "new/name.js", oldPath: "old/name.js", additions: 2, deletions: 0, binary: false });
  assert.equal(items[2].binary, true);
});

test("parseNameStatusZ handles statuses and rename pairs", () => {
  const raw = ["M", "src/app.js", "R092", "old/name.js", "new/name.js", "A", "added.txt", ""].join("\0");
  const items = parseNameStatusZ(raw);
  assert.equal(items.length, 3);
  assert.deepEqual(items[0], { status: "M", score: null, oldPath: "", path: "src/app.js" });
  assert.deepEqual(items[1], { status: "R", score: 92, oldPath: "old/name.js", path: "new/name.js" });
  assert.equal(items[2].status, "A");
});

test("parseMergeTreeConflicts distinguishes clean, conflicted, and unsupported", () => {
  assert.deepEqual(parseMergeTreeConflicts({ code: 0, stdout: "abc", stderr: "" }), { status: "clean", files: [] });
  assert.deepEqual(parseMergeTreeConflicts({ code: 1, stdout: "treeoid\napp.js\napp.js\nserver.js", stderr: "" }), {
    status: "conflicts",
    files: ["app.js", "server.js"],
  });
  assert.equal(parseMergeTreeConflicts({ code: 129, stdout: "", stderr: "usage: git merge-tree" }).status, "unsupported");
});

test("parseUpstreamTrack reads ahead/behind/gone markers", () => {
  assert.deepEqual(parseUpstreamTrack("[ahead 3, behind 2]"), { ahead: 3, behind: 2, gone: false });
  assert.deepEqual(parseUpstreamTrack("[gone]"), { ahead: 0, behind: 0, gone: true });
  assert.deepEqual(parseUpstreamTrack(""), { ahead: 0, behind: 0, gone: false });
});

test("parseRepositoryFileList merges tracked and non-ignored paths", () => {
  const files = parseRepositoryFileList("src/app.js\0package.json\0", "notes/todo.md\0src/app.js\0");
  assert.deepEqual(files, [
    { path: "notes/todo.md", name: "todo.md", extension: "md", tracked: false, size: null },
    { path: "package.json", name: "package.json", extension: "json", tracked: true, size: null },
    { path: "src/app.js", name: "app.js", extension: "js", tracked: true, size: null },
  ]);
});

test("scanRepository integrates with a real local Git repository", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "README.md"), "# test\n");
  await git("add", "README.md");
  await git("commit", "-m", "Initial commit");
  await git("branch", "feature/demo");
  await fs.writeFile(path.join(root, "working.txt"), "dirty\n");

  const result = await scanRepository(root);
  assert.equal(result.repository.name, path.basename(root));
  assert.equal(result.repository.currentBranch, "main");
  assert.equal(result.repository.defaultBranch, "main");
  assert.equal(result.state.inProgress, false);
  assert.equal(result.repository.totalCommits, 1);
  assert.ok(result.commits.length >= 1);
  assert.ok(result.branches.some((branch) => branch.name === "feature/demo"));
  assert.ok(result.status.files.some((file) => file.path === "working.txt"));
  assert.ok(result.worktrees.length >= 1);
});

test("listRepositoryFiles follows Git ignore rules and reports tracked state", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-files-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, ".gitignore"), "ignored.log\n");
  await fs.writeFile(path.join(root, "tracked.js"), "export {}\n");
  await fs.writeFile(path.join(root, "ignored.log"), "ignore me\n");
  await fs.writeFile(path.join(root, "untracked.md"), "read me\n");
  await git("add", ".gitignore", "tracked.js");
  await git("commit", "-m", "Initial files");

  const files = await listRepositoryFiles(root);
  assert.deepEqual(files.map((file) => file.path), [".gitignore", "tracked.js", "untracked.md"]);
  assert.equal(files.find((file) => file.path === "tracked.js").tracked, true);
  assert.equal(files.find((file) => file.path === "untracked.md").tracked, false);
  assert.equal(files.some((file) => file.path === "ignored.log"), false);
});

test("readRepositoryFile returns text, binary, and bounded preview metadata", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-content-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "app.js"), "export const answer = 42;\n");
  await fs.writeFile(path.join(root, "image.bin"), Buffer.from([0, 1, 2, 3, 4]));
  await fs.writeFile(path.join(root, "large.txt"), "x".repeat(1_000_025));
  await git("add", ".");
  await git("commit", "-m", "Add files");

  const text = await readRepositoryFile(root, "app.js");
  assert.deepEqual(text, {
    path: "app.js",
    text: "export const answer = 42;\n",
    binary: false,
    truncated: false,
    size: 26,
    language: "JavaScript",
  });

  const binary = await readRepositoryFile(root, "image.bin");
  assert.equal(binary.binary, true);
  assert.equal(binary.text, null);

  const large = await readRepositoryFile(root, "large.txt");
  assert.equal(large.truncated, true);
  assert.equal(large.size, 1_000_025);
  assert.equal(large.text.length, 1_000_000);

  await assert.rejects(() => readRepositoryFile(root, "../outside.txt"), (error) => error?.code === "PATH_OUTSIDE_REPOSITORY");
});

test("commit inspection, compare, and cherry-pick flows work end to end", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-flow-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  const write = (file, content) => fs.writeFile(path.join(root, file), content);

  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await write("app.js", "one\n");
  await git("add", ".");
  await git("commit", "-m", "Initial commit");
  await write("app.js", "one\ntwo\n");
  await git("add", ".");
  await git("commit", "-m", "Second commit");

  // clean side branch
  await git("checkout", "-b", "feature/clean", "HEAD~1");
  await write("clean.txt", "clean\n");
  await git("add", ".");
  await git("commit", "-m", "Add clean file");
  // conflicting side branch
  await git("checkout", "-b", "feature/conflict", "main~1");
  await write("app.js", "different\n");
  await git("add", ".");
  await git("commit", "-m", "Conflicting change");
  await git("checkout", "main");

  const log = await listCommits(root, { limit: 10 });
  assert.equal(log.total, 4);
  assert.ok(log.commits.length === 4);

  const filtered = await listCommits(root, { refs: ["feature/clean"], limit: 10 });
  assert.equal(filtered.commits.length, 2);

  const headHash = log.commits.find((commit) => commit.refs.some((ref) => ref.includes("main"))).hash;
  const details = await getCommitDetails(root, headHash);
  assert.equal(details.subject, "Second commit");
  assert.equal(details.files.length, 1);
  assert.equal(details.files[0].path, "app.js");

  const diff = await getFileDiff(root, { from: details.parents[0], to: details.hash, path: "app.js" });
  assert.ok(diff.diff.includes("+two"));

  const cleanCompare = await compareRefs(root, "main", "feature/clean");
  assert.equal(cleanCompare.ahead, 1);
  assert.equal(cleanCompare.conflicts.status, "clean");
  const conflictCompare = await compareRefs(root, "main", "feature/conflict");
  assert.equal(conflictCompare.conflicts.status, "conflicts");
  assert.deepEqual(conflictCompare.conflicts.files, ["app.js"]);

  const cleanTip = (await git("rev-parse", "feature/clean")).stdout.trim();
  const conflictTip = (await git("rev-parse", "feature/conflict")).stdout.trim();

  const preview = await cherryPickPreview(root, [cleanTip, conflictTip]);
  assert.equal(preview.targetBranch, "main");
  assert.equal(preview.commits.find((c) => c.hash === cleanTip).prediction, "clean");
  assert.equal(preview.commits.find((c) => c.hash === conflictTip).prediction, "conflicts");

  const applied = await cherryPickExecute(root, [cleanTip]);
  assert.equal(applied.status, "applied");

  const conflicted = await cherryPickExecute(root, [conflictTip]);
  assert.equal(conflicted.status, "conflict");
  assert.deepEqual(conflicted.conflictFiles, ["app.js"]);
  const aborted = await sequencerAction(root, "abort");
  assert.equal(aborted.state.inProgress, false);

  await assert.rejects(() => cherryPickExecute(root, ["not-a-hash"]), /valid commit hash/);
  await assert.rejects(() => compareRefs(root, "main", "no-such-branch"), /does not resolve/);
});
