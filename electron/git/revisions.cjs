const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const {
  GitServiceError,
  assertCommitHash,
  humanizeGitError,
  resolveCommit,
  resolveRepository,
  resolveRepositoryRelativePath,
} = require("./core.cjs");
const { MAX_FILE_PREVIEW_BYTES, detectFileLanguage, isBinaryBuffer } = require("./files.cjs");

const execFileAsync = promisify(execFile);
const MAX_REVISION_BYTES = 32 * 1024 * 1024;

function gitEnvironment() {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "Never",
    LC_ALL: "C",
  };
}

function errorText(value) {
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return String(value ?? "");
}

async function readFileAtRevision(repositoryPath, options = {}) {
  const repository = await resolveRepository(repositoryPath);
  const target = await resolveRepositoryRelativePath(repository.rootPath, options.path);
  const relativePath = path.relative(repository.rootPath, target).split(path.sep).join("/");
  const commit = await resolveCommit(repository.rootPath, assertCommitHash(options.hash));

  let content;
  try {
    const result = await execFileAsync("git", ["show", `${commit.hash}:${relativePath}`], {
      cwd: repository.rootPath,
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: MAX_REVISION_BYTES,
      encoding: "buffer",
      env: gitEnvironment(),
    });
    content = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? "");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new GitServiceError(
        "Git executable was not found. Install Git and ensure it is available in PATH.",
        "GIT_NOT_FOUND",
      );
    }
    if (error.killed || error.signal) {
      throw new GitServiceError("Git command timed out while reading the file revision.", "GIT_TIMEOUT", errorText(error.stderr));
    }
    throw new GitServiceError(
      "The file was not found in that revision.",
      "PATH_NOT_FOUND",
      humanizeGitError(errorText(error.stderr || error.message)),
    );
  }

  const truncated = content.length > MAX_FILE_PREVIEW_BYTES;
  const preview = truncated ? content.subarray(0, MAX_FILE_PREVIEW_BYTES) : content;
  const binary = isBinaryBuffer(preview);
  return {
    hash: commit.hash,
    path: relativePath,
    text: binary ? null : preview.toString("utf8"),
    binary,
    truncated,
    size: content.length,
    language: detectFileLanguage(relativePath),
  };
}

module.exports = {
  MAX_REVISION_BYTES,
  readFileAtRevision,
};
