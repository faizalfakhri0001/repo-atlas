// Synthetic repository served when the app runs in a plain browser (no Electron
// bridge). Lets the UI be previewed and demoed without touching a real repo.

import { isHashLike, parseSearchQuery } from "../features/search/query-parser.js";
import { groupSearchResults, scoreFile, scoreText } from "../features/search/search-scoring.js";
import { aggregateActivity } from "../features/activity/activity-model.js";

const DEMO_SAVED_VIEWS_STORAGE_KEY = "repo-atlas-demo-metadata-v1";
const DEMO_LOCAL_METADATA_STORAGE_KEY = "repo-atlas-demo-local-metadata-v1";
const DEMO_SAVED_VIEW_TYPES = new Set(["commits", "files", "branches", "compare", "hotspots", "ownership", "activity", "reflog", "search"]);

function getDemoStorage() {
  try {
    return typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

function cloneDemoValue(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function readDemoSavedViews(repositoryPath) {
  const storage = getDemoStorage();
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(DEMO_SAVED_VIEWS_STORAGE_KEY) || "{}");
    if (!Array.isArray(parsed?.[repositoryPath])) return [];
    return parsed[repositoryPath]
      .slice(0, 1000)
      .filter((view) => view && typeof view.id === "string" && typeof view.name === "string" && DEMO_SAVED_VIEW_TYPES.has(view.viewType) && view.config && typeof view.config === "object" && !Array.isArray(view.config))
      .map((view) => ({
        ...view,
        name: view.name.trim().slice(0, 80),
        config: cloneDemoValue(view.config) ?? {},
        pinned: Boolean(view.pinned),
        configVersion: Number(view.configVersion) || 1,
      }))
      .filter((view) => view.name.length > 0);
  } catch {
    return [];
  }
}

function writeDemoSavedViews(repositoryPath, savedViews) {
  const storage = getDemoStorage();
  if (!storage) return;
  try {
    const parsed = JSON.parse(storage.getItem(DEMO_SAVED_VIEWS_STORAGE_KEY) || "{}");
    parsed[repositoryPath] = savedViews.slice(0, 1000);
    storage.setItem(DEMO_SAVED_VIEWS_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Demo persistence is best effort; malformed browser storage must not break the preview.
  }
}

function normalizeDemoBookmark(value) {
  if (!value || typeof value !== "object") return null;
  const commitHash = typeof value.commitHash === "string" ? value.commitHash.trim().toLowerCase() : "";
  if (!/^[0-9a-f]{7,64}$/.test(commitHash) || typeof value.id !== "string" || !value.id.trim()) return null;
  const label = typeof value.label === "string" && value.label.trim() ? value.label.trim().slice(0, 120) : null;
  const category = typeof value.category === "string" && value.category.trim() ? value.category.trim().slice(0, 60) : null;
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString();
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : createdAt;
  return { id: value.id.trim().slice(0, 200), commitHash, label, category, createdAt, updatedAt };
}

function normalizeDemoNote(value) {
  if (!value || typeof value !== "object" || value.targetType !== "commit") return null;
  const targetId = typeof value.targetId === "string" ? value.targetId.trim().toLowerCase() : "";
  if (!/^[0-9a-f]{7,64}$/.test(targetId) || typeof value.id !== "string" || !value.id.trim() || typeof value.body !== "string" || value.body.length > 10_000) return null;
  const title = typeof value.title === "string" && value.title.trim() ? value.title.trim().slice(0, 120) : undefined;
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString();
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : createdAt;
  return { id: value.id.trim().slice(0, 200), targetType: "commit", targetId, ...(title ? { title } : {}), body: value.body, createdAt, updatedAt };
}

function readDemoLocalMetadata(repositoryPath) {
  const storage = getDemoStorage();
  if (!storage) return { bookmarks: [], notes: [] };
  try {
    const parsed = JSON.parse(storage.getItem(DEMO_LOCAL_METADATA_STORAGE_KEY) || "{}");
    const entry = parsed?.[repositoryPath] ?? {};
    return {
      bookmarks: Array.isArray(entry.bookmarks) ? entry.bookmarks.slice(0, 1000).map(normalizeDemoBookmark).filter(Boolean) : [],
      notes: Array.isArray(entry.notes) ? entry.notes.slice(0, 1000).map(normalizeDemoNote).filter(Boolean) : [],
    };
  } catch {
    return { bookmarks: [], notes: [] };
  }
}

function writeDemoLocalMetadata(repositoryPath, metadata) {
  const storage = getDemoStorage();
  if (!storage) return;
  try {
    const parsed = JSON.parse(storage.getItem(DEMO_LOCAL_METADATA_STORAGE_KEY) || "{}");
    parsed[repositoryPath] = {
      bookmarks: metadata.bookmarks.slice(0, 1000),
      notes: metadata.notes.slice(0, 1000),
    };
    storage.setItem(DEMO_LOCAL_METADATA_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Demo persistence is best effort; malformed browser storage must not break the preview.
  }
}

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

function createDemoActivitySummary(commits, mainTip, options = {}) {
  const maxCommits = Math.min(50_000, Math.max(1, Math.floor(Number(options.maxCommits) || 10_000)));
  const selected = commits.slice(0, maxCommits).map((commit) => ({ ...commit, authoredAt: commit.date, files: filesForCommit(commit) }));
  return aggregateActivity(selected, {
    ...options,
    now: options.now ?? Date.now(),
    repositoryKey: "/demo/acme-storefront",
    head: mainTip,
    scope: {
      maxCommits,
      maxFilesPerCommit: 5_000,
      processedCommits: selected.length,
      truncated: commits.length > maxCommits,
      filesTruncated: false,
    },
  });
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

function demoGeneratedPath(filePath) {
  const normalized = String(filePath ?? "").replaceAll("\\", "/").toLowerCase();
  const segments = normalized.split("/").filter(Boolean);
  const basename = segments.at(-1) ?? "";
  return (
    segments.some((segment) => ["build", "coverage", "dist", "node_modules", "vendor"].includes(segment)) ||
    ["bun.lock", "bun.lockb", "cargo.lock", "composer.lock", "gemfile.lock", "go.sum", "npm-shrinkwrap.json", "package-lock.json", "pnpm-lock.yaml", "pnpm-lock.yml", "yarn.lock"].includes(basename) ||
    basename.endsWith(".lock") ||
    basename.endsWith(".lockb") ||
    basename.endsWith(".min.js") ||
    basename.endsWith(".min.css")
  );
}

function demoPercentile(values, value) {
  if (values.length === 0) return 0;
  if (values.length === 1) return 1;
  return Math.min(1, Math.max(0, values.filter((candidate) => candidate < value).length / (values.length - 1)));
}

function createDemoHotspotSummary(commits, mainTip, options = {}) {
  const summary = createDemoAnalyticsSummary(commits, mainTip, { ...options, limit: 100 });
  const includeGenerated = Boolean(options.includeGenerated);
  const pathPrefix = String(options.pathPrefix ?? "").trim().replace(/\/+$/, "");
  const matching = summary.files.filter((file) => !pathPrefix || file.path === pathPrefix || file.path.startsWith(`${pathPrefix}/`));
  const generatedFiles = matching.filter((file) => demoGeneratedPath(file.path));
  const eligible = includeGenerated ? matching : matching.filter((file) => !demoGeneratedPath(file.path));
  const now = Date.now();
  const commitCounts = eligible.map((file) => file.commits);
  const churnValues = eligible.map((file) => file.churn);
  const scored = eligible.map((file) => {
    const changedAt = Date.parse(file.lastChangedAt ?? "");
    const ageDays = Number.isFinite(changedAt) ? Math.max(0, (now - changedAt) / (24 * 60 * 60 * 1000)) : null;
    const recencyScore = ageDays == null ? 0 : Math.exp(-ageDays / 180);
    const commitFrequencyPercentile = demoPercentile(commitCounts, file.commits);
    const churnPercentile = demoPercentile(churnValues, file.churn);
    const hotspotScore = 0.45 * commitFrequencyPercentile + 0.35 * churnPercentile + 0.2 * recencyScore;
    const ownershipContributors = file.authors.map((author) => ({
      ...author,
      commitShare: file.commits > 0 ? author.commits / file.commits : 0,
      churnShare: file.churn > 0 ? author.churn / file.churn : 0,
    })).map((author) => ({
      ...author,
      ownershipScore: file.churn > 0 ? 0.4 * author.commitShare + 0.6 * author.churnShare : author.commitShare,
    })).sort((left, right) => right.ownershipScore - left.ownershipScore);
    const ownershipConcentration = ownershipContributors[0]?.ownershipScore ?? 0;
    return {
      ...file,
      commitCount: file.commits,
      commitFrequency: file.commits,
      authorCount: file.authors.length,
      ageDays,
      recencyScore,
      commitFrequencyPercentile,
      commitFrequencyScore: commitFrequencyPercentile,
      churnPercentile,
      churnScore: churnPercentile,
      hotspotScore,
      hotspotBand: hotspotScore >= 0.75 ? "High" : hotspotScore >= 0.4 ? "Medium" : "Low",
      ownershipScore: ownershipConcentration,
      ownershipConcentration,
      ownershipConcentrationLabel: ownershipConcentration >= 0.8 ? "Highly concentrated" : ownershipConcentration >= 0.6 ? "Moderately concentrated" : "Distributed",
      primaryContributor: ownershipContributors[0] ?? null,
      topContributors: ownershipContributors.slice(0, 10),
    };
  });
  const hotspotScores = scored.map((file) => file.hotspotScore);
  const limit = Math.min(1000, Math.max(1, Math.floor(Number(options.limit) || 100)));
  const files = scored
    .map((file) => ({ ...file, hotspotPercentile: demoPercentile(hotspotScores, file.hotspotScore) }))
    .sort((left, right) => right.hotspotScore - left.hotspotScore || right.churn - left.churn || left.path.localeCompare(right.path))
    .slice(0, limit);
  const reportTruncated = eligible.length > files.length;

  return {
    ...summary,
    metrics: { weights: { commitFrequency: 0.45, churn: 0.35, recency: 0.2 }, recencyWindowDays: 180, percentileRange: [0, 1] },
    filters: { includeGenerated, pathPrefix, generatedFiles: generatedFiles.length, excludedGeneratedFiles: includeGenerated ? 0 : generatedFiles.length },
    scope: {
      ...summary.scope,
      sourceTruncated: Boolean(summary.scope.truncated),
      totalFiles: summary.files.length,
      matchedFiles: matching.length,
      eligibleFiles: eligible.length,
      returnedFiles: files.length,
      reportLimit: limit,
      reportTruncated,
      truncated: Boolean(summary.scope.truncated || reportTruncated),
    },
    totals: { ...summary.totals, files: summary.files.length, eligibleFiles: eligible.length, returnedFiles: files.length },
    files,
  };
}

function demoOwnershipNode(filePath, type = "file") {
  return {
    path: filePath,
    type,
    totalCommits: 0,
    totalChurn: 0,
    additions: 0,
    deletions: 0,
    firstSeenAt: null,
    lastChangedAt: null,
    fileCount: type === "file" ? 1 : 0,
    contributors: new Map(),
  };
}

function demoOwnershipAuthor(commit) {
  const name = String(commit.author ?? "").trim() || "Unknown author";
  const email = String(commit.email ?? "").trim().toLowerCase();
  return { key: email ? `email:${email}` : `name:${name.toLowerCase()}`, name, email };
}

function addDemoOwnershipActivity(node, author, additions, deletions, date) {
  const existing = node.contributors.get(author.key) ?? { ...author, commits: 0, additions: 0, deletions: 0, churn: 0, lastChangedAt: null, recentActivity: 0 };
  existing.commits += 1;
  existing.additions += additions;
  existing.deletions += deletions;
  existing.churn += additions + deletions;
  existing.lastChangedAt = !existing.lastChangedAt || date > existing.lastChangedAt ? date : existing.lastChangedAt;
  node.contributors.set(author.key, existing);
}

function mergeDemoOwnershipNode(target, source) {
  target.totalCommits += source.totalCommits;
  target.totalChurn += source.totalChurn;
  target.additions += source.additions;
  target.deletions += source.deletions;
  target.fileCount += source.type === "file" ? 1 : source.fileCount;
  target.firstSeenAt = !target.firstSeenAt || (source.firstSeenAt && source.firstSeenAt < target.firstSeenAt) ? source.firstSeenAt : target.firstSeenAt;
  target.lastChangedAt = !target.lastChangedAt || source.lastChangedAt > target.lastChangedAt ? source.lastChangedAt : target.lastChangedAt;
  for (const contributor of source.contributors.values()) {
    const existing = target.contributors.get(contributor.key) ?? { ...contributor, commits: 0, additions: 0, deletions: 0, churn: 0 };
    existing.commits += contributor.commits;
    existing.additions += contributor.additions;
    existing.deletions += contributor.deletions;
    existing.churn += contributor.churn;
    existing.lastChangedAt = !existing.lastChangedAt || contributor.lastChangedAt > existing.lastChangedAt ? contributor.lastChangedAt : existing.lastChangedAt;
    target.contributors.set(contributor.key, existing);
  }
}

function demoOwnershipAncestors(filePath) {
  const result = [];
  const separator = filePath.lastIndexOf("/");
  let directory = separator < 0 ? "" : filePath.slice(0, separator);
  while (true) {
    result.push(directory);
    if (!directory) break;
    const separator = directory.lastIndexOf("/");
    directory = separator < 0 ? "" : directory.slice(0, separator);
  }
  return result;
}

function demoOwnershipParentPath(filePath) {
  const separator = filePath.lastIndexOf("/");
  return separator < 0 ? "" : filePath.slice(0, separator);
}

function scoreDemoOwnershipNode(node) {
  const totalCommits = node.totalCommits;
  const totalChurn = node.totalChurn;
  const contributors = [...node.contributors.values()].map((contributor) => {
    const commitShare = totalCommits > 0 ? contributor.commits / totalCommits : 0;
    const churnShare = totalChurn > 0 ? contributor.churn / totalChurn : 0;
    return {
      ...contributor,
      aliases: contributor.name ? [contributor.name] : [],
      commitShare,
      churnShare,
      ownershipScore: totalChurn > 0 ? 0.4 * commitShare + 0.6 * churnShare : commitShare,
    };
  }).sort((left, right) => right.ownershipScore - left.ownershipScore || right.churn - left.churn || left.name.localeCompare(right.name));
  const top1Share = contributors[0]?.ownershipScore ?? 0;
  const top2Share = contributors.slice(0, 2).reduce((sum, contributor) => sum + contributor.ownershipScore, 0);
  return {
    ...node,
    name: node.path ? node.path.split("/").pop() : "Repository",
    primaryContributor: contributors[0] ?? null,
    topContributors: contributors.slice(0, 10),
    top1Share,
    top2Share,
    concentration: top1Share,
    concentrationLabel: top1Share >= 0.8 ? "Highly concentrated" : top1Share >= 0.6 ? "Moderately concentrated" : "Distributed",
  };
}

function serializeDemoOwnershipNode(node) {
  return {
    path: node.path,
    name: node.name,
    type: node.type,
    totalCommits: node.totalCommits,
    totalChurn: node.totalChurn,
    additions: node.additions,
    deletions: node.deletions,
    fileCount: node.fileCount,
    firstSeenAt: node.firstSeenAt,
    lastChangedAt: node.lastChangedAt,
    primaryContributor: node.primaryContributor,
    topContributors: node.topContributors,
    top1Share: node.top1Share,
    top2Share: node.top2Share,
    concentration: node.concentration,
    concentrationLabel: node.concentrationLabel,
  };
}

function createDemoOwnershipSummary(commits, mainTip, options = {}) {
  const period = options.period === "12m" ? "12m" : "all";
  const maxCommits = Math.min(50_000, Math.max(1, Math.floor(Number(options.maxCommits) || 10_000)));
  const selected = commits.slice(0, maxCommits);
  const nowTimestamp = Date.parse(options.now ?? "") || Date.now();
  const periodStart = period === "12m" ? nowTimestamp - 365 * 24 * 60 * 60 * 1000 : -Infinity;
  const files = new Map();
  for (const commit of selected) {
    if (periodStart !== -Infinity && (Date.parse(commit.date) || 0) < periodStart) continue;
    const author = demoOwnershipAuthor(commit);
    for (const change of filesForCommit(commit)) {
      const file = files.get(change.path) ?? demoOwnershipNode(change.path);
      const additions = Number(change.additions) || 0;
      const deletions = Number(change.deletions) || 0;
      file.totalCommits += 1;
      file.totalChurn += additions + deletions;
      file.additions += additions;
      file.deletions += deletions;
      file.firstSeenAt = !file.firstSeenAt || commit.date < file.firstSeenAt ? commit.date : file.firstSeenAt;
      file.lastChangedAt = !file.lastChangedAt || commit.date > file.lastChangedAt ? commit.date : file.lastChangedAt;
      addDemoOwnershipActivity(file, author, additions, deletions, commit.date);
      files.set(change.path, file);
    }
  }
  const directories = new Map();
  for (const file of files.values()) {
    for (const directoryPath of demoOwnershipAncestors(file.path)) {
      const directory = directories.get(directoryPath) ?? demoOwnershipNode(directoryPath, "directory");
      mergeDemoOwnershipNode(directory, file);
      directories.set(directoryPath, directory);
    }
  }
  const scoredFiles = new Map([...files].map(([path, file]) => [path, scoreDemoOwnershipNode(file)]));
  const scoredDirectories = new Map([...directories].map(([path, directory]) => [path, scoreDemoOwnershipNode(directory)]));
  if (!scoredDirectories.has("")) scoredDirectories.set("", scoreDemoOwnershipNode(demoOwnershipNode("", "directory")));
  const path = String(options.path ?? "").trim().replace(/\/+$/, "");
  const selectedFile = scoredFiles.get(path);
  const selectedDirectory = scoredDirectories.get(path);
  const children = selectedFile
    ? [selectedFile]
    : selectedDirectory
      ? [...scoredDirectories.values()].filter((node) => node.path && demoOwnershipParentPath(node.path) === path).concat([...scoredFiles.values()].filter((node) => demoOwnershipParentPath(node.path) === path))
      : path
        ? []
        : [...scoredDirectories.values()].filter((node) => node.path && !node.path.includes("/")).concat([...scoredFiles.values()].filter((node) => !node.path.includes("/")));
  const sortedChildren = children.sort((left, right) => left.type === right.type ? left.path.localeCompare(right.path) : left.type === "directory" ? -1 : 1);
  const limit = Math.min(1000, Math.max(1, Math.floor(Number(options.limit) || 100)));
  const returned = sortedChildren.slice(0, limit).map(serializeDemoOwnershipNode);
  const truncated = selected.length < commits.length || sortedChildren.length > returned.length;
  return {
    repositoryKey: "/demo/acme-storefront",
    head: mainTip,
    generatedAt: new Date(nowTimestamp).toISOString(),
    period,
    path,
    summary: serializeDemoOwnershipNode(scoredDirectories.get("")),
    nodes: returned,
    scope: {
      maxCommits,
      maxFilesPerCommit: 5_000,
      processedCommits: selected.length,
      sourceTruncated: commits.length > maxCommits,
      totalFiles: scoredFiles.size,
      totalDirectories: scoredDirectories.size,
      totalNodes: sortedChildren.length,
      returnedNodes: returned.length,
      reportLimit: limit,
      reportTruncated: sortedChildren.length > returned.length,
      truncated,
    },
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

  const reflogActions = [
    ["commit", (commit) => `commit: ${commit.subject}`],
    ["checkout", () => "checkout: moving from feature/payment to main"],
    ["commit", (commit) => `commit: ${commit.subject}`],
    ["reset", () => "reset: moving to HEAD~1"],
    ["rebase", () => "rebase (pick): replay local commits"],
    ["merge", (commit) => `merge feature/payment: ${commit.subject}`],
    ["cherry-pick", (commit) => `cherry-pick: ${commit.shortHash}`],
  ];
  const createReflogEntry = (commit, index, refName = "HEAD", selectorPrefix = "HEAD") => {
    const [action, message] = reflogActions[index % reflogActions.length];
    return {
      index,
      hash: commit.hash,
      shortHash: commit.shortHash,
      selector: `${selectorPrefix}@{${index}}`,
      refName,
      date: commit.date,
      actor: { name: commit.author, email: commit.email },
      rawMessage: message(commit),
      action,
      detail: message(commit).replace(/^[a-z-]+(?:\s+\([^)]*\))?:\s*/i, ""),
      reachable: null,
    };
  };
  const headReflog = commits.slice(0, 80).map((commit, index) => createReflogEntry(commit, index));
  const reflogByRef = new Map([["HEAD", headReflog]]);
  for (const branch of localBranches) {
    const reachable = reachableFrom(byHash, [branch.tip]);
    const branchEntries = commits
      .filter((commit) => reachable.has(commit.hash))
      .slice(0, 80)
      .map((commit, index) => createReflogEntry(commit, index, `refs/heads/${branch.name}`, branch.name));
    reflogByRef.set(branch.name, branchEntries);
  }

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

  const demoWorktrees = [
    {
      path: "/demo/acme-storefront",
      head: mainTip,
      shortHead: mainTip.slice(0, 8),
      branch: "main",
      bare: false,
      detached: false,
      locked: false,
      lockReason: "",
      prunable: false,
      pruneReason: "",
      reason: "",
      main: true,
      exists: true,
      dirty: true,
      changes: status.files.length,
    },
    {
      path: "/demo/acme-storefront-hotfix",
      head: resolveTip("fix/timezone"),
      shortHead: resolveTip("fix/timezone").slice(0, 8),
      branch: "fix/timezone",
      bare: false,
      detached: false,
      locked: true,
      lockReason: "hotfix in progress",
      prunable: false,
      pruneReason: "",
      reason: "hotfix in progress",
      main: false,
      exists: true,
      dirty: false,
      changes: 0,
    },
  ];

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
    worktrees: cloneDemoValue(demoWorktrees),
    submodules: [
      { name: "design-tokens", path: "vendor/design-tokens", url: "https://example.com/acme/design-tokens.git", hash: commits[10].hash, shortHash: commits[10].shortHash, description: "heads/main", state: "clean" },
    ],
    remotes: [{ name: "origin", fetchUrl: "https://example.com/acme/storefront.git", pushUrl: "https://example.com/acme/storefront.git" }],
    tags: tags.map((tag) => ({ name: tag.name, hash: tag.hash, shortHash: tag.hash.slice(0, 8), date: byHash.get(tag.hash).date, subject: byHash.get(tag.hash).subject })).reverse(),
    stashes: [{ ref: "stash@{0}", hash: commits[4].hash, date: commits[4].date, subject: "WIP on main: experiment with cache warmup", shortHash: commits[4].shortHash }],
    contributors: AUTHORS.map((author, index) => ({ name: author.name, email: author.email, commits: 48 - index * 9 })),
    countObjects: { count: 132, "in-pack": 2481, size: 512, "size-pack": 3921 },
  });

  const createDemoHealthSummary = (options = {}) => {
    const nowTimestamp = Number.isFinite(Number(options.now))
      ? Number(options.now)
      : Date.parse(options.now ?? "") || Date.now();
    const branches = createDemoBranchIntelligence(options);
    const hotspots = createDemoHotspotSummary(commits, mainTip, { limit: 100, now: nowTimestamp });
    const signals = [];
    if (status.files.length > 0) {
      signals.push({
        id: "working-tree-dirty",
        severity: "info",
        category: "workingTree",
        title: "Working tree has uncommitted changes",
        description: "Changes on disk are shown in Workspace and do not change historical health metrics.",
        metric: status.files.length,
        penalty: 0,
        action: { type: "navigate", payload: { view: "workspace" } },
      });
    }
    const staleBranches = branches.branches.filter((branch) => !branch.remote && !branch.current && branch.stale);
    const behindBranches = branches.branches.filter((branch) => !branch.remote && branch.behindDefault >= 50);
    const goneBranches = branches.branches.filter((branch) => !branch.remote && (branch.goneUpstream || branch.gone));
    if (staleBranches.length > 0) {
      signals.push({
        id: "stale-local-branches",
        severity: "low",
        category: "branches",
        title: `${staleBranches.length} stale local branch${staleBranches.length === 1 ? "" : "es"}`,
        description: "No commits were recorded on these branches in at least 90 days.",
        metric: staleBranches.length,
        penalty: Math.min(staleBranches.length, 10),
        action: { type: "navigate", payload: { view: "branches", filter: "stale" } },
        details: staleBranches.map((branch) => branch.name),
      });
    }
    const concentrated = hotspots.files.filter((file) => file.hotspotBand === "High" && file.ownershipConcentration >= 0.8);
    if (concentrated.length > 0) {
      signals.push({
        id: "concentrated-hotspots",
        severity: "medium",
        category: "ownership",
        title: `${concentrated.length} high-churn file${concentrated.length === 1 ? " has" : "s have"} concentrated contribution`,
        description: "Review the Ownership and Hotspots views for context on historical contribution concentration.",
        metric: concentrated.length,
        penalty: Math.min(concentrated.length * 2, 10),
        action: { type: "navigate", payload: { view: "hotspots", filter: "concentrated" } },
        relatedActions: [{ type: "navigate", payload: { view: "ownership" } }],
        details: concentrated.map((file) => file.path),
      });
    }
    const orderedSignals = signals.sort((left, right) => left.category.localeCompare(right.category) || left.id.localeCompare(right.id));
    const penalty = orderedSignals.reduce((total, signal) => total + signal.penalty, 0);
    const categories = Object.fromEntries(["workingTree", "branches", "repository", "activity", "ownership"].map((category) => {
      const categorySignals = orderedSignals.filter((signal) => signal.category === category);
      const categoryPenalty = categorySignals.reduce((total, signal) => total + signal.penalty, 0);
      return [category, {
        score: Math.max(0, 100 - categoryPenalty),
        penalty: categoryPenalty,
        status: categorySignals.some((signal) => signal.severity === "medium" || signal.severity === "high") ? "attention" : "healthy",
        signalCount: categorySignals.length,
        signalIds: categorySignals.map((signal) => signal.id),
      }];
    }));
    const score = Math.max(0, 100 - penalty);
    return {
      repositoryKey: "/demo/acme-storefront",
      head: mainTip,
      generatedAt: new Date(nowTimestamp).toISOString(),
      repository: { name: "acme-storefront", rootPath: "/demo/acme-storefront", head: mainTip, currentBranch: "main", defaultBranch: "main" },
      score,
      grade: score < 70 ? "warning" : score < 90 || orderedSignals.some((signal) => signal.severity === "medium") ? "attention" : "healthy",
      signals: orderedSignals.slice(0, 100),
      categories,
      facts: {
        localBranchCount: branches.scope.totalLocal,
        staleBranchCount: staleBranches.length,
        behindBranchCount: behindBranches.length,
        goneBranchCount: goneBranches.length,
        defaultBranch: branches.defaultBranch,
        currentBranch: "main",
        trackedFileCount: demoFiles.filter((file) => file.tracked).length,
        largeFileCount: 0,
        concentratedHotspotCount: concentrated.length,
        highActivityFileCount: hotspots.files.filter((file) => file.hotspotBand === "High").length,
        hotspotFileCount: hotspots.scope.eligibleFiles,
        ownershipConcentrationThreshold: 0.8,
        lastCommitAt: commits[0]?.date ?? null,
        dirtyFileCount: status.files.length,
        conflictedFileCount: 0,
        totalCommits: commits.length,
        processedCommits: hotspots.scope.processedCommits,
        analyticsTruncated: Boolean(hotspots.scope.sourceTruncated),
        trackedFilesInspected: demoFiles.filter((file) => file.tracked).length,
      },
      scope: {
        analytics: { maxCommits: hotspots.scope.maxCommits, processedCommits: hotspots.scope.processedCommits, truncated: Boolean(hotspots.scope.sourceTruncated) },
        branches: { totalLocal: branches.scope.totalLocal, analyzedLocal: branches.scope.analyzedLocal, truncated: Boolean(branches.scope.truncated) },
        trackedFiles: { totalEntries: demoFiles.filter((file) => file.tracked).length, inspectedEntries: demoFiles.filter((file) => file.tracked).length, truncated: false },
        hotspots: { eligibleFiles: hotspots.scope.eligibleFiles, returnedFiles: hotspots.scope.returnedFiles, truncated: Boolean(hotspots.scope.truncated) },
        sourceTruncated: Boolean(hotspots.scope.sourceTruncated || branches.scope.truncated),
        truncated: Boolean(hotspots.scope.truncated || branches.scope.truncated),
        returnedSignals: orderedSignals.length,
        signalLimit: 100,
      },
    };
  };

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
  const demoRepositoryPath = "/demo/acme-storefront";
  let demoSavedViews = readDemoSavedViews(demoRepositoryPath);
  let demoSavedViewSequence = 0;
  let demoLocalMetadata = readDemoLocalMetadata(demoRepositoryPath);
  let demoLocalMetadataSequence = 0;
  const savedViewError = (message, code = "SAVED_VIEW_INVALID") =>
    Promise.resolve({ ok: false, error: { message, code } });
  const localMetadataError = (message, code = "LOCAL_METADATA_INVALID") =>
    Promise.resolve({ ok: false, error: { message, code } });
  const saveDemoViews = () => writeDemoSavedViews(demoRepositoryPath, demoSavedViews);
  const saveDemoLocalMetadata = () => writeDemoLocalMetadata(demoRepositoryPath, demoLocalMetadata);
  const findDemoSavedView = (id) => demoSavedViews.find((view) => view.id === id);
  const findDemoBookmark = (id) => demoLocalMetadata.bookmarks.find((bookmark) => bookmark.id === id);
  const findDemoNote = (id) => demoLocalMetadata.notes.find((note) => note.id === id);
  const resolveDemoCommitHash = (value) => {
    const commit = byHash.get(resolveTip(value));
    if (!commit) throw new Error("The selected commit could not be found in the demo repository.");
    return commit.hash;
  };
  const optionalLocalText = (value, field, maximum) => {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string" || value.includes("\0")) throw new Error(`${field} must be a string.`);
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.length > maximum) throw new Error(`${field} must contain at most ${maximum} characters.`);
    return normalized;
  };
  const validateDemoSavedViewInput = (input = {}, { requireId = false } = {}) => {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 80) throw new Error("Saved view names must contain between 1 and 80 characters.");
    if (!DEMO_SAVED_VIEW_TYPES.has(input.viewType)) throw new Error("Saved view type is not supported.");
    if (requireId && !findDemoSavedView(input.id)) throw new Error("Saved view was not found.");
    if (input.config !== undefined && (!input.config || typeof input.config !== "object" || Array.isArray(input.config))) {
      throw new Error("Saved view config must be an object.");
    }
    return { name, config: cloneDemoValue(input.config ?? {}), pinned: Boolean(input.pinned) };
  };

  return {
    platform: "demo",
    openRepository: () => Promise.resolve("/demo/acme-storefront"),
    revealRepository: () => Promise.resolve({ ok: true }),
    revealRepositoryFile: () => Promise.resolve({ ok: true }),
    chooseWorktreeLocation: demoWriteError,
    getOperationMode: () => ok({ operationMode: "read-only" }),
    setOperationMode: demoWriteError,
    stageFiles: demoWriteError,
    unstageFiles: demoWriteError,
    stageHunk: demoWriteError,
    unstageHunk: demoWriteError,
    scanRepository: () => ok(scanData()),
    worktreeCreatePreview: demoWriteError,
    worktreeCreate: demoWriteError,
    worktreeDetails: ({ path: requestedPath } = {}) => {
      const worktree = demoWorktrees.find((candidate) => candidate.path === requestedPath);
      if (!worktree) return Promise.resolve({ ok: false, error: { message: "The selected path is not a registered Git worktree.", code: "WORKTREE_NOT_FOUND" } });
      const worktreeStatus = worktree.main
        ? status
        : { branch: worktree.branch, oid: worktree.head, upstream: "", ahead: 0, behind: 0, files: [] };
      return ok({
        worktree: cloneDemoValue(worktree),
        status: cloneDemoValue(worktreeStatus),
        dirty: worktreeStatus.files.length > 0,
        changes: worktreeStatus.files.length,
      });
    },
    analyticsSummary: (payload = {}) => ok(createDemoAnalyticsSummary(commits, mainTip, payload)),
    activity: (payload = {}) => ok(createDemoActivitySummary(commits, mainTip, payload)),
    hotspots: (payload = {}) => ok(createDemoHotspotSummary(commits, mainTip, payload)),
    ownership: (payload = {}) => ok(createDemoOwnershipSummary(commits, mainTip, payload)),
    repositoryHealth: (payload = {}) => ok(createDemoHealthSummary(payload)),
    branchIntelligence: (payload = {}) => ok(createDemoBranchIntelligence(payload)),
    listSavedViews: () => ok({ repositoryId: "demo-repository", savedViews: cloneDemoValue(demoSavedViews), source: "demo", warning: null }),
    createSavedView: (input = {}) => {
      try {
        const normalized = validateDemoSavedViewInput(input);
        const timestamp = new Date().toISOString();
        const savedView = {
          id: `demo-view-${Date.now().toString(36)}-${(++demoSavedViewSequence).toString(36)}`,
          name: normalized.name,
          viewType: input.viewType,
          configVersion: Number(input.configVersion) || 1,
          config: normalized.config,
          pinned: normalized.pinned,
          createdAt: timestamp,
          updatedAt: timestamp,
          lastOpenedAt: null,
        };
        demoSavedViews = [...demoSavedViews, savedView];
        saveDemoViews();
        return ok({ repositoryId: "demo-repository", savedView: cloneDemoValue(savedView), savedViews: cloneDemoValue(demoSavedViews) });
      } catch (error) {
        return savedViewError(error?.message ?? "Saved view could not be created.");
      }
    },
    updateSavedView: (input = {}) => {
      const current = findDemoSavedView(input.id);
      if (!current) return savedViewError("Saved view was not found.", "SAVED_VIEW_NOT_FOUND");
      try {
        const normalized = validateDemoSavedViewInput({ ...current, ...input }, { requireId: true });
        const next = {
          ...current,
          ...(input.name !== undefined ? { name: normalized.name } : {}),
          ...(input.viewType !== undefined ? { viewType: input.viewType } : {}),
          ...(input.config !== undefined ? { config: normalized.config } : {}),
          ...(input.pinned !== undefined ? { pinned: normalized.pinned } : {}),
          ...(input.lastOpenedAt !== undefined ? { lastOpenedAt: input.lastOpenedAt } : {}),
          updatedAt: new Date().toISOString(),
        };
        demoSavedViews = demoSavedViews.map((view) => (view.id === current.id ? next : view));
        saveDemoViews();
        return ok({ repositoryId: "demo-repository", savedView: cloneDemoValue(next), savedViews: cloneDemoValue(demoSavedViews) });
      } catch (error) {
        return savedViewError(error?.message ?? "Saved view could not be updated.");
      }
    },
    deleteSavedView: (input = {}) => {
      const current = findDemoSavedView(input.id);
      if (!current) return savedViewError("Saved view was not found.", "SAVED_VIEW_NOT_FOUND");
      demoSavedViews = demoSavedViews.filter((view) => view.id !== current.id);
      saveDemoViews();
      return ok({ repositoryId: "demo-repository", deletedId: current.id, savedViews: cloneDemoValue(demoSavedViews) });
    },
    listBookmarks: () => ok({ repositoryId: "demo-repository", bookmarks: cloneDemoValue(demoLocalMetadata.bookmarks), source: "demo", warning: null }),
    createBookmark: (input = {}) => {
      try {
        if (demoLocalMetadata.bookmarks.length >= 1000) throw new Error("The bookmark limit has been reached.");
        const commitHash = resolveDemoCommitHash(input.commitHash);
        const label = optionalLocalText(input.label, "Bookmark label", 120);
        const category = optionalLocalText(input.category, "Bookmark category", 60);
        const id = typeof input.id === "string" && input.id.trim() ? input.id.trim().slice(0, 200) : `demo-bookmark-${Date.now().toString(36)}-${(++demoLocalMetadataSequence).toString(36)}`;
        if (findDemoBookmark(id)) throw new Error("A bookmark with this ID already exists.");
        const timestamp = new Date().toISOString();
        const bookmark = { id, commitHash, label, category, createdAt: timestamp, updatedAt: timestamp };
        demoLocalMetadata = { ...demoLocalMetadata, bookmarks: [...demoLocalMetadata.bookmarks, bookmark] };
        saveDemoLocalMetadata();
        return ok({ repositoryId: "demo-repository", bookmark: cloneDemoValue(bookmark), bookmarks: cloneDemoValue(demoLocalMetadata.bookmarks), source: "demo", warning: null });
      } catch (error) {
        return localMetadataError(error?.message ?? "Bookmark could not be created.", error?.message?.includes("commit") ? "COMMIT_NOT_FOUND" : undefined);
      }
    },
    updateBookmark: (input = {}) => {
      const current = findDemoBookmark(input.id);
      if (!current) return localMetadataError("Bookmark was not found.", "BOOKMARK_NOT_FOUND");
      try {
        const commitHash = Object.prototype.hasOwnProperty.call(input, "commitHash") ? resolveDemoCommitHash(input.commitHash) : current.commitHash;
        const label = Object.prototype.hasOwnProperty.call(input, "label") ? optionalLocalText(input.label, "Bookmark label", 120) : current.label;
        const category = Object.prototype.hasOwnProperty.call(input, "category") ? optionalLocalText(input.category, "Bookmark category", 60) : current.category;
        const bookmark = { ...current, commitHash, label, category, updatedAt: new Date().toISOString() };
        demoLocalMetadata = { ...demoLocalMetadata, bookmarks: demoLocalMetadata.bookmarks.map((candidate) => candidate.id === current.id ? bookmark : candidate) };
        saveDemoLocalMetadata();
        return ok({ repositoryId: "demo-repository", bookmark: cloneDemoValue(bookmark), bookmarks: cloneDemoValue(demoLocalMetadata.bookmarks), source: "demo", warning: null });
      } catch (error) {
        return localMetadataError(error?.message ?? "Bookmark could not be updated.", error?.message?.includes("commit") ? "COMMIT_NOT_FOUND" : undefined);
      }
    },
    deleteBookmark: (input = {}) => {
      const current = findDemoBookmark(input.id);
      if (!current) return localMetadataError("Bookmark was not found.", "LOCAL_METADATA_NOT_FOUND");
      demoLocalMetadata = { ...demoLocalMetadata, bookmarks: demoLocalMetadata.bookmarks.filter((bookmark) => bookmark.id !== current.id) };
      saveDemoLocalMetadata();
      return ok({ repositoryId: "demo-repository", deletedId: current.id, bookmarks: cloneDemoValue(demoLocalMetadata.bookmarks), source: "demo", warning: null });
    },
    listNotes: () => ok({ repositoryId: "demo-repository", notes: cloneDemoValue(demoLocalMetadata.notes), source: "demo", warning: null }),
    createNote: (input = {}) => {
      try {
        if (demoLocalMetadata.notes.length >= 1000) throw new Error("The note limit has been reached.");
        const targetId = resolveDemoCommitHash(input.targetId);
        if (typeof input.body !== "string" || input.body.includes("\0") || input.body.length > 10_000) throw new Error("Note body must contain at most 10000 characters.");
        const title = optionalLocalText(input.title, "Note title", 120);
        const id = typeof input.id === "string" && input.id.trim() ? input.id.trim().slice(0, 200) : `demo-note-${Date.now().toString(36)}-${(++demoLocalMetadataSequence).toString(36)}`;
        if (findDemoNote(id)) throw new Error("A note with this ID already exists.");
        const timestamp = new Date().toISOString();
        const note = { id, targetType: "commit", targetId, ...(title ? { title } : {}), body: input.body, createdAt: timestamp, updatedAt: timestamp };
        demoLocalMetadata = { ...demoLocalMetadata, notes: [...demoLocalMetadata.notes, note] };
        saveDemoLocalMetadata();
        return ok({ repositoryId: "demo-repository", note: cloneDemoValue(note), notes: cloneDemoValue(demoLocalMetadata.notes), source: "demo", warning: null });
      } catch (error) {
        return localMetadataError(error?.message ?? "Note could not be created.", error?.message?.includes("commit") ? "COMMIT_NOT_FOUND" : undefined);
      }
    },
    updateNote: (input = {}) => {
      const current = findDemoNote(input.id);
      if (!current) return localMetadataError("Note was not found.", "NOTE_NOT_FOUND");
      try {
        const targetId = Object.prototype.hasOwnProperty.call(input, "targetId") ? resolveDemoCommitHash(input.targetId) : current.targetId;
        const body = Object.prototype.hasOwnProperty.call(input, "body") ? input.body : current.body;
        if (typeof body !== "string" || body.includes("\0") || body.length > 10_000) throw new Error("Note body must contain at most 10000 characters.");
        const title = Object.prototype.hasOwnProperty.call(input, "title") ? optionalLocalText(input.title, "Note title", 120) : current.title;
        const note = { ...current, targetId, ...(title ? { title } : {}), ...(title ? {} : { title: undefined }), body, updatedAt: new Date().toISOString() };
        if (!note.title) delete note.title;
        demoLocalMetadata = { ...demoLocalMetadata, notes: demoLocalMetadata.notes.map((candidate) => candidate.id === current.id ? note : candidate) };
        saveDemoLocalMetadata();
        return ok({ repositoryId: "demo-repository", note: cloneDemoValue(note), notes: cloneDemoValue(demoLocalMetadata.notes), source: "demo", warning: null });
      } catch (error) {
        return localMetadataError(error?.message ?? "Note could not be updated.", error?.message?.includes("commit") ? "COMMIT_NOT_FOUND" : undefined);
      }
    },
    deleteNote: (input = {}) => {
      const current = findDemoNote(input.id);
      if (!current) return localMetadataError("Note was not found.", "LOCAL_METADATA_NOT_FOUND");
      demoLocalMetadata = { ...demoLocalMetadata, notes: demoLocalMetadata.notes.filter((note) => note.id !== current.id) };
      saveDemoLocalMetadata();
      return ok({ repositoryId: "demo-repository", deletedId: current.id, notes: cloneDemoValue(demoLocalMetadata.notes), source: "demo", warning: null });
    },
    listReflog: ({ ref = "HEAD", limit = 200, skip = 0 } = {}) => {
      const normalizedRef = ref === "HEAD" ? "HEAD" : String(ref).replace(/^refs\/heads\//, "");
      const entriesForRef = reflogByRef.get(normalizedRef) ?? [];
      const boundedLimit = Math.min(1000, Math.max(1, Math.floor(Number(limit) || 200)));
      const boundedSkip = Math.max(0, Math.floor(Number(skip) || 0));
      const entries = entriesForRef.slice(boundedSkip, boundedSkip + boundedLimit);
      const hasMore = boundedSkip + boundedLimit < entriesForRef.length;
      return ok({
        ref: normalizedRef === "HEAD" ? "HEAD" : `refs/heads/${normalizedRef}`,
        limit: boundedLimit,
        skip: boundedSkip,
        hasMore,
        nextSkip: hasMore ? boundedSkip + boundedLimit : null,
        entries,
      });
    },
    commitReachability: ({ hash } = {}) => {
      const resolvedHash = resolveTip(hash);
      if (!resolvedHash) return Promise.resolve({ ok: false, error: { message: "Unknown demo commit.", code: "UNKNOWN_REF" } });
      const branchesContaining = localBranches
        .filter((branch) => reachableFrom(byHash, [branch.tip]).has(resolvedHash))
        .map((branch) => branch.name);
      const tagsContaining = tags.filter((tag) => reachableFrom(byHash, [tag.hash]).has(resolvedHash)).map((tag) => tag.name);
      return ok({
        hash: resolvedHash,
        branches: branchesContaining,
        tags: tagsContaining,
        reachableFromAnyKnownRef: branchesContaining.length > 0 || tagsContaining.length > 0,
      });
    },
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
    fileBlame: ({ path: filePath, revision } = {}) => {
      const file = demoFiles.find((entry) => entry.path === filePath);
      if (!file) return Promise.resolve({ ok: false, error: { message: "Unknown demo file.", code: "PATH_NOT_FOUND" } });
      const commit = byHash.get(resolveTip(revision)) ?? byHash.get(mainTip);
      if (filePath === "assets/logo.bin") return ok({ path: filePath, revision: commit.hash, lines: [], authors: [], binary: true, workingTreeDirty: false, message: "Blame unavailable for binary files." });
      const baseText = DEMO_FILE_CONTENT[filePath] ?? `// Demo content for ${filePath}\n\nexport const ready = true;\n`;
      const contentLines = baseText.split(/\r?\n/);
      if (contentLines.at(-1) === "") contentLines.pop();
      const entries = historyFor(filePath);
      const lines = contentLines.map((content, index) => {
        const entry = entries[index % Math.max(entries.length, 1)] ?? null;
        const owner = entry ? byHash.get(entry.hash) : commit;
        return {
          lineNumber: index + 1,
          content,
          commitHash: owner?.hash ?? commit.hash,
          shortHash: owner?.shortHash ?? commit.shortHash,
          author: { name: owner?.author ?? "Demo author", email: owner?.email ?? "demo@example.test" },
          authorTime: owner?.date ?? commit.date,
          summary: owner?.subject ?? commit.subject,
          boundary: !entry || index === 0,
        };
      });
      const authors = [...new Map(lines.map((line) => [`${line.author.email}\u0000${line.author.name}`, line])).values()].map((line) => ({
        key: `${line.author.email}\u0000${line.author.name}`,
        name: line.author.name,
        email: line.author.email,
        lines: lines.filter((candidate) => candidate.author.email === line.author.email && candidate.author.name === line.author.name).length,
        lineCount: lines.filter((candidate) => candidate.author.email === line.author.email && candidate.author.name === line.author.name).length,
        commits: new Set(lines.filter((candidate) => candidate.author.email === line.author.email && candidate.author.name === line.author.name).map((candidate) => candidate.commitHash)).size,
        lastAuthorTime: line.authorTime,
      }));
      return ok({ path: filePath, revision: commit.hash, lines, authors, binary: false, workingTreeDirty: false });
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

    listCommitsRange: ({ from, to, limit = 200 } = {}) => {
      const fromTimestamp = from ? Date.parse(from) : -Infinity;
      const toTimestamp = to ? Date.parse(to) : Infinity;
      if (!Number.isFinite(fromTimestamp) && from) return Promise.resolve({ ok: false, error: { message: "The commit range start is invalid.", code: "INVALID_ARGUMENT" } });
      if (!Number.isFinite(toTimestamp) && to) return Promise.resolve({ ok: false, error: { message: "The commit range end is invalid.", code: "INVALID_ARGUMENT" } });
      if (fromTimestamp > toTimestamp) return Promise.resolve({ ok: false, error: { message: "The commit range is reversed.", code: "INVALID_ARGUMENT" } });
      const boundedLimit = Math.min(500, Math.max(1, Math.floor(Number(limit) || 200)));
      const selected = commits.filter((commit) => commit.timestamp >= fromTimestamp && commit.timestamp <= toTimestamp).slice(0, boundedLimit);
      return ok({ commits: selected.map(({ timestamp, ...commit }) => commit), from: from ?? null, to: to ?? null, limit: boundedLimit, truncated: selected.length >= boundedLimit });
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
