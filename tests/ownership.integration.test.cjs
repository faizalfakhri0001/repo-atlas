const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { ownershipSummary } = require("../electron/git-service.cjs");

const execFileAsync = promisify(execFile);

function createGit(root) {
  const run = (args, extra = {}) => execFileAsync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...extra.env },
  });
  return {
    run,
    commit: async (message, date) => {
      await run(["add", "."]);
      await run(["commit", "-m", message], { env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
    },
  };
}

test("ownership summary aggregates multiple authors by file and directory", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-ownership-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = createGit(root);
  await git.run(["init", "-b", "main"]);

  await fs.mkdir(path.join(root, "src/components"), { recursive: true });
  await fs.mkdir(path.join(root, "tests"), { recursive: true });
  await fs.writeFile(path.join(root, "src/components/app.js"), "const app = 1;\n");
  await fs.writeFile(path.join(root, "tests/app.test.js"), "test();\n");
  await git.run(["config", "user.name", "Ada Lovelace"]);
  await git.run(["config", "user.email", "ADA@EXAMPLE.TEST"]);
  await git.commit("Initial source", "2025-01-01T00:00:00Z");

  await git.run(["config", "user.name", "Grace Hopper"]);
  await git.run(["config", "user.email", "grace@example.test"]);
  await fs.writeFile(path.join(root, "src/components/app.js"), "const app = 1;\nconst ready = true;\n");
  await git.commit("Old source change", "2025-02-01T00:00:00Z");

  await git.run(["config", "user.name", "Ada Lovelace"]);
  await git.run(["config", "user.email", "ada@example.test"]);
  await fs.writeFile(path.join(root, "src/components/app.js"), "const app = 2;\nconst ready = true;\nconst live = true;\n");
  await git.commit("Recent source change", "2026-08-01T00:00:00Z");

  await git.run(["config", "user.name", "Grace Hopper"]);
  await fs.writeFile(path.join(root, "tests/app.test.js"), "test(true);\nassert(true);\n");
  await git.commit("Recent test change", "2026-08-02T00:00:00Z");

  const allTime = await ownershipSummary(root, { period: "all", limit: 100, now: "2026-08-10T00:00:00Z" });
  const source = allTime.nodes.find((node) => node.path === "src");
  const sourceFile = await ownershipSummary(root, { period: "all", path: "src/components/app.js", now: "2026-08-10T00:00:00Z" });
  const file = sourceFile.nodes[0];
  assert.ok(source);
  assert.equal(file.type, "file");
  assert.equal(file.totalCommits, 3);
  assert.equal(file.topContributors.length, 2);
  assert.equal(file.topContributors.filter((contributor) => contributor.email === "ada@example.test").length, 1);
  assert.equal(file.primaryContributor.name, "Ada Lovelace");
  assert.ok(file.primaryContributor.commitShare > 0);
  assert.ok(file.primaryContributor.churnShare > 0);
  assert.equal(allTime.scope.totalFiles, 2);
  assert.equal(allTime.scope.sourceTruncated, false);

  const recent = await ownershipSummary(root, { period: "12m", path: "src", now: "2026-08-10T00:00:00Z" });
  const recentFile = recent.nodes.find((node) => node.path === "src/components");
  assert.ok(recentFile);
  assert.equal(recentFile.totalCommits, 1);
  assert.equal(recentFile.primaryContributor.email, "ada@example.test");
  assert.equal(recent.scope.period, "12m");
});
