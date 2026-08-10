const { GitServiceError } = require("./git/core.cjs");

const OPERATION_MODES = Object.freeze(["read-only", "safe-write"]);
const DEFAULT_OPERATION_MODE = "read-only";

function normalizeOperationMode(value) {
  return OPERATION_MODES.includes(value) ? value : DEFAULT_OPERATION_MODE;
}

function assertSafeWriteEnabled(mode) {
  if (normalizeOperationMode(mode) !== "safe-write") {
    throw new GitServiceError(
      "Repository write operations are locked. Enable Safe Write before staging or unstaging files.",
      "READ_ONLY_MODE",
    );
  }
  return true;
}

module.exports = {
  DEFAULT_OPERATION_MODE,
  OPERATION_MODES,
  assertSafeWriteEnabled,
  normalizeOperationMode,
};
