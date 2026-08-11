const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const {
  MAX_REFLOG_LIMIT,
  listReflog,
} = require("../electron/git/reflog.cjs");
const {
  MAX_ACTIVITY_DAYS,
  buildActivityReport,
} = require("../electron/git/analytics/activity.cjs");

const execFileAsync = promisify(execFile);

async function createRepository(testContext, prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  testContext.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "README.md"), "history\n");
  await git("add", "README.md");
  await git("commit", "-m", "Initial commit");
  return { root, git };
}

test("reflog pagination remains bounded when the repository has more than one thousand entries", async (t) => {
  const { root, git } = await createRepository(t, "repo-atlas-large-reflog-");

  for (let index = 0; index < MAX_REFLOG_LIMIT + 20; index += 1) {
    await git("commit", "--allow-empty", "-m", `Reflog entry ${index}`);
  }

  const firstPage = await listReflog(root, { limit: MAX_REFLOG_LIMIT });
  const nextPage = await listReflog(root, { limit: 20, skip: MAX_REFLOG_LIMIT });

  assert.equal(firstPage.entries.length, MAX_REFLOG_LIMIT);
  assert.equal(firstPage.hasMore, true);
  assert.equal(firstPage.nextSkip, MAX_REFLOG_LIMIT);
  assert.equal(nextPage.entries.length, 20);
  assert.equal(nextPage.entries[0].index, MAX_REFLOG_LIMIT);
  assert.ok(nextPage.entries.every((entry) => entry.hash.length === 40));
});

test("activity keeps a two-year calendar bounded and preserves author identity across timezones", () => {
  const index = {
    repositoryKey: "/repo/history",
    head: "a".repeat(40),
    scope: { maxCommits: 50_000, processedCommits: 4, truncated: false, filesTruncated: false },
    authors: new Map([
      ["email:alex-one@example.test", { key: "email:alex-one@example.test", name: "Alex", email: "alex-one@example.test", commits: 1, additions: 2, deletions: 1, churn: 3 }],
      ["email:alex-two@example.test", { key: "email:alex-two@example.test", name: "Alex", email: "alex-two@example.test", commits: 1, additions: 4, deletions: 2, churn: 6 }],
    ]),
    commits: [
      {
        hash: "b".repeat(40),
        authoredAt: "2024-08-10T12:00:00Z",
        author: { key: "email:alex-one@example.test", name: "Alex", email: "alex-one@example.test" },
        files: [{ path: "old.txt", additions: 1, deletions: 0 }],
      },
      {
        hash: "c".repeat(40),
        authoredAt: "2024-08-11T23:30:00-07:00",
        author: { key: "email:alex-one@example.test", name: "Alex", email: "alex-one@example.test" },
        files: [{ path: "one.txt", additions: 2, deletions: 1 }],
      },
      {
        hash: "d".repeat(40),
        authoredAt: "2024-08-11T23:30:00+09:00",
        author: { key: "email:alex-two@example.test", name: "Alex", email: "alex-two@example.test" },
        files: [{ path: "two.txt", additions: 4, deletions: 2 }],
      },
      {
        hash: "e".repeat(40),
        authoredAt: "2026-08-11T12:00:00Z",
        author: { key: "email:alex-two@example.test", name: "Alex", email: "alex-two@example.test" },
        files: [{ path: "latest.txt", additions: 1, deletions: 1 }],
      },
    ],
  };

  const report = buildActivityReport(index, {
    range: "2y",
    metric: "churn",
    now: "2026-08-11T18:00:00Z",
    timeZone: "America/New_York",
  });

  assert.equal(report.rangeStart, "2024-08-11");
  assert.equal(report.rangeEnd, "2026-08-11");
  assert.ok(report.buckets.length > 700);
  assert.ok(report.buckets.length <= MAX_ACTIVITY_DAYS);
  assert.equal(report.scope.rangeTruncated, false);
  assert.equal(report.stats.totalCommits, 3);
  assert.deepEqual(
    report.buckets.filter((bucket) => bucket.commits > 0).map((bucket) => [bucket.date, bucket.commits, bucket.authors]),
    [["2024-08-11", 1, 1], ["2024-08-12", 1, 1], ["2026-08-11", 1, 1]],
  );
  assert.deepEqual(report.authors.map((author) => author.key).sort(), [
    "email:alex-one@example.test",
    "email:alex-two@example.test",
  ]);

  const filtered = buildActivityReport(index, {
    range: "2y",
    metric: "commits",
    author: "email:alex-one@example.test",
    now: "2026-08-11T18:00:00Z",
    timeZone: "America/New_York",
  });
  assert.equal(filtered.stats.totalCommits, 1);
  assert.equal(filtered.buckets.find((bucket) => bucket.commits > 0).date, "2024-08-12");
});
