const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { scanRepository } = require("../electron/git-service.cjs");

const execFileAsync = promisify(execFile);
const COMMIT_COUNT = 10_001;

function fastImport(cwd, count) {
  const chunks = [];
  let previousMark = null;
  for (let index = 0; index < count; index += 1) {
    const mark = index + 1;
    const message = `Synthetic history commit ${index}\n`;
    chunks.push(`commit refs/heads/main\nmark :${mark}\nauthor Scale Test <scale@example.test> ${1_700_000_000 + index} +0000\ncommitter Scale Test <scale@example.test> ${1_700_000_000 + index} +0000\n`);
    chunks.push(`data ${Buffer.byteLength(message)}\n${message}`);
    if (previousMark) chunks.push(`from :${previousMark}\n`);
    previousMark = mark;
  }

  return new Promise((resolve, reject) => {
    const child = spawn("git", ["fast-import"], { cwd, stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.stdin.once("error", (error) => {
      if (error.code !== "EPIPE") reject(error);
    });
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git fast-import failed (${code}): ${stderr}`));
    });
    child.stdin.end(chunks.join(""));
  });
}

test("repository scanning remains bounded with more than ten thousand commits", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-commit-scale-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await execFileAsync("git", ["init", "-b", "main"], { cwd: root, encoding: "utf8" });
  await fastImport(root, COMMIT_COUNT);

  const startedAt = performance.now();
  const snapshot = await scanRepository(root);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(snapshot.repository.totalCommits, COMMIT_COUNT);
  assert.equal(snapshot.commits.length, 1_000);
  assert.ok(elapsedMs < 30_000, `repository scan took ${Math.round(elapsedMs)} ms`);
});
