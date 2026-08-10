const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { repositoryHealth } = require("../electron/git-service.cjs");

const execFileAsync = promisify(execFile);

function createGit(root) {
  const run = (args, extra = {}) => execFileAsync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, ...extra.env } });
  return {
    run,
    commit: (message, date) => run(["add", "."]).then(() => run(["commit", "-m", message], { env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } })),
  };
}

test("repository health combines working tree, analytics, branches, and file metadata", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-health-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = createGit(root);
  await git.run(["init", "-b", "main"]);
  await git.run(["config", "user.name", "Repo Atlas Test"]);
  await git.run(["config", "user.email", "repo-atlas@example.test"]);
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src/app.js"), "export const app = true;\n");
  await git.commit("Initial application", "2026-01-01T00:00:00Z");
  await git.run(["branch", "legacy"]);
  await fs.writeFile(path.join(root, "src/app.js"), "export const app = false;\n");
  await git.commit("Update application", "2026-08-01T00:00:00Z");
  await fs.writeFile(path.join(root, "src/app.js"), "export const app = true;\n");

  const result = await repositoryHealth(root, { maxCommits: 20, now: "2026-08-10T00:00:00Z" });
  assert.equal(result.repository.currentBranch, "main");
  assert.equal(result.facts.totalCommits, 2);
  assert.equal(result.facts.trackedFileCount, 1);
  assert.equal(result.facts.dirtyFileCount, 1);
  assert.equal(result.facts.staleBranchCount, 1);
  assert.equal(result.scope.sourceTruncated, false);
  assert.ok(result.signals.some((signal) => signal.id === "working-tree-dirty"));
  assert.ok(result.signals.some((signal) => signal.id === "stale-local-branches"));
});

test("repository health does not penalize an empty repository", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-health-empty-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = createGit(root);
  await git.run(["init", "-b", "main"]);

  const result = await repositoryHealth(root, { maxCommits: 20, now: "2026-08-10T00:00:00Z" });
  assert.equal(result.score, 100);
  assert.equal(result.grade, "healthy");
  assert.ok(result.signals.some((signal) => signal.id === "empty-history"));
  assert.equal(result.facts.trackedFileCount, 0);
});
