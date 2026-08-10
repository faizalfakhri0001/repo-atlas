const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { refreshRepositoryPartial, resolveRepository } = require("../electron/git-service.cjs");
const { getAnalyticsCache } = require("../electron/git/analytics/index.cjs");
const { blameCache } = require("../electron/git/blame.cjs");

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
  const canonicalRoot = (await resolveRepository(root)).rootPath;

  const status = await refreshRepositoryPartial(root, ["status"]);
  assert.deepEqual(Object.keys(status.data).sort(), ["repository", "scannedAt", "status"]);
  assert.equal(status.data.status.branch, "main");
  assert.equal(status.data.repository.currentBranch, "main");
  const analyticsCache = getAnalyticsCache();
  analyticsCache.set(`partial-status-${root}`, { value: "status" }, { rootPath: canonicalRoot });
  assert.deepEqual(status.invalidated, []);
  assert.deepEqual(analyticsCache.get(`partial-status-${root}`), { value: "status" });

  analyticsCache.set(`partial-refs-${root}`, { value: "refs" }, { rootPath: canonicalRoot });
  const refs = await refreshRepositoryPartial(root, ["refs"]);
  assert.ok(Array.isArray(refs.data.branches));
  assert.ok(Array.isArray(refs.data.commits));
  assert.ok(Array.isArray(refs.data.tags));
  assert.equal(refs.data.status, undefined);
  assert.ok(refs.invalidated.includes("analytics"));
  assert.equal(analyticsCache.get(`partial-refs-${root}`), undefined);

  blameCache.set(canonicalRoot, "stale-head", "app.js", { value: "old" });
  const head = await refreshRepositoryPartial(root, ["head"]);
  assert.ok(Array.isArray(head.data.commits));
  assert.ok(head.data.state);
  assert.ok(head.data.status);
  assert.ok(head.invalidated.includes("blame-head"));
  assert.equal(blameCache.get(canonicalRoot, "stale-head", "app.js"), undefined);

  await assert.rejects(() => refreshRepositoryPartial(root, ["analytics"]), (error) => error?.code === "INVALID_ARGUMENT");
  await assert.rejects(() => refreshRepositoryPartial(root, []), (error) => error?.code === "INVALID_ARGUMENT");
});
