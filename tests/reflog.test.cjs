const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const {
  DEFAULT_REFLOG_LIMIT,
  MAX_REFLOG_LIMIT,
  listReflog,
  normalizeReflogPagination,
  normalizeReflogRef,
  parseReflogAction,
  parseReflogEntries,
} = require("../electron/git/reflog.cjs");
const { GitServiceError } = require("../electron/git/core.cjs");

const execFileAsync = promisify(execFile);

const hash = "a".repeat(40);

async function createRepository(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-reflog-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "README.md"), "initial\n");
  await git("add", "README.md");
  await git("commit", "-m", "Initial commit");
  await git("branch", "feature/payment");
  await git("checkout", "feature/payment");
  await fs.writeFile(path.join(root, "payment.txt"), "payment\n");
  await git("add", "payment.txt");
  await git("commit", "-m", "Add payment feature");
  await git("checkout", "main");
  return root;
}

test("parseReflogAction classifies supported Git subjects without over-inference", () => {
  assert.deepEqual(parseReflogAction("commit: Add feature"), { action: "commit", detail: "Add feature" });
  assert.deepEqual(parseReflogAction("commit (amend): Fix typo"), { action: "amend", detail: "Fix typo" });
  assert.deepEqual(parseReflogAction("checkout: moving from main to develop"), {
    action: "checkout",
    detail: "moving from main to develop",
  });
  assert.deepEqual(parseReflogAction("rebase (pick): apply change"), { action: "rebase", detail: "apply change" });
  assert.deepEqual(parseReflogAction("merge feature/payment: Merge made by the 'ort' strategy."), {
    action: "merge",
    detail: "Merge made by the 'ort' strategy.",
  });
  assert.deepEqual(parseReflogAction("custom action without a known prefix"), {
    action: "other",
    detail: "custom action without a known prefix",
  });
});

test("parseReflogEntries parses structured records and preserves pagination indexes", () => {
  const raw = [
    [hash, "HEAD@{3}", "HEAD@{3}", "Ada Lovelace", "ada@example.test", "2026-08-11T10:00:00+00:00", "reset: moving to HEAD~1"].join("\x1f"),
    [hash.replaceAll("a", "b"), "HEAD@{4}", "HEAD@{4}", "Grace Hopper", "grace@example.test", "2026-08-10T10:00:00+00:00", "checkout: moving from main to feature/payment"].join("\x1f"),
  ].join("\x1e");

  assert.deepEqual(parseReflogEntries(raw, { refName: "HEAD", offset: 3 }), [
    {
      index: 3,
      hash,
      shortHash: "aaaaaaaa",
      selector: "HEAD@{3}",
      refName: "HEAD",
      date: "2026-08-11T10:00:00+00:00",
      actor: { name: "Ada Lovelace", email: "ada@example.test" },
      rawMessage: "reset: moving to HEAD~1",
      action: "reset",
      detail: "moving to HEAD~1",
      reachable: null,
    },
    {
      index: 4,
      hash: "b".repeat(40),
      shortHash: "bbbbbbbb",
      selector: "HEAD@{4}",
      refName: "HEAD",
      date: "2026-08-10T10:00:00+00:00",
      actor: { name: "Grace Hopper", email: "grace@example.test" },
      rawMessage: "checkout: moving from main to feature/payment",
      action: "checkout",
      detail: "moving from main to feature/payment",
      reachable: null,
    },
  ]);
});

test("parseReflogEntries safely ignores empty and incomplete records", () => {
  const raw = `${[hash, "HEAD@{0}", "HEAD@{0}", "Ada", "ada@example.test", "2026-08-11T10:00:00+00:00", "commit: ok"].join("\x1f")}\x1e${hash}`;
  const entries = parseReflogEntries(raw);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].action, "commit");
});

test("normalizeReflogRef only accepts HEAD and local branches", () => {
  assert.deepEqual(normalizeReflogRef(undefined), { ref: "HEAD", refName: "HEAD" });
  assert.deepEqual(normalizeReflogRef("main"), { ref: "refs/heads/main", refName: "refs/heads/main" });
  assert.deepEqual(normalizeReflogRef("refs/heads/feature/payment"), {
    ref: "refs/heads/feature/payment",
    refName: "refs/heads/feature/payment",
  });
  assert.throws(() => normalizeReflogRef("refs/tags/v1"), (error) => error.code === "INVALID_ARGUMENT");
  assert.throws(() => normalizeReflogRef("feature/../unsafe"), (error) => error.code === "INVALID_ARGUMENT");
});

test("normalizeReflogPagination enforces bounded requests", () => {
  assert.deepEqual(normalizeReflogPagination({}), { limit: DEFAULT_REFLOG_LIMIT, skip: 0 });
  assert.deepEqual(normalizeReflogPagination({ limit: 10, skip: 20 }), { limit: 10, skip: 20 });
  assert.throws(() => normalizeReflogPagination({ limit: MAX_REFLOG_LIMIT + 1 }), (error) => error.code === "INVALID_ARGUMENT");
  assert.throws(() => normalizeReflogPagination({ limit: 0 }), (error) => error.code === "INVALID_ARGUMENT");
  assert.throws(() => normalizeReflogPagination({ skip: -1 }), (error) => error.code === "INVALID_ARGUMENT");
});

test("listReflog reads HEAD and local branch entries with bounded pagination", async (t) => {
  const root = await createRepository(t);
  const firstPage = await listReflog(root, { limit: 2 });
  const secondPage = await listReflog(root, { limit: 2, skip: 2 });
  const branchPage = await listReflog(root, { ref: "main", limit: 20 });

  assert.equal(firstPage.ref, "HEAD");
  assert.equal(firstPage.entries.length, 2);
  assert.equal(firstPage.hasMore, true);
  assert.equal(firstPage.nextSkip, 2);
  assert.deepEqual(firstPage.entries.map((entry) => entry.index), [0, 1]);
  assert.ok(firstPage.entries.some((entry) => entry.action === "checkout"));
  assert.deepEqual(secondPage.entries.map((entry) => entry.index), [2, 3]);
  assert.ok(secondPage.entries.every((entry) => entry.refName === "HEAD"));
  assert.equal(branchPage.ref, "refs/heads/main");
  assert.ok(branchPage.entries.length >= 1);
  assert.ok(branchPage.entries.every((entry) => entry.refName === "refs/heads/main"));
});

test("listReflog rejects unknown local branches and non-local refs", async (t) => {
  const root = await createRepository(t);
  await assert.rejects(
    listReflog(root, { ref: "missing" }),
    (error) => error instanceof GitServiceError && error.code === "REFLOG_REF_UNAVAILABLE",
  );
  await assert.rejects(
    listReflog(root, { ref: "refs/tags/v1" }),
    (error) => error instanceof GitServiceError && error.code === "INVALID_ARGUMENT",
  );
});
