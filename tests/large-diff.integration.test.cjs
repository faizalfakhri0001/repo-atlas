const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { getFileDiff } = require("../electron/git-service.cjs");

const execFileAsync = promisify(execFile);
const DIFF_LIMIT = 1_200_000;

test("large text diffs are bounded before they reach the renderer", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-large-diff-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  const filePath = path.join(root, "generated.txt");
  const lineCount = 100_000;
  const original = Array.from({ length: lineCount }, (_, index) => `before-${String(index).padStart(6, "0")}-abcdefghijklmnopqrstuvwxyz`);
  const updated = Array.from({ length: lineCount }, (_, index) => `after-${String(index).padStart(6, "0")}-zyxwvutsrqponmlkjihgfedcba`);

  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(filePath, `${original.join("\n")}\n`);
  await git("add", "generated.txt");
  await git("commit", "-m", "Add generated content");
  const from = (await git("rev-parse", "HEAD")).stdout.trim();

  await fs.writeFile(filePath, `${updated.join("\n")}\n`);
  await git("commit", "-am", "Regenerate content");
  const to = (await git("rev-parse", "HEAD")).stdout.trim();

  const result = await getFileDiff(root, { type: "commit", from, to, path: "generated.txt" });

  assert.equal(result.binary, false);
  assert.equal(result.truncated, true);
  assert.ok(result.diff.length <= DIFF_LIMIT);
  assert.ok(result.diff.length > 1_000_000);
  assert.match(result.diff, /^diff --git a\/generated\.txt b\/generated\.txt/m);
  assert.match(result.diff, /^@@ /m);
  assert.match(result.diff, /-before-000000-/);
  assert.doesNotMatch(result.diff, /\+after-099999-/);
});
