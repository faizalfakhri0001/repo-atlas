const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { listFileHistory } = require("../electron/git/history.cjs");

const execFileAsync = promisify(execFile);

test("listFileHistory paginates a repository file and rejects paths outside it", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-history-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });

  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "app.js"), "export const value = 1;\n");
  await git("add", "app.js");
  await git("commit", "-m", "Add app");
  await fs.writeFile(path.join(root, "app.js"), "export const value = 2;\n");
  await git("commit", "-am", "Update app");
  await fs.writeFile(path.join(root, "app.js"), "export const value = 3;\n");
  await git("commit", "-am", "Update app again");

  const firstPage = await listFileHistory(root, { path: "app.js", limit: 2 });
  assert.equal(firstPage.currentPath, "app.js");
  assert.equal(firstPage.entries.length, 2);
  assert.equal(firstPage.hasMore, true);
  assert.equal(firstPage.entries[0].subject, "Update app again");

  const secondPage = await listFileHistory(root, { path: "app.js", limit: 2, skip: 2 });
  assert.equal(secondPage.entries.length, 1);
  assert.equal(secondPage.hasMore, false);

  await assert.rejects(() => listFileHistory(root, { path: "../outside.txt" }), (error) => error?.code === "PATH_OUTSIDE_REPOSITORY");
});

test("listFileHistory follows a renamed file back to its original path", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-history-rename-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });

  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.mkdir(path.join(root, "src"));
  await fs.writeFile(path.join(root, "src", "user.js"), "export const user = { active: true };\n");
  await git("add", "src/user.js");
  await git("commit", "-m", "Add user module");
  await fs.writeFile(path.join(root, "src", "user.js"), "export const user = { active: true, role: \"member\" };\n");
  await git("commit", "-am", "Update user module");
  await git("mv", "src/user.js", "src/account.js");
  await git("commit", "-m", "Rename user module");
  await fs.writeFile(path.join(root, "src", "account.js"), "export const account = { active: true, role: \"member\" };\n");
  await git("commit", "-am", "Update account module");

  const history = await listFileHistory(root, { path: "src/account.js", limit: 20 });

  assert.equal(history.hasMore, false);
  assert.deepEqual(
    history.entries.map(({ status, path: filePath, oldPath, parentHash }) => ({ status, path: filePath, oldPath, hasParent: Boolean(parentHash) })),
    [
      { status: "M", path: "src/account.js", oldPath: undefined, hasParent: true },
      { status: "R", path: "src/account.js", oldPath: "src/user.js", hasParent: true },
      { status: "M", path: "src/user.js", oldPath: undefined, hasParent: true },
      { status: "A", path: "src/user.js", oldPath: undefined, hasParent: false },
    ],
  );
});
