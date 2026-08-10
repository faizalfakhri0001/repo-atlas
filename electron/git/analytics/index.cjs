const crypto = require("node:crypto");
const { resolveRepository, runGit } = require("../core.cjs");
const { runGitStream } = require("./runner.cjs");
const { createAnalyticsParser } = require("./parser.cjs");
const { addAuthorAlias, normalizeAuthorIdentity } = require("./identity.cjs");
const {
  MAX_ANALYTICS_OUTPUT_BYTES,
  analyticsReadLimit,
  applyCommitScope,
  limitFilesForCommit,
  normalizeAnalyticsScope,
} = require("./limits.cjs");

const ANALYTICS_FORMAT = "%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s";

function chooseEarlier(current, candidate) {
  if (!candidate) return current;
  if (!current || candidate < current) return candidate;
  return current;
}

function chooseLater(current, candidate) {
  if (!candidate) return current;
  if (!current || candidate > current) return candidate;
  return current;
}

function createFileAnalytics(filePath) {
  return {
    path: filePath,
    commits: 0,
    additions: 0,
    deletions: 0,
    churn: 0,
    firstSeenAt: null,
    lastChangedAt: null,
    authors: new Map(),
  };
}

function createAuthorAnalytics(identity) {
  return {
    key: identity.key,
    name: identity.name,
    email: identity.email,
    aliases: new Set(identity.alias ? [identity.alias] : []),
    commits: 0,
    additions: 0,
    deletions: 0,
    churn: 0,
    lastChangedAt: null,
  };
}

function createFileAuthorAnalytics(identity) {
  return {
    key: identity.key,
    name: identity.name,
    email: identity.email,
    commits: 0,
    additions: 0,
    deletions: 0,
    churn: 0,
    lastChangedAt: null,
  };
}

function updateAuthorAnalytics(target, identity, commitDate, additions = 0, deletions = 0) {
  target.name = identity.name || target.name;
  target.email = identity.email || target.email;
  target.aliases = addAuthorAlias(target.aliases, identity);
  target.additions += additions;
  target.deletions += deletions;
  target.churn += additions + deletions;
  target.lastChangedAt = chooseLater(target.lastChangedAt, commitDate);
}

function updateFileAnalytics(file, identity, commitDate, change) {
  file.commits += 1;
  file.additions += change.additions;
  file.deletions += change.deletions;
  file.churn += change.additions + change.deletions;
  file.firstSeenAt = chooseEarlier(file.firstSeenAt, commitDate);
  file.lastChangedAt = chooseLater(file.lastChangedAt, commitDate);

  let fileAuthor = file.authors.get(identity.key);
  if (!fileAuthor) {
    fileAuthor = createFileAuthorAnalytics(identity);
    file.authors.set(identity.key, fileAuthor);
  }
  fileAuthor.name = identity.name || fileAuthor.name;
  fileAuthor.email = identity.email || fileAuthor.email;
  fileAuthor.commits += 1;
  fileAuthor.additions += change.additions;
  fileAuthor.deletions += change.deletions;
  fileAuthor.churn += change.additions + change.deletions;
  fileAuthor.lastChangedAt = chooseLater(fileAuthor.lastChangedAt, commitDate);
}

function createAnalyticsIndex(repository, head, refsFingerprint, scope, commits) {
  const files = new Map();
  const authors = new Map();
  let additions = 0;
  let deletions = 0;
  let filesTruncated = false;

  const summaries = commits.map((commit) => {
    const identity = normalizeAuthorIdentity(commit.author);
    let author = authors.get(identity.key);
    if (!author) {
      author = createAuthorAnalytics(identity);
      authors.set(identity.key, author);
    }
    author.commits += 1;
    author.name = identity.name || author.name;
    author.email = identity.email || author.email;
    author.aliases = addAuthorAlias(author.aliases, identity);
    author.lastChangedAt = chooseLater(author.lastChangedAt, commit.authoredAt);

    const limitedFiles = limitFilesForCommit(commit.files, scope.maxFilesPerCommit);
    filesTruncated ||= limitedFiles.truncated;
    const seenPaths = new Set();
    const changes = [];
    for (const change of limitedFiles.files) {
      if (!change.path || seenPaths.has(change.path)) continue;
      seenPaths.add(change.path);
      let file = files.get(change.path);
      if (!file) {
        file = createFileAnalytics(change.path);
        files.set(change.path, file);
      }
      updateFileAnalytics(file, identity, commit.authoredAt, change);
      updateAuthorAnalytics(author, identity, commit.authoredAt, change.additions, change.deletions);
      additions += change.additions;
      deletions += change.deletions;
      changes.push({ ...change });
    }

    return {
      hash: commit.hash,
      parents: commit.parents,
      author: {
        key: identity.key,
        name: identity.name,
        email: identity.email,
      },
      authoredAt: commit.authoredAt,
      subject: commit.subject,
      files: changes,
    };
  });

  return {
    repositoryKey: repository.rootPath,
    head,
    refsFingerprint,
    generatedAt: new Date().toISOString(),
    scope: {
      ...scope,
      processedCommits: summaries.length,
      truncated: scope.truncated,
      filesTruncated,
    },
    files,
    authors,
    commits: summaries,
    totals: {
      commits: summaries.length,
      files: files.size,
      additions,
      deletions,
    },
  };
}

async function readRepositoryRevision(repositoryRoot) {
  const result = await runGit(repositoryRoot, ["rev-parse", "--verify", "--quiet", "HEAD"], { allowFailure: true });
  return result.failed ? "" : result.stdout.trim();
}

async function readRefsFingerprint(repositoryRoot) {
  const result = await runGit(repositoryRoot, ["for-each-ref", "--format=%(refname)%00%(objectname)"], { allowFailure: true });
  const raw = result.failed ? "" : result.stdout;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function buildAnalyticsIndex(repositoryPath, options = {}) {
  const repository = await resolveRepository(repositoryPath);
  const scope = normalizeAnalyticsScope(options);
  const parser = createAnalyticsParser();
  const [head, refsFingerprint] = await Promise.all([
    readRepositoryRevision(repository.rootPath),
    readRefsFingerprint(repository.rootPath),
  ]);
  const args = [
    "log",
    "--all",
    "--date=iso-strict",
    `--format=${ANALYTICS_FORMAT}`,
    "--numstat",
    "-M",
    "--no-ext-diff",
    `--max-count=${analyticsReadLimit(scope.maxCommits)}`,
  ];

  await runGitStream(repository.rootPath, args, {
    signal: options.signal,
    maxOutputBytes: options.maxOutputBytes ?? MAX_ANALYTICS_OUTPUT_BYTES,
    timeoutMs: options.timeoutMs,
    onChunk: (chunk) => parser.push(chunk),
  });
  const parsed = parser.finish();
  const scoped = applyCommitScope(parsed.commits, scope);
  return createAnalyticsIndex(repository, head, refsFingerprint, {
    ...scoped.scope,
    processedCommits: scoped.processedCommits,
    truncated: scoped.truncated,
  }, scoped.commits);
}

module.exports = {
  ANALYTICS_FORMAT,
  buildAnalyticsIndex,
  createAnalyticsIndex,
  readRefsFingerprint,
  readRepositoryRevision,
};
