const { runGit, resolveCommit, resolveRepository, assertRefName, GitServiceError } = require("../core.cjs");

const MAX_LOCAL_BRANCHES = 500;
const BRANCH_ANALYSIS_CONCURRENCY = 4;
const STALE_AFTER_DAYS = 90;
const VERY_STALE_AFTER_DAYS = 180;

function parseUpstreamTrack(track) {
  const result = { ahead: 0, behind: 0, gone: false };
  if (!track) return result;
  if (/\bgone\b/.test(track)) result.gone = true;
  const ahead = track.match(/ahead (\d+)/);
  const behind = track.match(/behind (\d+)/);
  if (ahead) result.ahead = Number(ahead[1]);
  if (behind) result.behind = Number(behind[1]);
  return result;
}

function parseBranchRows(raw, currentBranch) {
  if (!raw.trim()) return [];
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const fields = line.split("\0");
      while (fields.length < 8) fields.push("");
      const [ref, name, hash, upstream, date, author, subject, track] = fields;
      const remote = ref.startsWith("refs/remotes/");
      return {
        ref,
        name,
        hash,
        shortHash: hash.slice(0, 8),
        upstream,
        ...parseUpstreamTrack(track),
        date,
        author,
        subject,
        remote,
        current: !remote && name === currentBranch,
      };
    });
}

function resolveDefaultBranch({ branches = [], currentBranch = "", originHead = "" } = {}) {
  const localBranches = branches.filter((branch) => !branch.remote);
  const localNames = new Set(localBranches.map((branch) => branch.name));
  const remoteNames = new Set(branches.filter((branch) => branch.remote).map((branch) => branch.name));
  const originDefault = String(originHead || "").replace(/^origin\//, "").trim();
  const originRef = originDefault ? `origin/${originDefault}` : "";

  if (originDefault && (localNames.has(originDefault) || remoteNames.has(originRef))) {
    return {
      defaultBranch: originDefault,
      defaultBranchRef: localNames.has(originDefault) ? originDefault : originRef,
      defaultBranchSource: "remote",
    };
  }

  if (currentBranch && localNames.has(currentBranch)) {
    return {
      defaultBranch: currentBranch,
      defaultBranchRef: currentBranch,
      defaultBranchSource: "current",
    };
  }

  const fallback = ["main", "master"].find((name) => localNames.has(name));
  if (fallback) {
    return {
      defaultBranch: fallback,
      defaultBranchRef: fallback,
      defaultBranchSource: "fallback",
    };
  }

  return {
    defaultBranch: null,
    defaultBranchRef: null,
    defaultBranchSource: "unknown",
  };
}

module.exports = {
  MAX_LOCAL_BRANCHES,
  BRANCH_ANALYSIS_CONCURRENCY,
  STALE_AFTER_DAYS,
  VERY_STALE_AFTER_DAYS,
  parseUpstreamTrack,
  parseBranchRows,
  resolveDefaultBranch,
  runGit,
  resolveCommit,
  resolveRepository,
  assertRefName,
  GitServiceError,
};
