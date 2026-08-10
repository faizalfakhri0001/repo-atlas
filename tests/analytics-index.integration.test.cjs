const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { buildAnalyticsIndex } = require("../electron/git/analytics/index.cjs");

const execFileAsync = promisify(execFile);

test("analytics index aggregates bounded file and author history", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-analytics-index-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });

  await git("init", "-b", "main");
  await git("config", "user.name", "Ada Lovelace");
  await git("config", "user.email", "ADA@EXAMPLE.TEST");
  await fs.writeFile(path.join(root, "app.js"), "one\n");
  await git("add", "app.js");
  await git("commit", "-m", "Add app");

  await git("config", "user.name", "Grace Hopper");
  await git("config", "user.email", "grace@example.test");
  await fs.writeFile(path.join(root, "app.js"), "one\ntwo\n");
  await fs.writeFile(path.join(root, "README.md"), "docs\n");
  await git("add", ".");
  await git("commit", "-m", "Update app");

  const index = await buildAnalyticsIndex(root, { maxCommits: 10 });
  const app = index.files.get("app.js");
  const ada = index.authors.get("email:ada@example.test");
  const grace = index.authors.get("email:grace@example.test");

  assert.equal(index.scope.maxCommits, 10);
  assert.equal(index.scope.processedCommits, 2);
  assert.equal(index.scope.truncated, false);
  assert.equal(index.totals.commits, 2);
  assert.equal(index.totals.files, 2);
  assert.equal(app.commits, 2);
  assert.equal(app.additions, 2);
  assert.equal(app.deletions, 0);
  assert.equal(app.churn, 2);
  assert.equal(app.authors.get("email:grace@example.test").additions, 1);
  assert.equal(ada.commits, 1);
  assert.equal(grace.commits, 1);
  assert.ok(app.firstSeenAt <= app.lastChangedAt);
});
