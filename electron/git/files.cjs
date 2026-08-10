const path = require("node:path");
const { runGit, resolveRepository } = require("./core.cjs");

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

module.exports = {
  fileExtension,
  parseNullSeparatedPaths,
  parseRepositoryFileList,
  listRepositoryFiles,
};
