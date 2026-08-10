const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { buildAnalyticsIndex } = require("../electron/git/analytics/index.cjs");

const execFileAsync = promisify(execFile);

function createHistoryImport(commitCount) {
  const blob = "analytics fixture\n";
  const chunks = [
    "blob\n",
    "mark :1\n",
    `data ${Buffer.byteLength(blob)}\n`,
    blob,
  ];
  let previousMark = null;
  for (let index = 0; index < commitCount; index += 1) {
    const mark = index + 2;
    const timestamp = 1_700_000_000 + index;
    const message = `Commit ${index}\n`;
    chunks.push(`commit refs/heads/main\nmark :${mark}\nauthor Scale Test <scale@example.test> ${timestamp} +0000\ncommitter Scale Test <scale@example.test> ${timestamp} +0000\n`);
    chunks.push(`data ${Buffer.byteLength(message)}\n${message}`);
    if (previousMark) chunks.push(`from :${previousMark}\n`);
    if (!previousMark) chunks.push("M 100644 :1 README.md\n");
    previousMark = mark;
  }
  return chunks.join("");
}

function runFastImport(root, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["fast-import"], { cwd: root, shell: false, stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `git fast-import exited with ${code}`));
    });
    child.stdin.end(input);
  });
}

test("analytics foundation bounds a repository with more than ten thousand commits", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-analytics-large-history-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await execFileAsync("git", ["init", "-b", "main"], { cwd: root, encoding: "utf8" });
  await runFastImport(root, createHistoryImport(10_001));

  const startedAt = Date.now();
  const index = await buildAnalyticsIndex(root);
  const elapsedMs = Date.now() - startedAt;

  assert.equal(index.scope.maxCommits, 10_000);
  assert.equal(index.scope.processedCommits, 10_000);
  assert.equal(index.scope.truncated, true);
  assert.equal(index.commits.length, 10_000);
  assert.equal(index.totals.commits, 10_000);
  assert.equal(index.authors.get("email:scale@example.test").commits, 10_000);
  assert.ok(elapsedMs < 30_000, `analytics build took ${elapsedMs}ms`);
});
