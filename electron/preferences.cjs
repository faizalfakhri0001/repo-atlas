const fs = require("node:fs/promises");
const path = require("node:path");
const { GitServiceError } = require("./git/core.cjs");
const {
  DEFAULT_OPERATION_MODE,
  OPERATION_MODES,
  normalizeOperationMode,
} = require("./operation-policy.cjs");

function createPreferencesStore({ filePath, readFile = fs.readFile, writeFile = fs.writeFile, mkdir = fs.mkdir } = {}) {
  if (typeof filePath !== "string" && typeof filePath !== "function") {
    throw new TypeError("A preferences file path is required.");
  }

  const resolveFilePath = () => (typeof filePath === "function" ? filePath() : filePath);

  async function readPreferences() {
    try {
      const raw = await readFile(resolveFilePath(), "utf8");
      const value = JSON.parse(raw);
      return value && typeof value === "object" ? value : {};
    } catch (error) {
      if (error?.code === "ENOENT" || error instanceof SyntaxError) return {};
      throw error;
    }
  }

  async function getOperationMode() {
    const preferences = await readPreferences();
    return normalizeOperationMode(preferences.operationMode ?? DEFAULT_OPERATION_MODE);
  }

  async function setOperationMode(mode) {
    if (!OPERATION_MODES.includes(mode)) {
      throw new GitServiceError("Unsupported repository operation mode.", "INVALID_ARGUMENT");
    }
    const target = resolveFilePath();
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify({ operationMode: mode }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    return mode;
  }

  return { getOperationMode, setOperationMode };
}

module.exports = {
  createPreferencesStore,
};
