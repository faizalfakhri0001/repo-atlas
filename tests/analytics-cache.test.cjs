const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { AnalyticsCache, buildAnalyticsCacheKey } = require("../electron/git/analytics/cache.cjs");
const { getAnalyticsCache, getAnalyticsIndex } = require("../electron/git/analytics/index.cjs");

const execFileAsync = promisify(execFile);

test("analytics cache keys include repository revision and scope", () => {
  const base = { rootPath: "/repo", head: "a", refsFingerprint: "refs-a", maxCommits: 10, maxFilesPerCommit: 20 };
  assert.notEqual(buildAnalyticsCacheKey(base), buildAnalyticsCacheKey({ ...base, head: "b" }));
  assert.notEqual(buildAnalyticsCacheKey(base), buildAnalyticsCacheKey({ ...base, refsFingerprint: "refs-b" }));
  assert.notEqual(buildAnalyticsCacheKey(base), buildAnalyticsCacheKey({ ...base, maxCommits: 20 }));
});

test("analytics cache evicts least recently used indexes and invalidates a repository", () => {
  const cache = new AnalyticsCache(2);
  cache.set("a", "A", { rootPath: "/one" });
  cache.set("b", "B", { rootPath: "/two" });
  assert.equal(cache.get("a"), "A");
  cache.set("c", "C", { rootPath: "/three" });
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.invalidateRepository("/one"), 1);
  assert.equal(cache.size, 1);
});

test("analytics index requests for one repository share the in-flight build and cached value", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-analytics-cache-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "README.md"), "analytics\n");
  await git("add", "README.md");
  await git("commit", "-m", "Add readme");
  getAnalyticsCache().clear();

  const [first, second] = await Promise.all([
    getAnalyticsIndex(root, { maxCommits: 10 }),
    getAnalyticsIndex(root, { maxCommits: 10 }),
  ]);
  assert.strictEqual(first, second);
  assert.strictEqual(await getAnalyticsIndex(root, { maxCommits: 10 }), first);
  assert.equal(getAnalyticsCache().size, 1);
});
