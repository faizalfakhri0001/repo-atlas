const test = require("node:test");
const assert = require("node:assert/strict");
const { GitServiceError } = require("../electron/git/core.cjs");
const {
  DEFAULT_OPERATION_MODE,
  assertSafeWriteEnabled,
  normalizeOperationMode,
} = require("../electron/operation-policy.cjs");
const { createPreferencesStore } = require("../electron/preferences.cjs");

test("operation policy defaults unknown values to read-only and blocks writes", () => {
  assert.equal(DEFAULT_OPERATION_MODE, "read-only");
  assert.equal(normalizeOperationMode("unknown"), "read-only");
  assert.throws(() => assertSafeWriteEnabled("read-only"), (error) => error instanceof GitServiceError && error.code === "READ_ONLY_MODE");
  assert.equal(assertSafeWriteEnabled("safe-write"), true);
});

test("preferences store recovers safely and persists the operation mode", async () => {
  let content = "{invalid";
  const writes = [];
  const store = createPreferencesStore({
    filePath: "/tmp/repo-atlas-preferences.json",
    readFile: async () => content,
    mkdir: async () => {},
    writeFile: async (_target, value) => {
      content = value;
      writes.push(value);
    },
  });

  assert.equal(await store.getOperationMode(), "read-only");
  await store.setOperationMode("safe-write");
  assert.equal(await store.getOperationMode(), "safe-write");
  assert.equal(writes.length, 1);
  await assert.rejects(() => store.setOperationMode("unsafe"), (error) => error?.code === "INVALID_ARGUMENT");
});
