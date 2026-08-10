const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 32 * 1024 * 1024;
const HASH_PATTERN = /^[0-9a-f]{7,40}$/i;

class GitServiceError extends Error {
  constructor(message, code = "GIT_ERROR", details = "") {
    super(message);
    this.name = "GitServiceError";
    this.code = code;
    this.details = details;
  }
}

async function runGit(cwd, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      windowsHide: true,
      timeout: options.timeout ?? 30_000,
      maxBuffer: MAX_BUFFER,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "Never",
        LC_ALL: "C",
      },
    });

    return {
      stdout: stdout.trimEnd(),
      stderr: stderr.trimEnd(),
      code: 0,
    };
  } catch (error) {
    if (options.allowFailure) {
      return {
        stdout: error.stdout?.trimEnd?.() ?? "",
        stderr: error.stderr?.trimEnd?.() ?? error.message,
        failed: true,
        code: typeof error.code === "number" ? error.code : null,
      };
    }

    if (error.code === "ENOENT") {
      throw new GitServiceError(
        "Git executable was not found. Install Git and ensure it is available in PATH.",
        "GIT_NOT_FOUND",
      );
    }

    if (error.killed || error.signal) {
      throw new GitServiceError(
        "Git command timed out while scanning this repository.",
        "GIT_TIMEOUT",
        error.stderr ?? "",
      );
    }

    throw new GitServiceError(
      humanizeGitError(error.stderr || error.message),
      "GIT_COMMAND_FAILED",
      error.stderr || error.message,
    );
  }
}

function humanizeGitError(rawMessage) {
  const message = String(rawMessage || "Unknown Git error").trim();
  if (/not a git repository/i.test(message)) {
    return "The selected folder is not inside a Git repository.";
  }
  if (/dubious ownership/i.test(message)) {
    return "Git rejected this repository because of its safe.directory policy.";
  }
  return message.split("\n")[0] || "Git command failed.";
}

function assertCommitHash(value) {
  const hash = typeof value === "string" ? value.trim() : "";
  if (!HASH_PATTERN.test(hash)) {
    throw new GitServiceError("A valid commit hash is required.", "INVALID_ARGUMENT");
  }
  return hash.toLowerCase();
}

function assertRefName(value) {
  const ref = typeof value === "string" ? value.trim() : "";
  const looksValid =
    ref.length > 0 &&
    ref.length <= 512 &&
    !ref.startsWith("-") &&
    !ref.includes("..") &&
    !ref.endsWith(".lock") &&
    !/[\0\n\s~^:?*[\\]/.test(ref) &&
    !ref.includes("@{");
  if (!looksValid) {
    throw new GitServiceError(`"${ref || "(empty)"}" is not a valid ref name.`, "INVALID_ARGUMENT");
  }
  return ref;
}

function assertRelativePath(value) {
  const filePath = typeof value === "string" ? value : "";
  if (!filePath || filePath.length > 4096 || filePath.includes("\0")) {
    throw new GitServiceError("A valid file path is required.", "INVALID_ARGUMENT");
  }
  return filePath;
}

async function resolveCommit(cwd, refOrHash) {
  const ref = HASH_PATTERN.test(String(refOrHash).trim())
    ? assertCommitHash(refOrHash)
    : assertRefName(refOrHash);
  const result = await runGit(
    cwd,
    ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`],
    { allowFailure: true },
  );
  if (result.failed || !result.stdout) {
    throw new GitServiceError(`"${ref}" does not resolve to a commit.`, "UNKNOWN_REF");
  }
  return { ref, hash: result.stdout.trim() };
}

async function validateDirectory(candidatePath) {
  if (typeof candidatePath !== "string" || candidatePath.trim().length === 0) {
    throw new GitServiceError("Repository path is required.", "INVALID_PATH");
  }

  const resolved = path.resolve(candidatePath);
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    throw new GitServiceError("The selected folder no longer exists.", "PATH_NOT_FOUND");
  }

  if (!stat.isDirectory()) {
    throw new GitServiceError("The selected path is not a directory.", "INVALID_PATH");
  }

  return resolved;
}

async function resolveRepository(candidatePath) {
  const selectedPath = await validateDirectory(candidatePath);
  const { stdout: root } = await runGit(selectedPath, ["rev-parse", "--show-toplevel"]);
  const { stdout: gitDirRaw } = await runGit(selectedPath, ["rev-parse", "--git-dir"]);
  const rootPath = path.resolve(selectedPath, root);
  const gitDir = path.isAbsolute(gitDirRaw)
    ? path.normalize(gitDirRaw)
    : path.resolve(selectedPath, gitDirRaw);

  return {
    selectedPath,
    rootPath,
    gitDir,
    name: path.basename(rootPath),
  };
}

module.exports = {
  GitServiceError,
  runGit,
  humanizeGitError,
  assertCommitHash,
  assertRefName,
  assertRelativePath,
  resolveCommit,
  validateDirectory,
  resolveRepository,
};
