const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { RepositoryWatcher } = require("../electron/watch/repository-watcher.cjs");

const execFileAsync = promisify(execFile);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForChange(changes, predicate, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const match = changes.find(predicate);
    if (match) return match;
    await sleep(40);
  }
  throw new Error(`Timed out waiting for repository change. Received: ${JSON.stringify(changes)}`);
}

test("RepositoryWatcher detects external edits, commits, and checkouts", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-watch-integration-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "README.md"), "initial\n");
  await git("add", "README.md");
  await git("commit", "-m", "Initial commit");

  const changes = [];
  const watcher = new RepositoryWatcher({
    repositoryPath: root,
    mode: "full",
    debounceMs: 40,
    maxWaitMs: 300,
    onChange: (event) => changes.push(event),
  });
  t.after(() => watcher.stop());
  await watcher.start();
  await sleep(250);

  changes.length = 0;
  await fs.writeFile(path.join(root, "README.md"), "edited externally\n");
  const edit = await waitForChange(changes, (event) => event.kind === "worktree");
  assert.equal(edit.repositoryPath, watcher.repository.rootPath);
  assert.ok(edit.paths.includes("README.md"));

  changes.length = 0;
  await fs.writeFile(path.join(root, "notes.txt"), "committed externally\n");
  await git("add", "notes.txt");
  await git("commit", "-m", "External commit");
  const commit = await waitForChange(changes, (event) => ["head", "refs", "index"].includes(event.kind));
  assert.ok(["head", "refs", "index"].includes(commit.kind));

  await sleep(100);
  changes.length = 0;
  await git("checkout", "-b", "feature/external");
  const checkout = await waitForChange(changes, (event) => event.kind === "head");
  assert.equal(checkout.kind, "head");
});
