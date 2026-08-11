const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const {
  createRepositoryId,
  normalizeIdentityPath,
  resolveRepository,
} = require("../electron/git/core.cjs");
const { refreshRepositoryPartial, scanRepository } = require("../electron/git-service.cjs");

const execFileAsync = promisify(execFile);

test("repository identity is shared by a main worktree and its linked worktree", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-identity-root-"));
  const linked = `${root}-linked`;
  t.after(() => Promise.all([
    fs.rm(root, { recursive: true, force: true }),
    fs.rm(linked, { recursive: true, force: true }),
  ]));

  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  await git("init", "-b", "main");
  await git("config", "user.name", "Repo Atlas Test");
  await git("config", "user.email", "repo-atlas@example.test");
  await fs.writeFile(path.join(root, "README.md"), "identity\n");
  await git("add", "README.md");
  await git("commit", "-m", "Add identity fixture");
  await git("worktree", "add", "-b", "feature/identity", linked, "main");

  const mainRepository = await resolveRepository(root);
  const linkedRepository = await resolveRepository(linked);

  assert.notEqual(mainRepository.rootPath, linkedRepository.rootPath);
  assert.equal(mainRepository.commonGitDir, linkedRepository.commonGitDir);
  assert.equal(mainRepository.repositoryId, linkedRepository.repositoryId);
  assert.match(mainRepository.repositoryId, /^[0-9a-f]{64}$/);
  assert.equal(mainRepository.isLinkedWorktree, false);
  assert.equal(linkedRepository.isLinkedWorktree, true);
  assert.notEqual(mainRepository.gitDir, linkedRepository.gitDir);
  assert.equal(mainRepository.gitDir, mainRepository.commonGitDir);

  const snapshot = await scanRepository(linked);
  assert.deepEqual(
    {
      rootPath: snapshot.repository.rootPath,
      gitDir: snapshot.repository.gitDir,
      commonGitDir: snapshot.repository.commonGitDir,
      repositoryId: snapshot.repository.repositoryId,
      isLinkedWorktree: snapshot.repository.isLinkedWorktree,
    },
    {
      rootPath: linkedRepository.rootPath,
      gitDir: linkedRepository.gitDir,
      commonGitDir: linkedRepository.commonGitDir,
      repositoryId: linkedRepository.repositoryId,
      isLinkedWorktree: true,
    },
  );

  const partial = await refreshRepositoryPartial(linked, ["status"]);
  assert.equal(partial.data.repository.commonGitDir, linkedRepository.commonGitDir);
  assert.equal(partial.data.repository.repositoryId, linkedRepository.repositoryId);
});

test("repository IDs hash normalized identity paths", () => {
  const input = "C:\\Projects\\Repo\\.git\\";
  const normalized = normalizeIdentityPath(input);
  assert.equal(normalized, "c:/Projects/Repo/.git");
  assert.equal(
    createRepositoryId(input),
    crypto.createHash("sha256").update(normalized, "utf8").digest("hex"),
  );
});
