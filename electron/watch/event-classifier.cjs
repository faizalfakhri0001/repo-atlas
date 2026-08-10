const path = require("node:path");

const CHANGE_KINDS = Object.freeze(["worktree", "index", "head", "refs", "operation-state"]);
const KIND_PRIORITY = Object.freeze({
  worktree: 1,
  index: 2,
  "operation-state": 3,
  refs: 4,
  head: 5,
});
const IGNORED_WORKTREE_SEGMENTS = new Set([".git", "node_modules", "dist", "build", "coverage", "vendor"]);
const OPERATION_NAMES = new Set(["CHERRY_PICK_HEAD", "MERGE_HEAD", "REVERT_HEAD", "BISECT_LOG"]);

function normalizePath(candidate) {
  return path.resolve(String(candidate ?? ""));
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function toPortableRelative(root, candidate) {
  return path.relative(root, candidate).split(path.sep).join("/");
}

function isIgnoredWorktreePath(repositoryRoot, changedPath) {
  const relative = toPortableRelative(repositoryRoot, changedPath);
  if (!relative || relative.startsWith("../")) return true;
  const segments = relative.split("/");
  return segments.some((segment) => IGNORED_WORKTREE_SEGMENTS.has(segment));
}

function classifyGitPath(relativeGitPath) {
  const relative = String(relativeGitPath ?? "").replaceAll("\\", "/");
  if (relative === "HEAD") return "head";
  if (relative === "index") return "index";
  if (relative === "packed-refs" || relative.startsWith("refs/")) return "refs";
  if (OPERATION_NAMES.has(relative) || relative.startsWith("rebase-merge/") || relative.startsWith("rebase-apply/") || relative.startsWith("sequencer/")) {
    return "operation-state";
  }
  return null;
}

function classifyRepositoryPath({ repositoryRoot, gitDir, changedPath, eventType = "change" } = {}) {
  const root = normalizePath(repositoryRoot);
  const changed = normalizePath(changedPath);
  const metadataRoot = gitDir ? normalizePath(gitDir) : null;

  if (metadataRoot && isInside(metadataRoot, changed)) {
    const relativeGitPath = toPortableRelative(metadataRoot, changed);
    const kind = classifyGitPath(relativeGitPath);
    if (!kind) return null;
    return {
      repositoryPath: root,
      kind,
      paths: [relativeGitPath],
      eventType,
      timestamp: Date.now(),
    };
  }

  if (!isInside(root, changed) || isIgnoredWorktreePath(root, changed)) return null;
  return {
    repositoryPath: root,
    kind: "worktree",
    paths: [toPortableRelative(root, changed)],
    eventType,
    timestamp: Date.now(),
  };
}

function coalesceRepositoryChanges(events = []) {
  const usable = events.filter(Boolean);
  if (usable.length === 0) return null;
  const selected = usable.reduce((current, candidate) => {
    if (!current || KIND_PRIORITY[candidate.kind] > KIND_PRIORITY[current.kind]) return candidate;
    return current;
  }, null);
  const paths = [...new Set(usable.flatMap((event) => event.paths ?? []))].sort();
  const kinds = [...new Set(usable.map((event) => event.kind))].sort((left, right) => KIND_PRIORITY[left] - KIND_PRIORITY[right]);
  return {
    repositoryPath: selected.repositoryPath,
    kind: selected.kind,
    kinds,
    paths,
    timestamp: Math.max(...usable.map((event) => event.timestamp ?? 0)) || Date.now(),
  };
}

module.exports = {
  CHANGE_KINDS,
  IGNORED_WORKTREE_SEGMENTS,
  classifyGitPath,
  classifyRepositoryPath,
  coalesceRepositoryChanges,
  isIgnoredWorktreePath,
};
