const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { refreshRepositoryPartial } = require("../electron/git-service.cjs");

const execFileAsync = promisify(execFile);

test("refreshRepositoryPartial returns only requested status and ref sections", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-partial-refresh-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "app.js"), "export const ready = true;\n");
  await git("add", "app.js");
  await git("commit", "-m", "Add app");

  const status = await refreshRepositoryPartial(root, ["status"]);
  assert.deepEqual(Object.keys(status.data).sort(), ["repository", "scannedAt", "status"]);
  assert.equal(status.data.status.branch, "main");
  assert.equal(status.data.repository.currentBranch, "main");

  const refs = await refreshRepositoryPartial(root, ["refs"]);
  assert.ok(Array.isArray(refs.data.branches));
  assert.ok(Array.isArray(refs.data.commits));
  assert.ok(Array.isArray(refs.data.tags));
  assert.equal(refs.data.status, undefined);

  const head = await refreshRepositoryPartial(root, ["head"]);
  assert.ok(Array.isArray(head.data.commits));
  assert.ok(head.data.state);
  assert.ok(head.data.status);

  await assert.rejects(() => refreshRepositoryPartial(root, ["analytics"]), (error) => error?.code === "INVALID_ARGUMENT");
  await assert.rejects(() => refreshRepositoryPartial(root, []), (error) => error?.code === "INVALID_ARGUMENT");
});
