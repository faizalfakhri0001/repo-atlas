const fs = require("node:fs/promises");
const {
  GitServiceError,
  assertRelativePath,
  resolveCommit,
  resolveRepository,
  resolveRepositoryFilePath,
  runGit,
} = require("./core.cjs");
const { isBinaryBuffer } = require("./files.cjs");
const { parseBlamePorcelain } = require("./blame-parser.cjs");
const { BlameCache } = require("./blame-cache.cjs");

const DEFAULT_BLAME_TIMEOUT = 30_000;
const BLAME_SAMPLE_BYTES = 8_192;
const MAX_BLAME_BYTES = 2 * 1024 * 1024;
const MAX_BLAME_LINES = 50_000;
const blameCache = new BlameCache(10);

async function readFileSample(target) {
  let handle;
  try {
    handle = await fs.open(target, "r");
    const buffer = Buffer.alloc(BLAME_SAMPLE_BYTES);
    const result = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, result.bytesRead);
  } catch (error) {
    if (error instanceof GitServiceError) throw error;
    throw new GitServiceError("The requested file could not be read.", "FILE_READ_FAILED", error.message);
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

async function hasWorkingTreeChanges(repositoryRoot, filePath) {
  const result = await runGit(repositoryRoot, ["status", "--porcelain=v1", "--untracked-files=normal", "--", filePath], { allowFailure: true });
  return !result.failed && result.stdout.trim().length > 0;
}

function countTextLines(buffer) {
  if (!buffer || buffer.length === 0) return 0;
  const text = buffer.toString("utf8");
  const matches = text.match(/\r\n|\r|\n/g);
  const count = (matches?.length ?? 0) + 1;
  return /(?:\r\n|\r|\n)$/.test(text) ? count - 1 : count;
}

async function inspectBlameFile(target) {
  let stats;
  try {
    stats = await fs.stat(target);
  } catch (error) {
    throw new GitServiceError("The requested file could not be inspected.", "INVALID_PATH", error.message);
  }
  if (stats.size > MAX_BLAME_BYTES) {
    throw new GitServiceError("Blame is disabled for very large files.", "BLAME_TOO_LARGE", {
      reason: "size",
      size: stats.size,
      maxBytes: MAX_BLAME_BYTES,
      maxLines: MAX_BLAME_LINES,
    });
  }

  let buffer;
  try {
    buffer = await fs.readFile(target);
  } catch (error) {
    throw new GitServiceError("The requested file could not be read.", "FILE_READ_FAILED", error.message);
  }
  const lineCount = countTextLines(buffer);
  if (lineCount > MAX_BLAME_LINES) {
    throw new GitServiceError("Blame is disabled for very large files.", "BLAME_TOO_LARGE", {
      reason: "lines",
      size: stats.size,
      lineCount,
      maxBytes: MAX_BLAME_BYTES,
      maxLines: MAX_BLAME_LINES,
    });
  }
  return { size: stats.size, lineCount, binary: isBinaryBuffer(buffer) };
}

async function fileBlame(repositoryPath, options = {}) {
  const repository = await resolveRepository(repositoryPath);
  const relativePath = assertRelativePath(options.path);
  const target = await resolveRepositoryFilePath(repository.rootPath, relativePath);
  const revisionInput = options.revision ?? "HEAD";
  const resolvedRevision = await resolveCommit(repository.rootPath, revisionInput);
  const inspection = await inspectBlameFile(target);
  const workingTreeDirty = await hasWorkingTreeChanges(repository.rootPath, relativePath);
  if (revisionInput === "HEAD") blameCache.invalidateHead(repository.rootPath, resolvedRevision.hash);
  const cached = blameCache.get(repository.rootPath, resolvedRevision.hash, relativePath);
  if (cached) return { ...cached, workingTreeDirty, cached: true };

  if (inspection.binary) {
    const binaryResult = {
      path: relativePath,
      revision: resolvedRevision.hash,
      lines: [],
      authors: [],
      binary: true,
      workingTreeDirty,
      message: "Blame unavailable for binary files.",
    };
    blameCache.set(repository.rootPath, resolvedRevision.hash, relativePath, { ...binaryResult, workingTreeDirty: false });
    return binaryResult;
  }

  const result = await runGit(
    repository.rootPath,
    ["blame", "--line-porcelain", "--date=iso-strict", resolvedRevision.hash, "--", relativePath],
    { timeout: DEFAULT_BLAME_TIMEOUT },
  );
  const parsed = parseBlamePorcelain(result.stdout);
  const resultData = {
    path: relativePath,
    revision: resolvedRevision.hash,
    lines: parsed.lines,
    authors: parsed.authors,
    binary: false,
    workingTreeDirty,
  };
  blameCache.set(repository.rootPath, resolvedRevision.hash, relativePath, { ...resultData, workingTreeDirty: false });
  return resultData;
}

module.exports = {
  DEFAULT_BLAME_TIMEOUT,
  BLAME_SAMPLE_BYTES,
  MAX_BLAME_BYTES,
  MAX_BLAME_LINES,
  fileBlame,
  blameCache,
  hasWorkingTreeChanges,
  inspectBlameFile,
  readFileSample,
};
