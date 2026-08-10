const fs = require("node:fs/promises");
const path = require("node:path");
const { GitServiceError, runGit, resolveRepository, resolveRepositoryFilePath } = require("./core.cjs");

const MAX_FILE_PREVIEW_BYTES = 1_000_000;
const LANGUAGE_BY_EXTENSION = {
  c: "C",
  cc: "C++",
  cpp: "C++",
  css: "CSS",
  go: "Go",
  h: "C",
  hpp: "C++",
  html: "HTML",
  java: "Java",
  js: "JavaScript",
  json: "JSON",
  jsx: "JavaScript",
  md: "Markdown",
  mjs: "JavaScript",
  py: "Python",
  rs: "Rust",
  sh: "Shell",
  sql: "SQL",
  ts: "TypeScript",
  tsx: "TypeScript",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
};

function parseNullSeparatedPaths(raw) {
  return String(raw ?? "")
    .split("\0")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function fileExtension(filePath) {
  const name = path.posix.basename(filePath);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function compareFilePaths(left, right) {
  return left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
}

function detectFileLanguage(filePath) {
  return LANGUAGE_BY_EXTENSION[fileExtension(filePath)] ?? null;
}

function isBinaryBuffer(buffer) {
  if (!buffer || buffer.length === 0) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8_192));
  if (sample.includes(0)) return true;
  let suspicious = 0;
  for (const byte of sample) {
    if ((byte < 7 || (byte > 14 && byte < 32) || byte === 127) && byte !== 9 && byte !== 10 && byte !== 13) {
      suspicious += 1;
    }
  }
  return suspicious / sample.length > 0.1;
}

function parseRepositoryFileList(trackedRaw, untrackedRaw) {
  const trackedPaths = parseNullSeparatedPaths(trackedRaw);
  const tracked = new Set(trackedPaths);
  const paths = [...new Set([...trackedPaths, ...parseNullSeparatedPaths(untrackedRaw)])].sort(compareFilePaths);
  return paths.map((filePath) => ({
    path: filePath,
    name: path.posix.basename(filePath),
    extension: fileExtension(filePath),
    tracked: tracked.has(filePath),
    size: null,
  }));
}

async function listRepositoryFiles(repositoryPath) {
  const repository = await resolveRepository(repositoryPath);
  const [trackedResult, untrackedResult] = await Promise.all([
    runGit(repository.rootPath, ["ls-files", "-z", "--cached"]),
    runGit(repository.rootPath, ["ls-files", "-z", "--others", "--exclude-standard"]),
  ]);
  return parseRepositoryFileList(trackedResult.stdout, untrackedResult.stdout);
}

async function readRepositoryFile(repositoryPath, filePath) {
  const repository = await resolveRepository(repositoryPath);
  const target = await resolveRepositoryFilePath(repository.rootPath, filePath);
  const relativePath = path.relative(repository.rootPath, target).split(path.sep).join("/");
  const stats = await fs.stat(target);
  const bytesToRead = Math.min(stats.size, MAX_FILE_PREVIEW_BYTES);
  let buffer;
  let handle;
  try {
    handle = await fs.open(target, "r");
    buffer = Buffer.alloc(bytesToRead);
    const result = await handle.read(buffer, 0, bytesToRead, 0);
    buffer = buffer.subarray(0, result.bytesRead);
  } catch (error) {
    if (error.code === "ENOENT") throw new GitServiceError("The requested file does not exist.", "PATH_NOT_FOUND");
    throw new GitServiceError("The requested file could not be read.", "FILE_READ_FAILED", error.message);
  } finally {
    if (handle) await handle.close().catch(() => {});
  }

  const binary = isBinaryBuffer(buffer);
  return {
    path: relativePath,
    text: binary ? null : buffer.toString("utf8"),
    binary,
    truncated: stats.size > MAX_FILE_PREVIEW_BYTES,
    size: stats.size,
    language: detectFileLanguage(relativePath),
  };
}

module.exports = {
  MAX_FILE_PREVIEW_BYTES,
  detectFileLanguage,
  fileExtension,
  isBinaryBuffer,
  parseNullSeparatedPaths,
  parseRepositoryFileList,
  listRepositoryFiles,
  readRepositoryFile,
};
