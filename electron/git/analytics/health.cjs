const { HEALTH_THRESHOLDS } = require("./health-thresholds.cjs");

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const SEVERITY_ORDER = Object.freeze({ high: 0, medium: 1, low: 2, info: 3 });

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, finiteNumber(value, minimum)));
}

function timestampOf(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value === "string" && value.trim()) return Date.parse(value);
  return NaN;
}

function ageInDays(value, now = Date.now()) {
  const timestamp = timestampOf(value);
  const current = timestampOf(now);
  if (!Number.isFinite(timestamp) || !Number.isFinite(current)) return null;
  return Math.max(0, Math.floor((current - timestamp) / DAY_IN_MILLISECONDS));
}

function parseTrackedFileRows(raw, { limit = HEALTH_THRESHOLDS.maxTrackedFiles } = {}) {
  const entries = String(raw ?? "").split("\0").filter(Boolean);
  const files = [];
  let totalEntries = 0;
  for (const entry of entries) {
    const match = entry.match(/^\d+\s+\w+\s+[0-9a-f]+\s+(\d+|-)\t([\s\S]*)$/i);
    if (!match) continue;
    totalEntries += 1;
    if (files.length >= limit) continue;
    const size = match[1] === "-" ? null : Number(match[1]);
    files.push({ path: match[2], size: Number.isFinite(size) ? size : null });
  }
  return {
    files,
    totalEntries,
    truncated: totalEntries > files.length,
  };
}

function signal({ id, severity = "info", category, title, description, metric, penalty = 0, action, details = [] }) {
  return {
    id,
    severity,
    category,
    title,
    description,
    ...(metric === undefined ? {} : { metric }),
    penalty: Math.max(0, Math.floor(finiteNumber(penalty))),
    ...(action ? { action } : {}),
    ...(details.length > 0 ? { details: details.slice(0, HEALTH_THRESHOLDS.maxSignalDetails) } : {}),
  };
}

function conflictSignals(status = {}) {
  const files = Array.isArray(status.files) ? status.files : [];
  const conflicts = files.filter((file) => file?.kind === "conflict");
  const dirty = files.filter((file) => file?.kind !== "ignored");
  const signals = [];
  if (conflicts.length > 0) {
    const penalty = clamp(
      conflicts.length * HEALTH_THRESHOLDS.conflictPenaltyPerFile,
      HEALTH_THRESHOLDS.conflictPenaltyMinimum,
      HEALTH_THRESHOLDS.conflictPenaltyMaximum,
    );
    signals.push(
      signal({
        id: "working-tree-conflicts",
        severity: conflicts.length >= 3 ? "high" : "medium",
        category: "workingTree",
        title: `${conflicts.length} conflicted file${conflicts.length === 1 ? "" : "s"}`,
        description: "Resolve conflicts before continuing repository operations.",
        metric: conflicts.length,
        penalty,
        action: { type: "navigate", payload: { view: "workspace", filter: "conflicts" } },
        details: conflicts.map((file) => file.path).filter(Boolean),
      }),
    );
  }
  if (dirty.length > 0) {
    signals.push(
      signal({
        id: "working-tree-dirty",
        severity: "info",
        category: "workingTree",
        title: "Working tree has uncommitted changes",
        description: "Changes on disk are shown in Workspace and do not change historical health metrics.",
        metric: dirty.length,
        action: { type: "navigate", payload: { view: "workspace" } },
      }),
    );
  }
  return signals;
}

function branchSignals(branchReport = {}) {
  const branches = Array.isArray(branchReport.branches) ? branchReport.branches : [];
  const localBranches = branches.filter((branch) => !branch.remote);
  const currentBranch = branchReport.currentBranch;
  const stale = localBranches.filter((branch) => !branch.current && branch.status !== "gone" && branch.stale);
  const gone = localBranches.filter((branch) => branch.goneUpstream || branch.gone);
  const behind = localBranches.filter(
    (branch) => branch.name !== branchReport.defaultBranch && Number(branch.behindDefault) >= HEALTH_THRESHOLDS.branchBehindWarning,
  );
  const highBehind = behind.filter((branch) => Number(branch.behindDefault) >= HEALTH_THRESHOLDS.branchBehindHigh);
  const signals = [];

  if (stale.length > 0) {
    signals.push(
      signal({
        id: "stale-local-branches",
        severity: stale.some((branch) => branch.veryStale || Number(branch.ageDays) >= HEALTH_THRESHOLDS.veryStaleBranchDays) ? "medium" : "low",
        category: "branches",
        title: `${stale.length} stale local branch${stale.length === 1 ? "" : "es"}`,
        description: `No commits were recorded on these branches in at least ${HEALTH_THRESHOLDS.staleBranchDays} days.`,
        metric: stale.length,
        penalty: Math.min(stale.length, HEALTH_THRESHOLDS.staleBranchPenaltyMaximum),
        action: { type: "navigate", payload: { view: "branches", filter: "stale" } },
        details: stale.map((branch) => branch.name),
      }),
    );
  }
  if (behind.length > 0) {
    signals.push(
      signal({
        id: "branches-behind-default",
        severity: highBehind.length > 0 ? "medium" : "low",
        category: "branches",
        title: `${behind.length} branch${behind.length === 1 ? " is" : "es are"} behind ${branchReport.defaultBranch || "the default branch"}`,
        description: `Branches at least ${HEALTH_THRESHOLDS.branchBehindWarning} commits behind the default branch need review.`,
        metric: behind.length,
        penalty: Math.min(highBehind.length * HEALTH_THRESHOLDS.behindBranchPenaltyPerBranch, HEALTH_THRESHOLDS.behindBranchPenaltyMaximum),
        action: { type: "navigate", payload: { view: "branches", filter: "behind" } },
        details: behind.map((branch) => `${branch.name} (${Number(branch.behindDefault) || 0} behind)`),
      }),
    );
  }
  if (gone.length > 0) {
    signals.push(
      signal({
        id: "gone-upstream-branches",
        severity: "medium",
        category: "branches",
        title: `${gone.length} branch${gone.length === 1 ? "" : "es"} has a gone upstream`,
        description: "The configured upstream ref no longer exists and may need cleanup or reconnection.",
        metric: gone.length,
        penalty: Math.min(gone.length * HEALTH_THRESHOLDS.goneBranchPenaltyPerBranch, HEALTH_THRESHOLDS.goneBranchPenaltyMaximum),
        action: { type: "navigate", payload: { view: "branches", filter: "gone" } },
        details: gone.map((branch) => branch.name),
      }),
    );
  }

  return { signals, localBranchCount: localBranches.length, currentBranch };
}

function repositorySignals(trackedFiles = {}) {
  const files = Array.isArray(trackedFiles.files) ? trackedFiles.files : [];
  const largeFiles = files
    .filter((file) => Number(file.size) >= HEALTH_THRESHOLDS.largeFileBytes)
    .sort((left, right) => Number(right.size) - Number(left.size) || String(left.path).localeCompare(String(right.path)));
  if (largeFiles.length === 0) return { signals: [], largeFiles };
  const veryLarge = largeFiles.filter((file) => Number(file.size) >= HEALTH_THRESHOLDS.veryLargeFileBytes);
  return {
    signals: [
      signal({
        id: "large-tracked-files",
        severity: veryLarge.length > 0 ? "high" : "medium",
        category: "repository",
        title: `${largeFiles.length} tracked file${largeFiles.length === 1 ? "" : "s"} exceed the large-file threshold`,
        description: `Tracked files larger than ${Math.round(HEALTH_THRESHOLDS.largeFileBytes / (1024 * 1024))} MB can slow clones and repository operations.`,
        metric: largeFiles.length,
        penalty: Math.min(largeFiles.length * HEALTH_THRESHOLDS.largeFilePenaltyPerFile, HEALTH_THRESHOLDS.largeFilePenaltyMaximum),
        action: { type: "navigate", payload: { view: "files", filter: "large" } },
        details: largeFiles.map((file) => `${file.path} (${file.size} bytes)`),
      }),
    ],
    largeFiles,
  };
}

function activitySignals(analytics = {}, now = Date.now()) {
  const commits = Array.isArray(analytics.commits) ? analytics.commits : [];
  const latest = commits.find((commit) => commit?.authoredAt) ?? null;
  if (!latest) {
    return {
      signals: [
        signal({
          id: "empty-history",
          severity: "info",
          category: "activity",
          title: "No commit history yet",
          description: "A new or empty repository is not penalized; activity signals will appear after the first commit.",
          metric: 0,
          action: { type: "navigate", payload: { view: "commits" } },
        }),
      ],
      lastCommitAt: null,
    };
  }
  const ageDays = ageInDays(latest.authoredAt, now);
  if (ageDays == null || ageDays < HEALTH_THRESHOLDS.activityAdvisoryDays) {
    return { signals: [], lastCommitAt: latest.authoredAt };
  }
  return {
    signals: [
      signal({
        id: "inactive-repository",
        severity: "info",
        category: "activity",
        title: `No commit activity in ${ageDays} days`,
        description: "This is an activity advisory only; an older repository is not treated as unhealthy by itself.",
        metric: ageDays,
        action: { type: "navigate", payload: { view: "commits" } },
      }),
    ],
    lastCommitAt: latest.authoredAt,
  };
}

function ownershipSignals(hotspots = {}) {
  const files = Array.isArray(hotspots.files) ? hotspots.files : [];
  const concentrated = files.filter(
    (file) => (file.hotspotBand === "High" || Number(file.hotspotScore) >= 0.75) && Number(file.ownershipConcentration) >= HEALTH_THRESHOLDS.ownershipConcentration,
  );
  if (concentrated.length === 0) return { signals: [], concentrated };
  return {
    signals: [
      signal({
        id: "concentrated-hotspots",
        severity: "medium",
        category: "ownership",
        title: `${concentrated.length} high-churn file${concentrated.length === 1 ? " has" : "s have"} concentrated contribution`,
        description: `Primary contribution is at least ${Math.round(HEALTH_THRESHOLDS.ownershipConcentration * 100)}% on high-activity files; review the Ownership and Hotspots views for context.`,
        metric: concentrated.length,
        penalty: Math.min(concentrated.length * HEALTH_THRESHOLDS.concentratedHotspotPenaltyPerFile, HEALTH_THRESHOLDS.concentratedHotspotPenaltyMaximum),
        action: { type: "navigate", payload: { view: "hotspots", filter: "concentrated" } },
        details: concentrated.map((file) => `${file.path} (${Math.round(Number(file.ownershipConcentration) * 100)}%)`),
      }),
    ],
    concentrated,
  };
}

function buildHealthSignals(input = {}, { now = Date.now() } = {}) {
  const branches = branchSignals(input.branches);
  const repository = repositorySignals(input.trackedFiles);
  const activity = activitySignals(input.analytics, now);
  const ownership = ownershipSignals(input.hotspots);
  const signals = [
    ...conflictSignals(input.status),
    ...branches.signals,
    ...repository.signals,
    ...activity.signals,
    ...ownership.signals,
  ];
  return {
    signals,
    facts: {
      localBranchCount: branches.localBranchCount,
      currentBranch: branches.currentBranch || null,
      trackedFileCount: input.trackedFiles?.totalEntries ?? input.trackedFiles?.files?.length ?? 0,
      largeFileCount: repository.largeFiles.length,
      concentratedHotspotCount: ownership.concentrated.length,
      lastCommitAt: activity.lastCommitAt,
    },
  };
}

module.exports = {
  DAY_IN_MILLISECONDS,
  HEALTH_THRESHOLDS,
  SEVERITY_ORDER,
  ageInDays,
  finiteNumber,
  parseTrackedFileRows,
  signal,
  conflictSignals,
  branchSignals,
  repositorySignals,
  activitySignals,
  ownershipSignals,
  buildHealthSignals,
};
