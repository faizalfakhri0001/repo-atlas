const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const test = require("node:test");
const { getAnalyticsCache, getAnalyticsIndex } = require("../electron/git/analytics/index.cjs");

const execFileAsync = promisify(execFile);

test("path-scoped analytics queries Git with a bounded repository-relative path", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-activity-path-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.mkdir(path.join(root, "src", "api"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "api", "payments.js"), "export const payments = true;\n");
  await fs.writeFile(path.join(root, "docs.md"), "docs\n");
  await git("add", ".");
  await git("commit", "-m", "Add API and docs");
  getAnalyticsCache().clear();

  const index = await getAnalyticsIndex(root, { maxCommits: 10, pathPrefix: "src/api" });
  assert.ok(index.commits.length > 0);
  assert.ok(index.commits.every((commit) => commit.files.every((file) => file.path === "src/api/payments.js")));
  assert.equal(index.commits[0].files[0].path, "src/api/payments.js");
  await assert.rejects(() => getAnalyticsIndex(root, { pathPrefix: "../outside" }), /inside the repository|relative/);
});
