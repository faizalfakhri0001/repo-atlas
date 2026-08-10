const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { analyticsSummary } = require("../electron/git-service.cjs");

const execFileAsync = promisify(execFile);

test("analytics summary serializes bounded backend data for an IPC response", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-analytics-summary-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "app.js"), "analytics\n");
  await git("add", "app.js");
  await git("commit", "-m", "Add app");

  const result = await analyticsSummary(root, { maxCommits: 10, limit: 5 });
  assert.equal(result.scope.processedCommits, 1);
  assert.ok(Array.isArray(result.files));
  assert.ok(Array.isArray(result.authors));
  assert.equal(result.files[0].path, "app.js");
  assert.equal(result.authors[0].email, "repo-atlas@example.test");
  assert.equal(result.files[0].authors[0].key, "email:repo-atlas@example.test");
});
