const path = require("node:path");
const { GitServiceError, runGit, resolveRepository } = require("./core.cjs");
const { parseRepositoryFileList } = require("./files.cjs");

const TYPES = new Set(["file", "commit", "branch", "tag", "author"]);
const QUALIFIERS = new Set(["type", "author", "branch", "path", "after", "before"]);
const HASH_PATTERN = /^[0-9a-f]{7,40}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RESULT_LIMIT = 20;
const TOTAL_LIMIT = 100;

function tokenize(input) {
  const tokens = [];
  let token = "";
  let quote = null;
  let escaped = false;
  const push = () => {
    if (token) tokens.push(token);
    token = "";
  };

  for (const character of String(input ?? "")) {
    if (escaped) {
      token += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote) {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else token += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      push();
      continue;
    }
    token += character;
  }
  if (escaped) token += "\\";
  push();
  return tokens;
}

function isValidDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) &&
    date.getUTCFullYear() === Number(value.slice(0, 4)) &&
    date.getUTCMonth() + 1 === Number(value.slice(5, 7)) &&
    date.getUTCDate() === Number(value.slice(8, 10))
  );
}

function parseSearchQuery(input) {
  const raw = String(input ?? "");
  const result = { raw, text: "", errors: [] };
  const text = [];
  for (const token of tokenize(raw)) {
    const separator = token.indexOf(":");
    if (separator <= 0) {
      text.push(token);
      continue;
    }
    const qualifier = token.slice(0, separator).toLowerCase();
    const value = token.slice(separator + 1).trim();
    if (!QUALIFIERS.has(qualifier) || !value) {
      text.push(token);
      continue;
    }
    if (qualifier === "type") {
      const type = value.toLowerCase();
      if (type !== "all" && !TYPES.has(type)) result.errors.push({ token, message: `Unknown result type "${value}".` });
      else result.type = type;
      continue;
    }
    if (qualifier === "after" || qualifier === "before") {
      if (!isValidDate(value)) result.errors.push({ token, message: "Date must use a real YYYY-MM-DD value." });
      else result[qualifier] = value;
      continue;
    }
    result[qualifier] = value;
  }
  result.text = text.join(" ").trim();
  return result;
}

function normalize(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function fuzzyScore(candidate, query) {
  let cursor = 0;
  let contiguous = 0;
  let bestContiguous = 0;
  for (const character of query) {
    const index = candidate.indexOf(character, cursor);
    if (index < 0) return 0;
    if (index === cursor) contiguous += 1;
    else {
      bestContiguous = Math.max(bestContiguous, contiguous);
      contiguous = 1;
    }
    cursor = index + 1;
  }
  bestContiguous = Math.max(bestContiguous, contiguous);
  return 180 + (query.length / Math.max(candidate.length, 1)) * 90 + bestContiguous * 5;
}

function scoreText(value, query) {
  const candidate = normalize(value);
  const needle = normalize(query);
  if (!candidate || !needle) return 0;
  if (candidate === needle) return 1000;
  if (candidate.startsWith(needle)) return 820 - Math.min(candidate.length - needle.length, 120);
  if (candidate.split(/[\s/._:@-]+/).some((word) => word.startsWith(needle))) return 700;
  if (candidate.includes(needle)) return 560 - Math.min(candidate.indexOf(needle), 120);
  return fuzzyScore(candidate, needle);
}

function scoreFile(file, query) {
  const needle = normalize(query);
  const filePath = normalize(file.path);
  const name = normalize(file.name || path.posix.basename(file.path));
  if (!needle || !filePath || !name) return 0;
  if (name === needle) return 1200;
  if (filePath === needle) return 1160;
  if (name.startsWith(needle)) return 1020 - Math.min(name.length - needle.length, 120);
  if (filePath.split("/").some((segment) => normalize(segment).startsWith(needle))) return 900;
  if (name.includes(needle)) return 720 - Math.min(name.indexOf(needle), 80);
  if (filePath.includes(needle)) return 620 - Math.min(filePath.indexOf(needle), 120);
  return fuzzyScore(name, needle) || fuzzyScore(filePath, needle);
}

function inDateRange(date, query) {
  if (!date) return !query.after && !query.before;
  const day = String(date).slice(0, 10);
  if (query.after && day < query.after) return false;
  if (query.before && day > query.before) return false;
  return true;
}

function searchValue(query) {
  return query.text || query.path || query.branch || query.author || "";
}

function resultName(result) {
  return normalize(result.path || result.name || result.subject || result.hash);
}

function sortAndLimit(results) {
  return results
    .filter((result) => result && Number(result.score) > 0)
    .sort((left, right) => Number(right.score) - Number(left.score) || resultName(left).localeCompare(resultName(right), undefined, { sensitivity: "base", numeric: true }))
    .slice(0, RESULT_LIMIT);
}

function parseRefRecords(raw, fields) {
  return String(raw ?? "")
    .split("\x1e")
    .map((record) => record.split("\0").slice(0, fields))
    .filter((record) => record.length === fields && record.some(Boolean));
}

async function searchFiles(cwd, query) {
  const [tracked, untracked] = await Promise.all([
    runGit(cwd, ["ls-files", "-z", "--cached"]),
    runGit(cwd, ["ls-files", "-z", "--others", "--exclude-standard"]),
  ]);
  const files = parseRepositoryFileList(tracked.stdout, untracked.stdout);
  const needle = searchValue(query);
  return sortAndLimit(
    files
      .filter((file) => !query.path || normalize(file.path).includes(normalize(query.path)))
      .map((file) => ({ ...file, type: "file", score: scoreFile(file, needle) }))
      .filter((file) => file.score > 0),
  );
}

async function searchBranches(cwd, query) {
  const [refsResult, headResult] = await Promise.all([
    runGit(cwd, [
      "for-each-ref",
      "--sort=-committerdate",
      "--format=%(refname)%00%(refname:short)%00%(objectname)%00%(committerdate:iso-strict)%00%(subject)%x1e",
      "refs/heads",
      "refs/remotes",
    ]),
    runGit(cwd, ["symbolic-ref", "--short", "HEAD"], { allowFailure: true }),
  ]);
  const current = headResult.failed ? "" : headResult.stdout.trim();
  const needle = searchValue(query);
  return sortAndLimit(
    parseRefRecords(refsResult.stdout, 5)
      .map(([ref, name, hash, date, subject]) => ({
        type: "branch",
        name,
        hash,
        current: name === current,
        remote: ref.startsWith("refs/remotes/"),
        date,
        subject,
        score: scoreText(name, needle),
      }))
      .filter((branch) => (!query.branch || normalize(branch.name).includes(normalize(query.branch))) && inDateRange(branch.date, query)),
  );
}

async function searchTags(cwd, query) {
  const result = await runGit(cwd, [
    "for-each-ref",
    "--sort=-creatordate",
    "--format=%(refname:short)%00%(objectname)%00%(creatordate:iso-strict)%00%(subject)%x1e",
    "refs/tags",
  ]);
  const needle = searchValue(query);
  return sortAndLimit(
    parseRefRecords(result.stdout, 4)
      .map(([name, hash, date, subject]) => ({ type: "tag", name, hash, date, subject, score: scoreText(name, needle) }))
      .filter((tag) => inDateRange(tag.date, query)),
  );
}

function parseCommitRecords(raw) {
  return String(raw ?? "")
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, shortHash, subject, author, email, date, refs] = record.split("\x1f");
      return { type: "commit", hash, shortHash, subject, author, email, date, refs: refs ? refs.split(", ").filter(Boolean) : [] };
    })
    .filter((commit) => HASH_PATTERN.test(commit.hash ?? ""));
}

function commitArgs(query, limit = 100) {
  const args = ["log", "--all", "--date=iso-strict", "-n", String(limit)];
  if (query.text) args.push("--regexp-ignore-case", "--fixed-strings", `--grep=${query.text}`);
  if (query.author) args.push("--regexp-ignore-case", `--author=${query.author}`);
  if (query.after) args.push(`--after=${query.after}T00:00:00`);
  if (query.before) args.push(`--before=${query.before}T23:59:59`);
  args.push("--format=%H%x1f%h%x1f%s%x1f%an%x1f%ae%x1f%aI%x1f%D%x1e");
  if (query.path) args.push("--", query.path);
  return args;
}

async function searchCommits(cwd, query) {
  const result = await runGit(cwd, commitArgs(query));
  const needle = searchValue(query);
  const commits = parseCommitRecords(result.stdout)
    .filter((commit) => inDateRange(commit.date, query))
    .map((commit) => ({
      ...commit,
      score: Math.max(scoreText(commit.subject, needle), scoreText(commit.hash, needle), scoreText(commit.author, needle)),
    }));
  return sortAndLimit(commits);
}

async function resolveHashCommit(cwd, hash) {
  const resolved = await runGit(cwd, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${hash}^{commit}`], { allowFailure: true });
  if (resolved.failed || !HASH_PATTERN.test(resolved.stdout.trim())) return null;
  const result = await runGit(cwd, [
    "show",
    "-s",
    "--date=iso-strict",
    "--format=%H%x1f%h%x1f%s%x1f%an%x1f%ae%x1f%aI%x1f%D%x1e",
    resolved.stdout.trim(),
    "--",
  ]);
  const commit = parseCommitRecords(result.stdout)[0];
  return commit ? { ...commit, score: 1300 } : null;
}

async function searchAuthors(cwd, query) {
  const result = await runGit(cwd, ["shortlog", "-sne", "--all"]);
  const needle = query.author || query.text;
  return sortAndLimit(
    String(result.stdout ?? "")
      .split("\n")
      .map((line) => line.match(/^\s*(\d+)\s+(.+?)\s+<([^>]+)>\s*$/))
      .filter(Boolean)
      .map((match) => ({
        type: "author",
        name: match[2],
        email: match[3],
        commits: Number(match[1]),
        score: Math.max(scoreText(match[2], needle), scoreText(match[3], needle)),
      })),
  );
}

function requestedTypes(options, query) {
  if (query.type && query.type !== "all") return [query.type];
  if (Array.isArray(options.types) && options.types.length > 0) return [...new Set(options.types.filter((type) => TYPES.has(type)))];
  return [...TYPES];
}

function clampLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return TOTAL_LIMIT;
  return Math.min(Math.max(Math.floor(number), 1), TOTAL_LIMIT);
}

async function searchRepository(repositoryPath, options = {}) {
  const repository = await resolveRepository(repositoryPath);
  const query = parseSearchQuery(options.query);
  const types = requestedTypes(options, query);
  const limit = clampLimit(options.limit);
  const startedAt = Date.now();
  if (!searchValue(query) && !HASH_PATTERN.test(query.text)) {
    return { query: query.raw, errors: query.errors, durationMs: Date.now() - startedAt, results: [], revision: { head: "", scannedAt: new Date().toISOString() } };
  }

  const tasks = [];
  if (types.includes("file")) tasks.push(searchFiles(repository.rootPath, query));
  if (types.includes("branch")) tasks.push(searchBranches(repository.rootPath, query));
  if (types.includes("tag")) tasks.push(searchTags(repository.rootPath, query));
  if (types.includes("commit")) tasks.push(searchCommits(repository.rootPath, query));
  if (types.includes("author")) tasks.push(searchAuthors(repository.rootPath, query));
  if (types.includes("commit") && HASH_PATTERN.test(query.text)) {
    tasks.push(resolveHashCommit(repository.rootPath, query.text));
  }

  const [revision, ...taskResults] = await Promise.all([
    runGit(repository.rootPath, ["rev-parse", "HEAD"], { allowFailure: true }),
    ...tasks,
  ]);
  const byType = new Map();
  for (const result of taskResults.flat().filter(Boolean)) {
    const key = `${result.type}:${result.hash || result.name || result.path}`;
    const existing = byType.get(key);
    if (!existing || result.score > existing.score) byType.set(key, result);
  }
  const results = [...byType.values()]
    .sort((left, right) => Number(right.score) - Number(left.score) || resultName(left).localeCompare(resultName(right), undefined, { sensitivity: "base", numeric: true }))
    .slice(0, limit);
  return {
    query: query.raw,
    errors: query.errors,
    durationMs: Date.now() - startedAt,
    results,
    revision: { head: revision.failed ? "" : revision.stdout.trim(), scannedAt: new Date().toISOString() },
  };
}

module.exports = {
  parseSearchQuery,
  scoreText,
  scoreFile,
  parseCommitRecords,
  searchRepository,
};
