const path = require("node:path");
const crypto = require("node:crypto");
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
const DEFAULT_ACTIVE_POLL_MS = 3_000;
const DEFAULT_INACTIVE_POLL_MS = 15_000;
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
    relative === "worktrees" ||
    relative.startsWith("worktrees/") ||
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
  if (visibleFileCount == null || visibleFileCount > threshold) {
    return {
      requestedMode,
      strategy: "git-only",
      watchGit: true,
      watchWorktree: false,
      polling: true,
      fallbackReason: visibleFileCount == null ? "file-count-unavailable" : "large-repository",
      visibleFileCount,
      threshold,
    };
  }
  return { requestedMode, strategy: "full", watchGit: true, watchWorktree: true, polling: false, visibleFileCount, threshold };
}

async function readStatusSnapshot(repositoryRoot) {
  const result = await runGit(repositoryRoot, ["status", "--porcelain=v2", "--branch", "-z"], { allowFailure: true });
  if (result.failed) throw new Error(result.stderr || "Repository status could not be read.");
  const records = result.stdout.split(/\0|\n/).filter(Boolean);
  const branch = records.find((record) => record.startsWith("# branch.head "))?.slice("# branch.head ".length) ?? "";
  const oid = records.find((record) => record.startsWith("# branch.oid "))?.slice("# branch.oid ".length) ?? "";
  return {
    branch,
    oid,
    fingerprint: crypto.createHash("sha256").update(result.stdout).digest("hex"),
  };
}

class RepositoryWatcher {
  constructor({
    repositoryPath,
    mode = "smart",
    fileThreshold = DEFAULT_FILE_THRESHOLD,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    maxWaitMs = DEFAULT_MAX_WAIT_MS,
    activePollMs = DEFAULT_ACTIVE_POLL_MS,
    inactivePollMs = DEFAULT_INACTIVE_POLL_MS,
    onChange = () => {},
    onError = () => {},
    onStatus = () => {},
    watchFactory = (targets, options) => chokidar.watch(targets, options),
    resolveRepositoryFn = resolveRepository,
    countVisibleFilesFn = countVisibleFiles,
    pollStatusFn = readStatusSnapshot,
  } = {}) {
    this.repositoryPath = repositoryPath;
    this.mode = normalizeMode(mode);
    this.fileThreshold = fileThreshold;
    this.debounceMs = debounceMs;
    this.maxWaitMs = maxWaitMs;
    this.activePollMs = activePollMs;
    this.inactivePollMs = inactivePollMs;
    this.onChange = onChange;
    this.onError = onError;
    this.onStatus = onStatus;
    this.watchFactory = watchFactory;
    this.resolveRepositoryFn = resolveRepositoryFn;
    this.countVisibleFilesFn = countVisibleFilesFn;
    this.pollStatusFn = pollStatusFn;
    this.repository = null;
    this.strategy = null;
    this.watcher = null;
    this.pendingEvents = [];
    this.debounceTimer = null;
    this.maxWaitTimer = null;
    this.pollTimer = null;
    this.pollingEnabled = false;
    this.pollingInFlight = false;
    this.pollingSnapshot = null;
    this.active = true;
    this.fallbackReason = null;
    this.started = false;
  }

  async start() {
    if (this.started) return this.getStatus();
    this.repository = await this.resolveRepositoryFn(this.repositoryPath);
    const visibleFileCount = await this.countVisibleFilesFn(this.repository.rootPath);
    this.strategy = resolveWatchStrategy(this.mode, visibleFileCount, this.fileThreshold);
    this.pollingEnabled = this.strategy.polling;
    this.fallbackReason = this.strategy.fallbackReason ?? null;
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
    if (this.pollingEnabled) {
      await this.pollNow();
      this.schedulePoll();
    }
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
      polling: this.pollingEnabled,
      pollIntervalMs: this.active ? this.activePollMs : this.inactivePollMs,
      fallbackReason: this.fallbackReason,
      active: this.active,
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
    if (this.started && !this.pollingEnabled) {
      this.pollingEnabled = true;
      this.fallbackReason = "watch-error";
      void this.pollNow();
      this.schedulePoll();
    }
    this.onStatus(this.getStatus());
  }

  setActive(active) {
    this.active = Boolean(active);
    if (this.pollingEnabled) this.schedulePoll();
    this.onStatus(this.getStatus());
  }

  schedulePoll() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (!this.started || !this.pollingEnabled) return;
    const delay = this.active ? this.activePollMs : this.inactivePollMs;
    this.pollTimer = setTimeout(async () => {
      this.pollTimer = null;
      await this.pollNow();
      this.schedulePoll();
    }, delay);
  }

  async pollNow() {
    if (!this.started || !this.pollingEnabled || this.pollingInFlight || !this.repository) return null;
    this.pollingInFlight = true;
    try {
      const current = await this.pollStatusFn(this.repository.rootPath);
      const previous = this.pollingSnapshot;
      this.pollingSnapshot = current;
      if (previous && previous.fingerprint !== current.fingerprint) {
        const kind = previous.oid !== current.oid || previous.branch !== current.branch ? "head" : "worktree";
        this.onChange({
          repositoryPath: this.repository.rootPath,
          kind,
          kinds: [kind],
          paths: [],
          timestamp: Date.now(),
        });
      }
      return current;
    } catch (error) {
      this.onError(error);
      return null;
    } finally {
      this.pollingInFlight = false;
    }
  }

  async stop() {
    this.started = false;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.maxWaitTimer) clearTimeout(this.maxWaitTimer);
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.debounceTimer = null;
    this.maxWaitTimer = null;
    this.pollTimer = null;
    this.pollingEnabled = false;
    this.pollingSnapshot = null;
    this.pendingEvents = [];
    const watcher = this.watcher;
    this.watcher = null;
    if (watcher?.close) await watcher.close();
    this.onStatus(this.getStatus());
  }
}

module.exports = {
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_ACTIVE_POLL_MS,
  DEFAULT_FILE_THRESHOLD,
  DEFAULT_INACTIVE_POLL_MS,
  DEFAULT_MAX_WAIT_MS,
  WATCH_MODES,
  RepositoryWatcher,
  countVisibleFiles,
  createIgnoredPath,
  readStatusSnapshot,
  resolveWatchStrategy,
};
