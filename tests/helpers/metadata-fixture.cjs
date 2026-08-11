const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  createEmptyMetadata,
  createRepositoryMetadataStore,
} = require("../../electron/repository-metadata.cjs");

const CORRUPT_JSON = "{\"version\":2,";

function createV1Metadata(identity, overrides = {}) {
  return {
    version: 1,
    repository: {
      rootPath: identity.rootPath ?? "/tmp/repository",
      lastKnownName: identity.lastKnownName ?? identity.name ?? "repository",
    },
    savedViews: [],
    bookmarks: [],
    notes: [],
    preferences: {},
    updatedAt: "2026-08-11T00:00:00.000Z",
    ...overrides,
  };
}

async function writeFixture(filePath, value) {
  const content = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(filePath, content, { encoding: "utf8", mode: 0o600 });
}

async function createMetadataFixture(testContext, { identity, primary = null, backup = null, now } = {}) {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "repo-atlas-metadata-"));
  testContext.after(() => fs.rm(userDataPath, { recursive: true, force: true }));
  const store = createRepositoryMetadataStore({ userDataPath, now });
  const paths = store.getPaths(identity);
  await fs.mkdir(paths.directory, { recursive: true });
  if (primary !== null) await writeFixture(paths.filePath, primary);
  if (backup !== null) await writeFixture(paths.backupPath, backup);
  return { paths, store, userDataPath };
}

module.exports = {
  CORRUPT_JSON,
  createEmptyMetadata,
  createMetadataFixture,
  createV1Metadata,
};
