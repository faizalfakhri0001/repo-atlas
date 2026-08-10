const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { hotspotSummary } = require("../electron/git-service.cjs");

const execFileAsync = promisify(execFile);

function createGit(root) {
  const run = (args, extra = {}) =>
    execFileAsync("git", args, {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...extra.env },
    });
  return {
    run,
    commit: async (message, date) => {
      await run(["add", "."]);
      await run(["commit", "-m", message], {
        env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      });
    },
  };
}

test("hotspot summary distinguishes frequent, high-churn, and old files", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-hotspots-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = createGit(root);
  await git.run(["init", "-b", "main"]);
  await git.run(["config", "user.name", "Repo Atlas Test"]);
  await git.run(["config", "user.email", "repo-atlas@example.test"]);

  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.mkdir(path.join(root, "dist"), { recursive: true });
  await fs.writeFile(path.join(root, "src/frequent.js"), "const value = 1;\n");
  await fs.writeFile(path.join(root, "src/high-churn.js"), "old line\n".repeat(20));
  await fs.writeFile(path.join(root, "src/rare.js"), "rare\n");
  await fs.writeFile(path.join(root, "src/removed.js"), "historical\n");
  await fs.writeFile(path.join(root, "package-lock.json"), "{}\n");
  await fs.writeFile(path.join(root, "dist/generated.js"), "generated\n");
  await git.commit("Initial files", "2025-01-01T00:00:00Z");

  for (let index = 0; index < 4; index += 1) {
    await fs.writeFile(path.join(root, "src/frequent.js"), `const value = ${index + 2};\n`);
    await git.commit(`Frequent update ${index + 1}`, `2026-08-0${index + 1}T00:00:00Z`);
  }
  await fs.writeFile(path.join(root, "src/high-churn.js"), "new line\n".repeat(80));
  await git.commit("Large churn update", "2026-08-08T00:00:00Z");
  await fs.rm(path.join(root, "src/removed.js"));
  await git.commit("Remove historical file", "2026-08-09T00:00:00Z");

  const result = await hotspotSummary(root, { maxCommits: 50, limit: 100, now: "2026-08-10T00:00:00Z" });
  const byPath = new Map(result.files.map((file) => [file.path, file]));
  const frequent = byPath.get("src/frequent.js");
  const highChurn = byPath.get("src/high-churn.js");
  const rare = byPath.get("src/rare.js");
  const removed = byPath.get("src/removed.js");

  assert.ok(frequent);
  assert.ok(highChurn);
  assert.ok(rare);
  assert.ok(removed);
  assert.equal(frequent.commitCount, 5);
  assert.equal(rare.commitCount, 1);
  assert.ok(highChurn.churn > frequent.churn);
  assert.ok(rare.recencyScore < frequent.recencyScore);
  assert.equal(removed.path, "src/removed.js");
  assert.equal(byPath.has("package-lock.json"), false);
  assert.equal(byPath.has("dist/generated.js"), false);
  assert.equal(result.scope.sourceTruncated, false);
  assert.equal(result.scope.returnedFiles, result.files.length);

  const generated = await hotspotSummary(root, { includeGenerated: true, pathPrefix: "package-lock.json", now: "2026-08-10T00:00:00Z" });
  assert.deepEqual(generated.files.map((file) => file.path), ["package-lock.json"]);

  const sourceOnly = await hotspotSummary(root, { pathPrefix: "src", limit: 100, now: "2026-08-10T00:00:00Z" });
  assert.ok(sourceOnly.files.length >= 4);
  assert.ok(sourceOnly.files.every((file) => file.path.startsWith("src/")));
});

test("hotspot summary handles an empty repository and caps the response limit", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-hotspots-empty-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = createGit(root);
  await git.run(["init", "-b", "main"]);

  const result = await hotspotSummary(root, { limit: 5000 });
  assert.deepEqual(result.files, []);
  assert.equal(result.scope.returnedFiles, 0);
  assert.equal(result.scope.reportLimit, 1000);
  assert.equal(result.scope.truncated, false);
});
