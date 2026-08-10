const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  assertRelativePath,
  resolveRepositoryRelativePath,
  resolveRepositoryFilePath,
} = require("../electron/git/core.cjs");

test("repository path validation normalizes safe relative paths", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-path-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "src"));
  await fs.writeFile(path.join(root, "src", "main.js"), "export {}\n");

  const resolved = await resolveRepositoryRelativePath(root, "src/./main.js");
  assert.equal(resolved, path.join(root, "src", "main.js"));

  for (const input of ["../outside", "src/../../outside", "/tmp/outside", "C:\\outside", "\0"]) {
    assert.throws(() => assertRelativePath(input));
    await assert.rejects(() => resolveRepositoryRelativePath(root, input));
  }
});

test("repository path validation rejects symlinks that leave the repository", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-path-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-outside-"));
  t.after(() => Promise.all([
    fs.rm(root, { recursive: true, force: true }),
    fs.rm(outside, { recursive: true, force: true }),
  ]));
  await fs.writeFile(path.join(outside, "secret.txt"), "private\n");

  try {
    await fs.symlink(path.join(outside, "secret.txt"), path.join(root, "linked.txt"));
  } catch (error) {
    t.skip(`symlink creation is unavailable: ${error.code ?? error.message}`);
    return;
  }

  await assert.rejects(
    () => resolveRepositoryRelativePath(root, "linked.txt"),
    (error) => error?.code === "PATH_OUTSIDE_REPOSITORY",
  );
});

test("repository file path helper accepts regular files and rejects directories", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-file-path-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "src"));
  await fs.writeFile(path.join(root, "src", "main.js"), "export {}\n");

  assert.equal(await resolveRepositoryFilePath(root, "src/main.js"), path.join(root, "src", "main.js"));
  await assert.rejects(() => resolveRepositoryFilePath(root, "src"), (error) => error?.code === "INVALID_PATH");
  await assert.rejects(() => resolveRepositoryFilePath(root, "missing.js"), (error) => error?.code === "PATH_NOT_FOUND");
});
