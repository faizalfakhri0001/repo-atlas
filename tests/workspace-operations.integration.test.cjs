const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const {
  MAX_WORKSPACE_OPERATION_PATHS,
  parseStatus,
  stageFiles,
  unstageFiles,
} = require("../electron/git-service.cjs");

const execFileAsync = promisify(execFile);

test("parseStatus exposes independent index and worktree state", () => {
  const parsed = parseStatus([
    "# branch.oid 1234567890abcdef",
    "# branch.head main",
    "1 MM N... 100644 100644 100644 abcdef0 abcdef0 src/app.js",
    "1 A. N... 000000 100644 100644 0000000 abcdef0 staged.js",
    "? notes.md",
    "u UU N... 100644 100644 100644 100644 abcdef0 abcdef0 abcdef0 conflict.js",
  ].join("\n"));

  const byPath = new Map(parsed.files.map((file) => [file.path, file]));
  assert.deepEqual(byPath.get("src/app.js"), {
    kind: "changed",
    index: "M",
    worktree: "M",
    path: "src/app.js",
    indexStatus: "M",
    worktreeStatus: "M",
    staged: true,
    unstaged: true,
    untracked: false,
    conflicted: false,
  });
  assert.equal(byPath.get("staged.js").staged, true);
  assert.equal(byPath.get("staged.js").unstaged, false);
  assert.equal(byPath.get("notes.md").untracked, true);
  assert.equal(byPath.get("notes.md").unstaged, true);
  assert.equal(byPath.get("conflict.js").conflicted, true);
  assert.equal(byPath.get("conflict.js").staged, false);
});

test("stage and unstage files return refreshed status for spaces and Unicode paths", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-workspace-operations-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "app.js"), "initial\n");
  await git("add", "app.js");
  await git("commit", "-m", "Initial commit");

  await fs.writeFile(path.join(root, "app.js"), "changed\n");
  await fs.writeFile(path.join(root, "space file.js"), "space\n");
  await fs.writeFile(path.join(root, "unicode-é.js"), "unicode\n");

  const staged = await stageFiles(root, ["app.js", "space file.js", "unicode-é.js"], { operationMode: "safe-write" });
  assert.equal(staged.operation, "stage");
  assert.equal(staged.changed, true);
  assert.equal(staged.status.files.every((file) => file.staged), true);
  assert.deepEqual(staged.paths, ["app.js", "space file.js", "unicode-é.js"]);

  await fs.writeFile(path.join(root, "app.js"), "staged then edited\n");
  const mixed = (await stageFiles(root, ["app.js"], { operationMode: "safe-write" })).status.files.find((file) => file.path === "app.js");
  assert.equal(mixed.staged, true);
  assert.equal(mixed.unstaged, false);

  await fs.writeFile(path.join(root, "app.js"), "staged then edited again\n");
  const beforeUnstage = (await stageFiles(root, ["app.js"], { operationMode: "safe-write" })).status.files.find((file) => file.path === "app.js");
  assert.equal(beforeUnstage.staged, true);
  assert.equal(beforeUnstage.unstaged, false);
  const unstaged = await unstageFiles(root, ["app.js"], { operationMode: "safe-write" });
  const appStatus = unstaged.status.files.find((file) => file.path === "app.js");
  assert.equal(unstaged.operation, "unstage");
  assert.equal(appStatus.staged, false);
  assert.equal(appStatus.unstaged, true);
});

test("workspace write operations enforce safe-write mode and path limits", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-workspace-security-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "app.js"), "initial\n");
  await git("add", "app.js");
  await git("commit", "-m", "Initial commit");

  await assert.rejects(() => stageFiles(root, ["app.js"]), (error) => error?.code === "READ_ONLY_MODE");
  await assert.rejects(() => stageFiles(root, ["../outside"], { operationMode: "safe-write" }), (error) => error?.code === "PATH_OUTSIDE_REPOSITORY");
  await assert.rejects(
    () => stageFiles(root, Array.from({ length: MAX_WORKSPACE_OPERATION_PATHS + 1 }, (_, index) => `file-${index}.js`), { operationMode: "safe-write" }),
    (error) => error?.code === "INVALID_ARGUMENT",
  );
});
