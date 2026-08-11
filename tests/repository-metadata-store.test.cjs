const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const {
  createEmptyMetadata,
  createRepositoryMetadataStore,
} = require("../electron/repository-metadata.cjs");
const {
  CORRUPT_JSON,
  createMetadataFixture,
  createV1Metadata,
} = require("./helpers/metadata-fixture.cjs");

const identity = {
  repositoryId: "a".repeat(64),
  commonGitDir: "/Users/example/project/.git",
  lastKnownName: "project",
};

const clock = () => "2026-08-11T04:00:00.000Z";

test("metadata store uses the user data repository directory and shares records across worktrees", async (t) => {
  const fixture = await createMetadataFixture(t, { identity, now: clock });
  const mainMetadata = createEmptyMetadata({ ...identity, lastKnownName: "project" }, clock());

  await fixture.store.save(mainMetadata);
  const linkedResult = await fixture.store.load({
    ...identity,
    lastKnownName: "project-payment",
  });

  assert.equal(fixture.paths.filePath, path.join(fixture.userDataPath, "repo-atlas", "repositories", `${identity.repositoryId}.json`));
  assert.equal(linkedResult.source, "primary");
  assert.equal(linkedResult.metadata.repository.id, identity.repositoryId);
  assert.equal(linkedResult.metadata.repository.commonGitDir, identity.commonGitDir);
  assert.deepEqual(fixture.store.getPaths({ ...identity, lastKnownName: "other-worktree" }), fixture.paths);
});

test("save writes a complete metadata file and retains the previous valid version as backup", async (t) => {
  const fixture = await createMetadataFixture(t, { identity, now: clock });
  const first = await fixture.store.save(createEmptyMetadata(identity, clock()));
  const second = await fixture.store.save({
    ...first,
    preferences: { heatmap: { enabled: true } },
  });

  const primary = JSON.parse(await fs.readFile(fixture.paths.filePath, "utf8"));
  const backup = JSON.parse(await fs.readFile(fixture.paths.backupPath, "utf8"));
  const files = await fs.readdir(fixture.paths.directory);

  assert.deepEqual(primary.preferences, second.preferences);
  assert.deepEqual(backup.preferences, first.preferences);
  assert.equal(files.some((file) => file.includes(".tmp-")), false);
});

test("load migrates version 1 metadata and keeps the old file as a backup", async (t) => {
  const fixture = await createMetadataFixture(t, {
    identity,
    primary: createV1Metadata(identity, { savedViews: [{ id: "legacy" }] }),
    now: clock,
  });

  const result = await fixture.store.load(identity);
  const primary = JSON.parse(await fs.readFile(fixture.paths.filePath, "utf8"));
  const backup = JSON.parse(await fs.readFile(fixture.paths.backupPath, "utf8"));

  assert.equal(result.source, "primary");
  assert.equal(result.migrated, true);
  assert.equal(result.metadata.version, 2);
  assert.equal(primary.version, 2);
  assert.equal(backup.version, 1);
});

test("load recovers from a valid backup without replacing that backup with corrupt primary data", async (t) => {
  const fixture = await createMetadataFixture(t, { identity, now: clock });
  await fixture.store.save(createEmptyMetadata(identity, clock()));
  await fixture.store.save({
    ...createEmptyMetadata(identity, clock()),
    preferences: { worktree: { showAll: true } },
  });
  await fs.writeFile(fixture.paths.filePath, CORRUPT_JSON, "utf8");

  const result = await fixture.store.load(identity);
  const repairedPrimary = JSON.parse(await fs.readFile(fixture.paths.filePath, "utf8"));
  const preservedBackup = JSON.parse(await fs.readFile(fixture.paths.backupPath, "utf8"));

  assert.equal(result.source, "backup");
  assert.equal(result.recovered, true);
  assert.deepEqual(result.metadata.preferences, {});
  assert.deepEqual(repairedPrimary.preferences, {});
  assert.deepEqual(preservedBackup.preferences, {});
});

test("load uses safe defaults when both metadata copies are unavailable or corrupt", async (t) => {
  const fixture = await createMetadataFixture(t, {
    identity,
    primary: CORRUPT_JSON,
    backup: "not-json",
    now: clock,
  });

  const result = await fixture.store.load(identity);

  assert.equal(result.source, "default");
  assert.equal(result.metadata.version, 2);
  assert.equal(result.metadata.repository.id, identity.repositoryId);
  assert.match(result.warning, /default metadata/i);
});

test("reset removes primary and backup metadata without touching the repository", async (t) => {
  const fixture = await createMetadataFixture(t, { identity, now: clock });
  await fixture.store.save(createEmptyMetadata(identity, clock()));
  await fixture.store.save(createEmptyMetadata(identity, clock()));

  await fixture.store.reset(identity);

  await assert.rejects(fs.access(fixture.paths.filePath), { code: "ENOENT" });
  await assert.rejects(fs.access(fixture.paths.backupPath), { code: "ENOENT" });
});
