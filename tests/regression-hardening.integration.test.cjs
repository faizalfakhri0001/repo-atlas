const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { createRepositoryMetadataStore } = require("../electron/repository-metadata.cjs");
const {
  compareRefs,
  cherryPickExecute,
  cherryPickPreview,
  scanRepository,
  stageFiles,
  unstageFiles,
} = require("../electron/git-service.cjs");
const { createLocalMetadataService } = require("../electron/local-metadata.cjs");
const { createSavedViewService } = require("../electron/saved-views.cjs");

const execFileAsync = promisify(execFile);

async function initializeRepository(root, label) {
  await fs.mkdir(root, { recursive: true });
  const git = (...args) => execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  await git("init", "-b", "main");
  await git("config", "user.name", `Repo Atlas ${label}`);
  await git("config", "user.email", `${label.toLowerCase()}@repo-atlas.example.test`);
  await fs.writeFile(path.join(root, "README.md"), `${label}\n`);
  await git("add", "README.md");
  await git("commit", "-m", `${label} initial commit`);
  return git;
}

test("multiple repositories keep Git identity and local metadata isolated", async (t) => {
  const container = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas repositories-"));
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas user-data-"));
  const alpha = path.join(container, "repo alpha");
  const beta = path.join(container, "repo beta-é");
  t.after(() => Promise.all([
    fs.rm(container, { recursive: true, force: true }),
    fs.rm(userDataPath, { recursive: true, force: true }),
  ]));

  const alphaGit = await initializeRepository(alpha, "Alpha");
  const betaGit = await initializeRepository(beta, "Beta");
  const alphaHash = (await alphaGit("rev-parse", "HEAD")).stdout.trim();
  const betaHash = (await betaGit("rev-parse", "HEAD")).stdout.trim();
  const store = createRepositoryMetadataStore({ userDataPath, now: () => "2026-08-11T04:00:00.000Z" });
  let id = 0;
  const savedViews = createSavedViewService({
    store,
    now: () => "2026-08-11T04:00:00.000Z",
    idFactory: () => `view-${++id}`,
  });
  const localMetadata = createLocalMetadataService({
    store,
    now: () => "2026-08-11T04:00:00.000Z",
    idFactory: () => `record-${++id}`,
  });

  const [alphaSnapshot, betaSnapshot] = await Promise.all([scanRepository(alpha), scanRepository(beta)]);
  assert.notEqual(alphaSnapshot.repository.repositoryId, betaSnapshot.repository.repositoryId);
  assert.notEqual(alphaSnapshot.repository.commonGitDir, betaSnapshot.repository.commonGitDir);

  await savedViews.createSavedView(alpha, { name: "Alpha view", viewType: "commits", config: { refs: ["main"] } });
  await savedViews.createSavedView(beta, { name: "Beta view", viewType: "commits", config: { refs: ["main"] } });
  await localMetadata.createBookmark(alpha, { commitHash: alphaHash, label: "Alpha release" });
  await localMetadata.createBookmark(beta, { commitHash: betaHash, label: "Beta release" });

  const [alphaViews, betaViews, alphaBookmarks, betaBookmarks] = await Promise.all([
    savedViews.listSavedViews(alpha),
    savedViews.listSavedViews(beta),
    localMetadata.listBookmarks(alpha),
    localMetadata.listBookmarks(beta),
  ]);
  assert.deepEqual(alphaViews.savedViews.map((view) => view.name), ["Alpha view"]);
  assert.deepEqual(betaViews.savedViews.map((view) => view.name), ["Beta view"]);
  assert.deepEqual(alphaBookmarks.bookmarks.map((bookmark) => bookmark.commitHash), [alphaHash]);
  assert.deepEqual(betaBookmarks.bookmarks.map((bookmark) => bookmark.commitHash), [betaHash]);
  assert.notEqual(alphaViews.repositoryId, betaViews.repositoryId);
});

test("read and write regressions keep compare, staging, and cherry-pick flows explicit", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas regression-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = await initializeRepository(root, "Regression");

  await git("checkout", "-b", "feature/change");
  await fs.writeFile(path.join(root, "app.js"), "feature change\n");
  await git("add", "app.js");
  await git("commit", "-m", "Feature change");
  const featureHash = (await git("rev-parse", "HEAD")).stdout.trim();
  await git("checkout", "main");

  const comparison = await compareRefs(root, "main", featureHash);
  assert.equal(comparison.fastForwardPossible, true);
  assert.equal(comparison.ahead, 1);
  assert.ok(comparison.files.some((file) => file.path === "app.js"));

  await fs.writeFile(path.join(root, "README.md"), "workspace change é\n");
  const staged = await stageFiles(root, ["README.md"], { operationMode: "safe-write" });
  assert.equal(staged.operation, "stage");
  assert.equal(staged.status.files.find((file) => file.path === "README.md").staged, true);
  const unstaged = await unstageFiles(root, ["README.md"], { operationMode: "safe-write" });
  const appStatus = unstaged.status.files.find((file) => file.path === "README.md");
  assert.equal(unstaged.operation, "unstage");
  assert.equal(appStatus.staged, false);
  assert.equal(appStatus.unstaged, true);
  await git("restore", "--", "README.md");

  const preview = await cherryPickPreview(root, [featureHash]);
  assert.equal(preview.blocked, false);
  assert.equal(preview.commits[0].prediction, "clean");
  const applied = await cherryPickExecute(root, [featureHash]);
  assert.equal(applied.status, "applied");
  assert.equal((await git("status", "--porcelain")).stdout, "");
  assert.equal((await fs.readFile(path.join(root, "app.js"), "utf8")), "feature change\n");

  const finalSnapshot = await scanRepository(root);
  assert.equal(finalSnapshot.repository.dirty, false);
  assert.equal(finalSnapshot.state.inProgress, false);
});
