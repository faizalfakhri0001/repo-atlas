const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { searchRepository } = require("../electron/git/search.cjs");

const execFileAsync = promisify(execFile);

test("repository search finds files, refs, commits, authors, and hashes", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-search-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });

  await git("init", "-b", "main");
  await git("config", "user.name", "Ada Lovelace");
  await git("config", "user.email", "ada@example.test");
  await fs.mkdir(path.join(root, "src", "auth"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "auth", "login.js"), "export const login = true;\n");
  await git("add", ".");
  await git("commit", "-m", "Add login flow");
  const firstHash = (await git("rev-parse", "HEAD")).stdout.trim();
  await git("tag", "v1.0.0");
  await git("branch", "feature/login");

  await git("config", "user.name", "Grace Hopper");
  await git("config", "user.email", "grace@example.test");
  await fs.writeFile(path.join(root, "src", "auth", "session.js"), "export const session = true;\n");
  await git("add", ".");
  await git("commit", "-m", "Improve session handling");

  const fileResults = await searchRepository(root, { query: "type:file login" });
  assert.equal(fileResults.results[0].type, "file");
  assert.equal(fileResults.results[0].path, "src/auth/login.js");

  const branchResults = await searchRepository(root, { query: "type:branch feature/login" });
  assert.ok(branchResults.results.some((result) => result.name === "feature/login"));

  const tagResults = await searchRepository(root, { query: "type:tag v1.0" });
  assert.ok(tagResults.results.some((result) => result.name === "v1.0.0"));

  const commitResults = await searchRepository(root, { query: "type:commit session" });
  assert.ok(commitResults.results.some((result) => result.subject === "Improve session handling"));

  const authorResults = await searchRepository(root, { query: "type:author ada" });
  assert.ok(authorResults.results.some((result) => result.name === "Ada Lovelace"));

  const hashResults = await searchRepository(root, { query: `type:commit ${firstHash.slice(0, 7)}` });
  assert.ok(hashResults.results.some((result) => result.hash === firstHash));
});
