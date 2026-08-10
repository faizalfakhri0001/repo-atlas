const path = require("node:path");
const {
  runGit,
  resolveRepository,
  resolveRepositoryRelativePath,
} = require("./core.cjs");

const DEFAULT_HISTORY_LIMIT = 200;
const MAX_HISTORY_LIMIT = 1000;
const FILE_HISTORY_FORMAT = "--format=%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s";
const HISTORY_STATUS_PATTERN = /^([A-Z])(?:([0-9]{1,3}))?\t([\s\S]*)$/;

function parseHistoryChangeLine(line) {
  const match = String(line ?? "").replace(/\r$/, "").match(HISTORY_STATUS_PATTERN);
  if (!match) return null;

  const status = match[1];
  const paths = match[3].split("\t");
  if (status === "R" || status === "C") {
    return {
      status,
      score: Number(match[2]) || null,
      oldPath: paths[0] ?? "",
      path: paths[1] ?? paths[0] ?? "",
    };
  }
  return {
    status,
    score: Number(match[2]) || null,
    oldPath: "",
    path: paths[0] ?? "",
  };
}

function parseHistoryRecord(record, currentPath) {
  const normalized = String(record ?? "").replace(/^\n+/, "").replace(/\n+$/, "");
  if (!normalized.trim()) return null;

  const firstLineEnd = normalized.indexOf("\n");
  const header = firstLineEnd < 0 ? normalized : normalized.slice(0, firstLineEnd);
  const body = firstLineEnd < 0 ? "" : normalized.slice(firstLineEnd + 1);
  const [hash, parentsRaw, authorName, authorEmail, date, subject] = header.split("\x1f");
  if (!hash || !/^[0-9a-f]{7,40}$/i.test(hash)) return null;

  const change = body
    .split(/\n+/)
    .map(parseHistoryChangeLine)
    .find(Boolean);
  const path = change?.path || currentPath;
  if (!path) return null;

  return {
    hash,
    shortHash: hash.slice(0, 8),
    parentHash: parentsRaw?.split(/\s+/).filter(Boolean)[0] ?? null,
    subject: subject ?? "",
    author: { name: authorName ?? "", email: authorEmail ?? "" },
    date: date ?? "",
    status: change?.status ?? "M",
    path,
    ...(change?.oldPath ? { oldPath: change.oldPath } : {}),
    ...(change?.score ? { score: change.score } : {}),
  };
}

function parseFileHistory(raw, currentPath = "") {
  return String(raw ?? "")
    .split("\x1e")
    .map((record) => parseHistoryRecord(record, currentPath))
    .filter(Boolean);
}

function normalizeHistoryLimit(value) {
  const requested = Number(value);
  if (!Number.isFinite(requested) || requested < 1) return DEFAULT_HISTORY_LIMIT;
  return Math.min(Math.floor(requested), MAX_HISTORY_LIMIT);
}

async function listFileHistory(repositoryPath, options = {}) {
  const repository = await resolveRepository(repositoryPath);
  const target = await resolveRepositoryRelativePath(repository.rootPath, options.path);
  const currentPath = path.relative(repository.rootPath, target).split(path.sep).join("/");
  const limit = normalizeHistoryLimit(options.limit);
  const skip = Math.max(Math.floor(Number(options.skip) || 0), 0);
  const result = await runGit(repository.rootPath, [
    "log",
    "--follow",
    "-M",
    "--date=iso-strict",
    "--name-status",
    "-n",
    String(limit + 1),
    `--skip=${skip}`,
    FILE_HISTORY_FORMAT,
    "--",
    currentPath,
  ]);
  const parsed = parseFileHistory(result.stdout, currentPath);
  return {
    currentPath,
    entries: parsed.slice(0, limit),
    hasMore: parsed.length > limit,
  };
}

module.exports = {
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  FILE_HISTORY_FORMAT,
  parseFileHistory,
  parseHistoryChangeLine,
  parseHistoryRecord,
  listFileHistory,
};
