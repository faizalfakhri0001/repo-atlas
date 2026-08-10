// Synthetic repository served when the app runs in a plain browser (no Electron
// bridge). Lets the UI be previewed and demoed without touching a real repo.

import { isHashLike, parseSearchQuery } from "../features/search/query-parser.js";
import { groupSearchResults, scoreFile, scoreText } from "../features/search/search-scoring.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AUTHORS = [
  { name: "Aisyah Putri", email: "aisyah@acme.dev" },
  { name: "Bagus Wicaksono", email: "bagus@acme.dev" },
  { name: "Chandra Lie", email: "chandra@acme.dev" },
  { name: "Dewi Lestari", email: "dewi@acme.dev" },
];

const FILE_POOL = [
  "src/app.jsx",
  "src/lib/session.js",
  "src/lib/api-client.js",
  "src/components/nav.jsx",
  "src/components/table.jsx",
  "src/api/payments.js",
  "src/api/orders.js",
  "server/router.js",
  "server/middleware/auth.js",
  "styles/theme.css",
  "docs/setup.md",
  "package.json",
];

const SUBJECT_POOL = [
  "Fix session refresh race",
  "Add pagination to orders table",
  "Refactor auth middleware",
  "Improve error messages",
  "Update dependencies",
  "Add payment webhooks",
  "Tune database indexes",
  "Polish empty states",
  "Handle timezone offsets",
  "Add retry with backoff",
  "Extract shared table component",
  "Document local setup",
  "Cache session lookups",
  "Validate webhook signatures",
  "Split router by domain",
];

function hashOf(rand) {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 40; i++) out += chars[Math.floor(rand() * 16)];
  return out;
}

function buildDataset() {
  const rand = mulberry32(20260726);
  const start = Date.now() - 200 * 24 * 3600 * 1000;
  let clock = start;
  const commits = [];
  const byHash = new Map();

  const commitOn = (parents, subject, authorIndex, refs = []) => {
    clock += (4 + rand() * 30) * 3600 * 1000;
    const author = AUTHORS[authorIndex % AUTHORS.length];
    const hash = hashOf(rand);
    const commit = {
      hash,
      shortHash: hash.slice(0, 8),
      parents: parents.filter(Boolean),
      refs,
      author: author.name,
      email: author.email,
      date: new Date(clock).toISOString(),
      subject,
      timestamp: clock,
    };
    commits.push(commit);
    byHash.set(hash, commit);
    return hash;
  };

  const subject = () => SUBJECT_POOL[Math.floor(rand() * SUBJECT_POOL.length)];

  // trunk
  let main = commitOn([], "Initial commit", 0);
  const trunk = [main];
  const branchTips = new Map();
  const tags = [];
  let release = 0;

  const growMain = (count) => {
    for (let i = 0; i < count; i++) {
      main = commitOn([main], subject(), Math.floor(rand() * AUTHORS.length));
      trunk.push(main);
    }
  };

  const feature = (name, forkBack, length, { merge = true, authorIndex = 1 } = {}) => {
    const fork = trunk[Math.max(0, trunk.length - 1 - forkBack)];
    let tip = fork;
    for (let i = 0; i < length; i++) {
      tip = commitOn([tip], `${subject()} (${name.split("/").pop()})`, authorIndex + i);
    }
    if (merge) {
      main = commitOn([main, tip], `Merge branch '${name}'`, 0);
      trunk.push(main);
    } else {
      branchTips.set(name, tip);
    }
    return tip;
  };

  growMain(6);
  feature("feature/checkout", 2, 3);
  growMain(3);
  tags.push({ name: `v0.${++release}.0`, hash: main });
  feature("feature/search", 1, 4, { authorIndex: 2 });
  growMain(4);
  feature("fix/session-leak", 2, 2, { authorIndex: 3 });
  growMain(2);
  tags.push({ name: `v0.${++release}.0`, hash: main });
  feature("feature/payments", 3, 5, { merge: false, authorIndex: 1 });
  growMain(3);
  feature("feature/reports", 1, 3, { authorIndex: 2 });
  growMain(2);
  feature("fix/timezone", 0, 2, { merge: false, authorIndex: 3 });
  growMain(2);
  tags.push({ name: `v0.${++release}.0`, hash: main });
  feature("feature/notifications", 2, 4, { merge: false, authorIndex: 0 });
  growMain(3);

  // decorate refs
  const decorate = (hash, label) => {
    const commit = byHash.get(hash);
    if (commit && !commit.refs.includes(label)) commit.refs.push(label);
  };

  decorate(main, "HEAD -> main");
  decorate(main, "origin/main");
  const originBehind = trunk[trunk.length - 3];
  decorate(originBehind, "origin/release");
  for (const [name, tip] of branchTips) {
    decorate(tip, name);
    if (name !== "fix/timezone") decorate(tip, `origin/${name}`);
  }
  for (const tag of tags) decorate(tag.hash, `tag: ${tag.name}`);

  // Shift the whole timeline so the newest commit landed ~2 hours ago.
  const newest = Math.max(...commits.map((commit) => commit.timestamp));
  const shift = Date.now() - 2 * 3600 * 1000 - newest;
  for (const commit of commits) {
    commit.timestamp += shift;
    commit.date = new Date(commit.timestamp).toISOString();
  }

  commits.sort((a, b) => b.timestamp - a.timestamp);

  return { commits, byHash, main, branchTips, tags, trunk };
}

function reachableFrom(byHash, tips) {
  const seen = new Set();
  const queue = [...tips];
  while (queue.length > 0) {
    const hash = queue.pop();
    if (!hash || seen.has(hash)) continue;
    seen.add(hash);
    const commit = byHash.get(hash);
    if (commit) queue.push(...commit.parents);
  }
  return seen;
}

function filesForCommit(commit) {
  const rand = mulberry32(parseInt(commit.hash.slice(0, 8), 16));
  const count = commit.parents.length === 0 ? 4 : 1 + Math.floor(rand() * 4);
  const files = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    const filePath = FILE_POOL[Math.floor(rand() * FILE_POOL.length)];
    if (used.has(filePath)) continue;
    used.add(filePath);
    const roll = rand();
    const status = commit.parents.length === 0 ? "A" : roll < 0.62 ? "M" : roll < 0.78 ? "A" : roll < 0.9 ? "D" : "R";
    files.push({
      path: filePath,
      oldPath: status === "R" ? filePath.replace(/(\.\w+)$/, ".old$1") : "",
      status,
      score: status === "R" ? 92 : null,
      additions: status === "D" ? 0 : 1 + Math.floor(rand() * 40),
      deletions: status === "A" ? 0 : Math.floor(rand() * 24),
      binary: false,
    });
  }
  return files;
}

function demoFileEntry(filePath, tracked = true) {
  const name = filePath.split("/").pop();
  const dot = name.lastIndexOf(".");
  return {
    path: filePath,
    name,
    extension: dot > 0 ? name.slice(dot + 1).toLowerCase() : "",
    tracked,
    size: null,
  };
}

const DEMO_FILE_CONTENT = {
  "src/app.jsx": `import { AppShell } from "./app-shell";\n\nexport function App() {\n  return <AppShell />;\n}\n`,
  "src/lib/session.js": `export function createSession(repository) {\n  return { repository, openedAt: Date.now() };\n}\n`,
  "docs/setup.md": `# Acme Storefront\n\nInstall dependencies with npm install, then run npm run dev.\n`,
  "notes/todo.md": `# Follow-up\n\n- Add release notes for the next checkout update.\n- Verify the payment webhook retry policy.\n`,
};

const DEMO_LANGUAGE_BY_EXTENSION = {
  css: "CSS",
  html: "HTML",
  js: "JavaScript",
  jsx: "JavaScript",
  json: "JSON",
  md: "Markdown",
  py: "Python",
  ts: "TypeScript",
  tsx: "TypeScript",
  yaml: "YAML",
  yml: "YAML",
};

function demoFileLanguage(filePath) {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  return DEMO_LANGUAGE_BY_EXTENSION[extension] ?? null;
}

function fakeDiff(filePath, additions, deletions) {
  const stem = filePath.split("/").pop().replace(/\W/g, "_");
  const added = Math.max(1, Math.min(additions, 12));
  const removed = Math.min(deletions, 8);
  const context = [
    `export function ${stem}(input) {`,
    `  const state = normalize(input);`,
    `  return state;`,
    `}`,
  ];
  const lines = [
    `diff --git a/${filePath} b/${filePath}`,
    `index 3f1a2b1..9c4d7e2 100644`,
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -12,${4 + removed} +12,${4 + added} @@ export function ${stem}(input) {`,
  ];
  lines.push(` ${context[0]}`);
  lines.push(` ${context[1]}`);
  for (let i = 0; i < removed; i++) lines.push(`-  legacyStep${i + 1}(state, { strict: false });`);
  for (let i = 0; i < added; i++) lines.push(`+  applyStep${i + 1}(state, { strict: true, retries: ${i % 3} });`);
  lines.push(` ${context[2]}`);
  lines.push(` ${context[3]}`);
  return lines.join("\n");
}

function createDemoAnalyticsSummary(commits, mainTip, options = {}) {
  const maxCommits = Math.min(50_000, Math.max(1, Math.floor(Number(options.maxCommits) || 10_000)));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(options.limit) || 100)));
  const selected = commits.slice(0, maxCommits);
  const files = new Map();
  const authors = new Map();
  let additions = 0;
  let deletions = 0;

  const later = (current, candidate) => (!current || candidate > current ? candidate : current);
  const earlier = (current, candidate) => (!current || candidate < current ? candidate : current);

  for (const commit of selected) {
    const name = String(commit.author ?? "").trim() || "Unknown author";
    const email = String(commit.email ?? "").trim().toLowerCase();
    const key = email ? `email:${email}` : `name:${name.toLowerCase()}`;
    let author = authors.get(key);
    if (!author) {
      author = { key, name, email, aliases: new Set(), commits: 0, additions: 0, deletions: 0, churn: 0, lastChangedAt: null };
      authors.set(key, author);
    }
    author.aliases.add(name);
    author.commits += 1;
    author.lastChangedAt = later(author.lastChangedAt, commit.date);

    for (const change of filesForCommit(commit)) {
      let file = files.get(change.path);
      if (!file) {
        file = { path: change.path, commits: 0, additions: 0, deletions: 0, churn: 0, firstSeenAt: null, lastChangedAt: null, authors: new Map() };
        files.set(change.path, file);
      }
      file.commits += 1;
      file.additions += change.additions;
      file.deletions += change.deletions;
      file.churn += change.additions + change.deletions;
      file.firstSeenAt = earlier(file.firstSeenAt, commit.date);
      file.lastChangedAt = later(file.lastChangedAt, commit.date);
      let fileAuthor = file.authors.get(key);
      if (!fileAuthor) {
        fileAuthor = { key, name, email, commits: 0, additions: 0, deletions: 0, churn: 0, lastChangedAt: null };
        file.authors.set(key, fileAuthor);
      }
      fileAuthor.commits += 1;
      fileAuthor.additions += change.additions;
      fileAuthor.deletions += change.deletions;
      fileAuthor.churn += change.additions + change.deletions;
      fileAuthor.lastChangedAt = later(fileAuthor.lastChangedAt, commit.date);
      author.additions += change.additions;
      author.deletions += change.deletions;
      author.churn += change.additions + change.deletions;
      additions += change.additions;
      deletions += change.deletions;
    }
  }

  const sortValues = (left, right) => right.churn - left.churn || right.commits - left.commits || left.path?.localeCompare(right.path ?? "") || left.name?.localeCompare(right.name ?? "");
  const serializedFiles = [...files.values()].sort(sortValues).slice(0, limit).map((file) => ({
    ...file,
    authors: [...file.authors.values()].sort(sortValues).slice(0, limit),
  }));
  const serializedAuthors = [...authors.values()].sort(sortValues).slice(0, limit).map((author) => ({ ...author, aliases: [...author.aliases] }));

  return {
    repositoryKey: "/demo/acme-storefront",
    head: mainTip,
    generatedAt: new Date().toISOString(),
    scope: {
      maxCommits,
      maxFilesPerCommit: 5_000,
      processedCommits: selected.length,
      truncated: commits.length > maxCommits,
      filesTruncated: false,
    },
    totals: { commits: selected.length, files: files.size, additions, deletions },
    files: serializedFiles,
    authors: serializedAuthors,
  };
}

export function createDemoApi() {
  const dataset = buildDataset();
  const { commits, byHash, branchTips, tags } = dataset;
  const mainTip = dataset.main;
  const demoFiles = [
    ...FILE_POOL.map((filePath) => demoFileEntry(filePath)),
    demoFileEntry("notes/todo.md", false),
    demoFileEntry("assets/logo.bin"),
    demoFileEntry("logs/output.txt"),
  ];
  const historyFor = (filePath) => {
    const entries = [];
    for (const commit of commits) {
      const file = filesForCommit(commit).find((candidate) => candidate.path === filePath);
      if (!file) continue;
      entries.push({
        hash: commit.hash,
        shortHash: commit.shortHash,
        parentHash: commit.parents[0] ?? null,
        subject: commit.subject,
        author: { name: commit.author, email: commit.email },
        date: commit.date,
        status: file.status,
        path: file.path,
        ...(file.oldPath ? { oldPath: file.oldPath } : {}),
      });
    }
    return entries.length > 0
      ? entries
      : commits.slice(0, 8).map((commit, index) => ({
          hash: commit.hash,
          shortHash: commit.shortHash,
          parentHash: commit.parents[0] ?? null,
          subject: commit.subject,
          author: { name: commit.author, email: commit.email },
          date: commit.date,
          status: index === 0 ? "A" : "M",
          path: filePath,
        }));
  };

  const localBranches = [
    { name: "main", tip: mainTip },
    ...[...branchTips.entries()].map(([name, tip]) => ({ name, tip })),
  ];

  const tipByRef = new Map();
  for (const branch of localBranches) {
    tipByRef.set(branch.name, branch.tip);
    tipByRef.set(`origin/${branch.name}`, branch.tip);
  }
  tipByRef.set("origin/release", commits.find((c) => c.refs.includes("origin/release"))?.hash ?? mainTip);
  tipByRef.set("HEAD", mainTip);
  for (const tag of tags) tipByRef.set(tag.name, tag.hash);

  const resolveTip = (ref) => {
    if (tipByRef.has(ref)) return tipByRef.get(ref);
    if (byHash.has(ref)) return ref;
    const prefix = commits.find((c) => c.hash.startsWith(ref));
    return prefix?.hash ?? null;
  };

  const branchRows = () => {
    const rows = [];
    for (const branch of localBranches) {
      const tip = byHash.get(branch.tip);
      rows.push({
        ref: `refs/heads/${branch.name}`,
        name: branch.name,
        hash: branch.tip,
        shortHash: branch.tip.slice(0, 8),
        upstream: branch.name === "fix/timezone" ? "" : `origin/${branch.name}`,
        ahead: branch.name === "main" ? 2 : 0,
        behind: branch.name === "feature/payments" ? 3 : 0,
        gone: false,
        date: tip.date,
        author: tip.author,
        subject: tip.subject,
        remote: false,
        current: branch.name === "main",
      });
    }
    for (const branch of localBranches) {
      if (branch.name === "fix/timezone") continue;
      const tip = byHash.get(branch.tip);
      rows.push({
        ref: `refs/remotes/origin/${branch.name}`,
        name: `origin/${branch.name}`,
        hash: branch.tip,
        shortHash: branch.tip.slice(0, 8),
        upstream: "",
        ahead: 0,
        behind: 0,
        gone: false,
        date: tip.date,
        author: tip.author,
        subject: tip.subject,
        remote: true,
        current: false,
      });
    }
    return rows;
  };

  const createDemoBranchIntelligence = ({ defaultBranch: requestedDefault } = {}) => {
    const defaultRef = requestedDefault || "main";
    const defaultHash = resolveTip(defaultRef) || mainTip;
    const defaultName = defaultRef.replace(/^origin\//, "");
    const defaultReachable = reachableFrom(byHash, [defaultHash]);
    const now = Date.now();
    const rows = branchRows().map((branch) => {
      const ageDays = branch.date ? Math.max(0, Math.floor((now - new Date(branch.date).getTime()) / (24 * 60 * 60 * 1000))) : null;
      if (branch.remote) {
        return {
          ...branch,
          upstream: null,
          aheadOfUpstream: 0,
          behindUpstream: 0,
          goneUpstream: false,
          defaultBranch: defaultName,
          aheadOfDefault: null,
          behindDefault: null,
          mergeBase: null,
          mergedIntoDefault: false,
          lastCommitAt: branch.date,
          ageDays,
          stale: false,
          veryStale: false,
          status: "healthy",
          analyzed: false,
        };
      }

      const branchReachable = reachableFrom(byHash, [branch.hash]);
      const aheadOfDefault = [...branchReachable].filter((hash) => !defaultReachable.has(hash)).length;
      const behindDefault = [...defaultReachable].filter((hash) => !branchReachable.has(hash)).length;
      const mergeBase = commits.find((commit) => defaultReachable.has(commit.hash) && branchReachable.has(commit.hash))?.hash ?? null;
      const mergedIntoDefault = branch.name !== defaultName && defaultReachable.has(branch.hash);
      const stale = ageDays !== null && ageDays >= 90;
      const veryStale = ageDays !== null && ageDays >= 180;
      const status = branch.current
        ? "current"
        : branch.gone
          ? "gone"
          : mergedIntoDefault
            ? "merged"
            : stale
              ? "stale"
              : aheadOfDefault > 0 && behindDefault > 0
                ? "diverged"
                : behindDefault > 0
                  ? "behind"
                  : aheadOfDefault > 0
                    ? "ahead"
                    : "healthy";
      return {
        ...branch,
        aheadOfUpstream: branch.ahead,
        behindUpstream: branch.behind,
        goneUpstream: branch.gone,
        defaultBranch: defaultName,
        aheadOfDefault,
        behindDefault,
        mergeBase,
        mergedIntoDefault,
        lastCommitAt: branch.date,
        ageDays,
        stale,
        veryStale,
        status,
        analyzed: true,
      };
    });

    const localCount = rows.filter((branch) => !branch.remote).length;
    return {
      defaultBranch: defaultName,
      defaultBranchRef: defaultRef,
      defaultBranchSource: requestedDefault ? "explicit" : "remote",
      defaultBranchHash: defaultHash,
      currentBranch: "main",
      scope: {
        totalLocal: localCount,
        analyzedLocal: Math.min(localCount, 500),
        omittedLocal: Math.max(localCount - 500, 0),
        limit: 500,
        concurrency: 4,
        truncated: localCount > 500,
      },
      branches: rows,
    };
  };

  const status = {
    branch: "main",
    oid: mainTip,
    upstream: "origin/main",
    ahead: 2,
    behind: 0,
    files: [
      { kind: "changed", index: "M", worktree: ".", path: "src/lib/session.js" },
      { kind: "changed", index: ".", worktree: "M", path: "src/components/table.jsx" },
      { kind: "renamed", index: "R", worktree: ".", path: "src/lib/api-client.js" },
      { kind: "untracked", index: "?", worktree: "?", path: "notes/todo.md" },
    ],
  };

  const scanData = () => ({
    scannedAt: new Date().toISOString(),
    repository: {
      selectedPath: "/demo/acme-storefront",
      rootPath: "/demo/acme-storefront",
      gitDir: "/demo/acme-storefront/.git",
      name: "acme-storefront",
      currentBranch: "main",
      defaultBranch: "main",
      defaultBranchSource: "remote",
      head: mainTip,
      shortHead: mainTip.slice(0, 8),
      upstream: "origin/main",
      ahead: 2,
      behind: 0,
      gitVersion: "git version 2.46.2 (demo)",
      dirty: true,
      totalCommits: commits.length,
    },
    state: { cherryPick: false, merge: false, rebase: false, revert: false, bisect: false, current: null, inProgress: false },
    status,
    branches: branchRows(),
    commits: commits.map(({ timestamp, ...commit }) => commit),
    worktrees: [
      { path: "/demo/acme-storefront", head: mainTip, branch: "main", bare: false, detached: false, locked: false, prunable: false, reason: "" },
      { path: "/demo/acme-storefront-hotfix", head: resolveTip("fix/timezone"), branch: "fix/timezone", bare: false, detached: false, locked: true, prunable: false, reason: "hotfix in progress" },
    ],
    submodules: [
      { name: "design-tokens", path: "vendor/design-tokens", url: "https://example.com/acme/design-tokens.git", hash: commits[10].hash, shortHash: commits[10].shortHash, description: "heads/main", state: "clean" },
    ],
    remotes: [{ name: "origin", fetchUrl: "https://example.com/acme/storefront.git", pushUrl: "https://example.com/acme/storefront.git" }],
    tags: tags.map((tag) => ({ name: tag.name, hash: tag.hash, shortHash: tag.hash.slice(0, 8), date: byHash.get(tag.hash).date, subject: byHash.get(tag.hash).subject })).reverse(),
    stashes: [{ ref: "stash@{0}", hash: commits[4].hash, date: commits[4].date, subject: "WIP on main: experiment with cache warmup", shortHash: commits[4].shortHash }],
    contributors: AUTHORS.map((author, index) => ({ name: author.name, email: author.email, commits: 48 - index * 9 })),
    countObjects: { count: 132, "in-pack": 2481, size: 512, "size-pack": 3921 },
  });

  const searchDemoRepository = ({ query: rawQuery = "", types, limit = 100 } = {}) => {
    const query = parseSearchQuery(rawQuery);
    const value = query.text || query.path || query.branch || query.author || "";
    if (!value) return { query: query.raw, errors: query.errors, durationMs: 0, results: [], revision: { head: mainTip, scannedAt: new Date().toISOString() } };
    const selectedTypes = query.type && query.type !== "all"
      ? [query.type]
      : Array.isArray(types) && types.length > 0
        ? types
        : ["file", "commit", "branch", "tag", "author"];
    const inDateRange = (date) => {
      const day = String(date ?? "").slice(0, 10);
      return (!query.after || day >= query.after) && (!query.before || day <= query.before);
    };
    const results = [];

    if (selectedTypes.includes("file")) {
      for (const file of demoFiles) {
        if (query.path && !file.path.toLowerCase().includes(query.path.toLowerCase())) continue;
        const score = scoreFile(file, value);
        if (score > 0) results.push({ type: "file", ...file, score });
      }
    }
    if (selectedTypes.includes("commit")) {
      for (const commit of commits) {
        if (!inDateRange(commit.date)) continue;
        const score = Math.max(scoreText(commit.subject, value), scoreText(commit.hash, value), scoreText(commit.author, value));
        if (score > 0) {
          results.push({
            type: "commit",
            hash: commit.hash,
            shortHash: commit.shortHash,
            subject: commit.subject,
            author: commit.author,
            email: commit.email,
            date: commit.date,
            refs: commit.refs,
            score,
          });
        }
        if (isHashLike(query.text) && commit.hash.startsWith(query.text.toLowerCase())) {
          results.push({
            type: "commit",
            hash: commit.hash,
            shortHash: commit.shortHash,
            subject: commit.subject,
            author: commit.author,
            email: commit.email,
            date: commit.date,
            refs: commit.refs,
            score: 1300,
          });
        }
      }
    }
    if (selectedTypes.includes("branch")) {
      for (const branch of branchRows()) {
        if (query.branch && !branch.name.toLowerCase().includes(query.branch.toLowerCase())) continue;
        if (!inDateRange(branch.date)) continue;
        const score = scoreText(branch.name, value);
        if (score > 0) results.push({ type: "branch", name: branch.name, hash: branch.hash, current: branch.current, remote: branch.remote, date: branch.date, score });
      }
    }
    if (selectedTypes.includes("tag")) {
      for (const tag of tags) {
        const commit = byHash.get(tag.hash);
        if (!inDateRange(commit?.date)) continue;
        const score = scoreText(tag.name, value);
        if (score > 0) results.push({ type: "tag", name: tag.name, hash: tag.hash, date: commit?.date, score });
      }
    }
    if (selectedTypes.includes("author")) {
      for (const author of AUTHORS) {
        const contributor = scanData().contributors.find((candidate) => candidate.email === author.email);
        const score = Math.max(scoreText(author.name, value), scoreText(author.email, value));
        if (score > 0) results.push({ type: "author", name: author.name, email: author.email, commits: contributor?.commits ?? 0, score });
      }
    }

    const grouped = groupSearchResults(results, { limitPerType: 20, limit: Math.min(Math.max(Number(limit) || 100, 1), 100) });
    return { query: query.raw, errors: query.errors, durationMs: 0, results: grouped.all, revision: { head: mainTip, scannedAt: new Date().toISOString() } };
  };

  const ok = (data) => Promise.resolve({ ok: true, data });
  const demoWriteError = () =>
    Promise.resolve({
      ok: false,
      error: {
        message: "Demo mode is read-only — run the desktop app on a real repository to execute this.",
        code: "DEMO_MODE",
        details: "",
      },
    });

  return {
    platform: "demo",
    openRepository: () => Promise.resolve("/demo/acme-storefront"),
    revealRepository: () => Promise.resolve({ ok: true }),
    revealRepositoryFile: () => Promise.resolve({ ok: true }),
    scanRepository: () => ok(scanData()),
    analyticsSummary: (payload = {}) => ok(createDemoAnalyticsSummary(commits, mainTip, payload)),
    branchIntelligence: (payload = {}) => ok(createDemoBranchIntelligence(payload)),
    repositorySearch: (payload) => ok(searchDemoRepository(payload)),
    listRepositoryFiles: () => ok(demoFiles),
    readRepositoryFile: ({ path: filePath } = {}) => {
      const file = demoFiles.find((entry) => entry.path === filePath);
      if (!file) return Promise.resolve({ ok: false, error: { message: "Unknown demo file.", code: "PATH_NOT_FOUND" } });
      if (filePath === "assets/logo.bin") {
        return ok({ path: filePath, text: null, binary: true, truncated: false, size: 18_432, language: null });
      }
      const truncated = filePath === "logs/output.txt";
      const text = DEMO_FILE_CONTENT[filePath] ?? `// Demo content for ${filePath}\n\nexport const ready = true;\n`;
      return ok({
        path: filePath,
        text,
        binary: false,
        truncated,
        size: truncated ? 2 * 1024 * 1024 : text.length,
        language: demoFileLanguage(filePath),
      });
    },
    fileHistory: ({ path: filePath, limit = 200, skip = 0 } = {}) => {
      const knownFile = demoFiles.some((file) => file.path === filePath);
      if (!knownFile) return Promise.resolve({ ok: false, error: { message: "Unknown demo file.", code: "PATH_NOT_FOUND" } });
      const entries = historyFor(filePath);
      const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);
      const safeSkip = Math.max(Number(skip) || 0, 0);
      return ok({
        currentPath: filePath,
        entries: entries.slice(safeSkip, safeSkip + safeLimit),
        hasMore: safeSkip + safeLimit < entries.length,
      });
    },
    readFileAtRevision: ({ hash, path: filePath } = {}) => {
      if (typeof hash !== "string" || !hash.trim() || typeof filePath !== "string" || !filePath) {
        return Promise.resolve({ ok: false, error: { message: "A revision hash and file path are required.", code: "INVALID_ARGUMENT" } });
      }
      const file = demoFiles.find((entry) => entry.path === filePath);
      const commit = byHash.get(resolveTip(hash));
      if (!commit) return Promise.resolve({ ok: false, error: { message: "Unknown commit.", code: "UNKNOWN_REF" } });
      if (!file) return Promise.resolve({ ok: false, error: { message: "Unknown demo file.", code: "PATH_NOT_FOUND" } });
      if (filePath === "assets/logo.bin") {
        return ok({ hash: commit.hash, path: filePath, text: null, binary: true, truncated: false, size: 18_432, language: null });
      }
      const baseText = DEMO_FILE_CONTENT[filePath] ?? `// Demo content for ${filePath}\n\nexport const ready = true;\n`;
      const text = `${baseText}\n// ${commit.subject}\n`;
      return ok({ hash: commit.hash, path: filePath, text, binary: false, truncated: false, size: text.length, language: demoFileLanguage(filePath) });
    },

    listCommits: ({ refs, order, limit = 1000, skip = 0 } = {}) => {
      let pool = commits;
      if (Array.isArray(refs) && refs.length > 0) {
        const tips = refs.map(resolveTip).filter(Boolean);
        const reachable = reachableFrom(byHash, tips);
        pool = commits.filter((commit) => reachable.has(commit.hash));
      }
      if (order === "date") pool = [...pool].sort((a, b) => b.timestamp - a.timestamp);
      const slice = pool.slice(skip, skip + limit).map(({ timestamp, ...commit }) => commit);
      return ok({ commits: slice, total: pool.length, limit, skip });
    },

    commitDetails: ({ hash } = {}) => {
      const commit = byHash.get(resolveTip(hash));
      if (!commit) return Promise.resolve({ ok: false, error: { message: "Unknown commit.", code: "UNKNOWN_REF" } });
      const files = filesForCommit(commit);
      return ok({
        hash: commit.hash,
        shortHash: commit.shortHash,
        parents: commit.parents,
        refs: commit.refs,
        author: { name: commit.author, email: commit.email, date: commit.date },
        committer: { name: commit.author, email: commit.email, date: commit.date },
        signature: parseInt(commit.hash[0], 16) % 3 === 0 ? "G" : "",
        subject: commit.subject,
        body: commit.subject.startsWith("Merge") ? "" : "Motivation:\n- keep the demo interesting\n- show a full commit body",
        isMerge: commit.parents.length > 1,
        files,
        additions: files.reduce((sum, file) => sum + file.additions, 0),
        deletions: files.reduce((sum, file) => sum + file.deletions, 0),
      });
    },

    fileDiff: ({ path: filePath } = {}) => {
      const rand = mulberry32(filePath ? filePath.length * 2654435761 : 1);
      return ok({ diff: fakeDiff(filePath ?? "src/app.jsx", 4 + Math.floor(rand() * 10), 2 + Math.floor(rand() * 6)), truncated: false, binary: false });
    },

    compareRefs: ({ base, head } = {}) => {
      const baseTip = resolveTip(base);
      const headTip = resolveTip(head);
      if (!baseTip || !headTip) {
        return Promise.resolve({ ok: false, error: { message: `Unknown ref "${!baseTip ? base : head}".`, code: "UNKNOWN_REF" } });
      }
      const baseSet = reachableFrom(byHash, [baseTip]);
      const headSet = reachableFrom(byHash, [headTip]);
      const aheadCommits = commits.filter((commit) => headSet.has(commit.hash) && !baseSet.has(commit.hash));
      const behind = commits.filter((commit) => baseSet.has(commit.hash) && !headSet.has(commit.hash)).length;
      const mergeBase = commits.find((commit) => baseSet.has(commit.hash) && headSet.has(commit.hash))?.hash ?? null;

      const fileMap = new Map();
      for (const commit of aheadCommits) {
        for (const file of filesForCommit(commit)) {
          const existing = fileMap.get(file.path);
          if (existing) {
            existing.additions += file.additions;
            existing.deletions += file.deletions;
          } else {
            fileMap.set(file.path, { ...file, status: file.status === "R" ? "M" : file.status });
          }
        }
      }
      const files = [...fileMap.values()];
      const conflicts =
        head.includes("payments") || base.includes("payments")
          ? { status: "conflicts", files: ["src/api/payments.js", "server/router.js"] }
          : { status: "clean", files: [] };

      return ok({
        base: { ref: base, hash: baseTip },
        head: { ref: head, hash: headTip },
        mergeBase,
        unrelatedHistories: mergeBase === null,
        identical: baseTip === headTip,
        headIsAncestorOfBase: aheadCommits.length === 0 && baseTip !== headTip,
        fastForwardPossible: behind === 0 && aheadCommits.length > 0,
        ahead: aheadCommits.length,
        behind,
        commits: aheadCommits.map(({ timestamp, ...commit }) => commit),
        files,
        additions: files.reduce((sum, file) => sum + file.additions, 0),
        deletions: files.reduce((sum, file) => sum + file.deletions, 0),
        conflicts,
      });
    },

    cherryPickPreview: ({ hashes } = {}) => {
      const ordered = (hashes ?? [])
        .map((hash) => byHash.get(resolveTip(hash)))
        .filter(Boolean)
        .sort((a, b) => a.timestamp - b.timestamp);
      return ok({
        targetBranch: "main",
        detachedHead: false,
        workingTree: { clean: false, trackedChanges: 3, untracked: 1 },
        state: { inProgress: false, current: null, cherryPick: false },
        blocked: true,
        commits: ordered.map((commit) => ({
          hash: commit.hash,
          shortHash: commit.shortHash,
          subject: commit.subject,
          timestamp: commit.timestamp,
          prediction: filesForCommit(commit).some((file) => file.path === "src/api/payments.js") ? "conflicts" : "clean",
          conflictFiles: filesForCommit(commit).some((file) => file.path === "src/api/payments.js") ? ["src/api/payments.js"] : [],
        })),
      });
    },

    cherryPickExecute: demoWriteError,
    sequencerAction: demoWriteError,
  };
}
