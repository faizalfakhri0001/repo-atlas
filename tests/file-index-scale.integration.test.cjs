const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { listRepositoryFiles } = require("../electron/git-service.cjs");

const execFileAsync = promisify(execFile);
const FILE_COUNT = 50_000;

function createLargeIndex(cwd, count) {
  const chunks = ["blob\nmark :1\ndata 1\nx\n", "commit refs/heads/main\nmark :2\nauthor File Test <files@example.test> 1700000000 +0000\ncommitter File Test <files@example.test> 1700000000 +0000\ndata 12\nLarge index\n"];
  for (let index = 0; index < count; index += 1) {
    chunks.push(`M 100644 :1 src/generated/file-${String(index).padStart(5, "0")}.txt\n`);
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

test("repository file index handles fifty thousand tracked files", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-file-index-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await execFileAsync("git", ["init", "-b", "main"], { cwd: root, encoding: "utf8" });
  await createLargeIndex(root, FILE_COUNT);
  await execFileAsync("git", ["read-tree", "HEAD"], { cwd: root, encoding: "utf8" });

  const startedAt = performance.now();
  const files = await listRepositoryFiles(root);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(files.length, FILE_COUNT);
  assert.equal(files[0].path, "src/generated/file-00000.txt");
  assert.equal(files.at(-1).path, "src/generated/file-49999.txt");
  assert.ok(elapsedMs < 30_000, `file index scan took ${Math.round(elapsedMs)} ms`);
});
