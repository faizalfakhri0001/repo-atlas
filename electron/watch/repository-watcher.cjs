const path = require("node:path");
const chokidar = require("chokidar");
const { resolveRepository, runGit } = require("../git/core.cjs");
const {
  IGNORED_WORKTREE_SEGMENTS,
  classifyRepositoryPath,
  coalesceRepositoryChanges,
} = require("./event-classifier.cjs");

const DEFAULT_DEBOUNCE_MS = 250;
const DEFAULT_MAX_WAIT_MS = 1_500;
const DEFAULT_FILE_THRESHOLD = 50_000;
const WATCH_MODES = new Set(["smart", "git-only", "full", "off"]);

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function toPortableRelative(root, candidate) {
  return path.relative(root, candidate).split(path.sep).join("/");
}

function isRelevantGitPath(gitDir, candidate) {
  if (!isInside(gitDir, candidate)) return false;
  const relative = toPortableRelative(gitDir, candidate);
  if (!relative) return true;
  return (
    relative === "HEAD" ||
    relative === "index" ||
    relative === "packed-refs" ||
    relative === "CHERRY_PICK_HEAD" ||
    relative === "MERGE_HEAD" ||
    relative === "REVERT_HEAD" ||
    relative === "BISECT_LOG" ||
    relative.startsWith("refs/") ||
    relative.startsWith("rebase-merge/") ||
    relative.startsWith("rebase-apply/") ||
    relative.startsWith("sequencer/")
  );
}

function createIgnoredPath(repositoryRoot, gitDir) {
  return (candidate) => {
    const absolute = path.resolve(String(candidate ?? ""));
    if (isInside(gitDir, absolute)) return !isRelevantGitPath(gitDir, absolute);
    if (!isInside(repositoryRoot, absolute)) return false;
    const relative = toPortableRelative(repositoryRoot, absolute);
    if (!relative) return false;
    return relative.split("/").some((segment) => IGNORED_WORKTREE_SEGMENTS.has(segment));
  };
}

async function countVisibleFiles(repositoryRoot) {
  const result = await runGit(repositoryRoot, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { allowFailure: true });
  if (result.failed) return null;
  return new Set(result.stdout.split("\0").filter(Boolean)).size;
}

function normalizeMode(mode) {
  return WATCH_MODES.has(mode) ? mode : "smart";
}

function resolveWatchStrategy(mode, visibleFileCount, threshold = DEFAULT_FILE_THRESHOLD) {
  const requestedMode = normalizeMode(mode);
  if (requestedMode === "off") return { requestedMode, strategy: "off", watchGit: false, watchWorktree: false, polling: false };
  if (requestedMode === "git-only") return { requestedMode, strategy: "git-only", watchGit: true, watchWorktree: false, polling: false };
  if (requestedMode === "full") return { requestedMode, strategy: "full", watchGit: true, watchWorktree: true, polling: false };
  return { requestedMode, strategy: "full", watchGit: true, watchWorktree: true, polling: false, visibleFileCount, threshold };
}

class RepositoryWatcher {
  constructor({
    repositoryPath,
    mode = "smart",
    fileThreshold = DEFAULT_FILE_THRESHOLD,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    maxWaitMs = DEFAULT_MAX_WAIT_MS,
    onChange = () => {},
    onError = () => {},
    onStatus = () => {},
    watchFactory = (targets, options) => chokidar.watch(targets, options),
    resolveRepositoryFn = resolveRepository,
    countVisibleFilesFn = countVisibleFiles,
  } = {}) {
    this.repositoryPath = repositoryPath;
    this.mode = normalizeMode(mode);
    this.fileThreshold = fileThreshold;
    this.debounceMs = debounceMs;
    this.maxWaitMs = maxWaitMs;
    this.onChange = onChange;
    this.onError = onError;
    this.onStatus = onStatus;
    this.watchFactory = watchFactory;
    this.resolveRepositoryFn = resolveRepositoryFn;
    this.countVisibleFilesFn = countVisibleFilesFn;
    this.repository = null;
    this.strategy = null;
    this.watcher = null;
    this.pendingEvents = [];
    this.debounceTimer = null;
    this.maxWaitTimer = null;
    this.started = false;
  }

  async start() {
    if (this.started) return this.getStatus();
    this.repository = await this.resolveRepositoryFn(this.repositoryPath);
    const visibleFileCount = await this.countVisibleFilesFn(this.repository.rootPath);
    this.strategy = resolveWatchStrategy(this.mode, visibleFileCount, this.fileThreshold);
    this.started = true;
    this.onStatus(this.getStatus());
    if (this.strategy.strategy === "off") return this.getStatus();

    const targets = [];
    if (this.strategy.watchWorktree) targets.push(this.repository.rootPath);
    if (this.strategy.watchGit) targets.push(this.repository.gitDir);
    this.watcher = this.watchFactory(targets, {
      ignoreInitial: true,
      persistent: true,
      ignorePermissionErrors: true,
      ignored: createIgnoredPath(this.repository.rootPath, this.repository.gitDir),
    });
    this.watcher.on("all", (eventType, changedPath) => this.handleFileEvent(eventType, changedPath));
    this.watcher.on("error", (error) => this.handleError(error));
    return this.getStatus();
  }

  getStatus() {
    return {
      repositoryPath: this.repository?.rootPath ?? this.repositoryPath,
      requestedMode: this.strategy?.requestedMode ?? this.mode,
      strategy: this.strategy?.strategy ?? "off",
      visibleFileCount: this.strategy?.visibleFileCount ?? null,
      threshold: this.fileThreshold,
      watching: Boolean(this.watcher),
      polling: false,
      running: this.started,
    };
  }

  handleFileEvent(eventType, changedPath) {
    if (!this.started || !this.repository) return;
    const event = classifyRepositoryPath({
      repositoryRoot: this.repository.rootPath,
      gitDir: this.repository.gitDir,
      changedPath,
      eventType,
    });
    if (!event) return;
    this.pendingEvents.push(event);
    if (!this.debounceTimer) this.debounceTimer = setTimeout(() => this.flush(), this.debounceMs);
    if (!this.maxWaitTimer) this.maxWaitTimer = setTimeout(() => this.flush(), this.maxWaitMs);
  }

  flush() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.maxWaitTimer) clearTimeout(this.maxWaitTimer);
    this.debounceTimer = null;
    this.maxWaitTimer = null;
    const event = coalesceRepositoryChanges(this.pendingEvents);
    this.pendingEvents = [];
    if (event) this.onChange(event);
  }

  handleError(error) {
    this.onError(error);
    this.onStatus(this.getStatus());
  }

  async stop() {
    this.started = false;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.maxWaitTimer) clearTimeout(this.maxWaitTimer);
    this.debounceTimer = null;
    this.maxWaitTimer = null;
    this.pendingEvents = [];
    const watcher = this.watcher;
    this.watcher = null;
    if (watcher?.close) await watcher.close();
    this.onStatus(this.getStatus());
  }
}

module.exports = {
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_FILE_THRESHOLD,
  DEFAULT_MAX_WAIT_MS,
  WATCH_MODES,
  RepositoryWatcher,
  countVisibleFiles,
  createIgnoredPath,
  resolveWatchStrategy,
};
