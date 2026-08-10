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

function parseDivergenceCounts(raw) {
  const [behindRaw, aheadRaw] = String(raw || "").trim().split(/\s+/);
  return {
    ahead: Number(aheadRaw) || 0,
    behind: Number(behindRaw) || 0,
  };
}

function getAgeDays(value, now = Date.now()) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.floor((now - timestamp) / (24 * 60 * 60 * 1000)));
}

function getBranchStatus({ current, gone, merged, stale, ahead, behind }) {
  if (current) return "current";
  if (gone) return "gone";
  if (merged) return "merged";
  if (stale) return "stale";
  if (ahead > 0 && behind > 0) return "diverged";
  if (behind > 0) return "behind";
  if (ahead > 0) return "ahead";
  return "healthy";
}

function selectLocalBranches(branches, currentBranch) {
  const local = branches.filter((branch) => !branch.remote);
  return [...local]
    .sort((left, right) => {
      const currentDifference = Number(right.name === currentBranch) - Number(left.name === currentBranch);
      if (currentDifference !== 0) return currentDifference;
      return new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime();
    })
    .slice(0, MAX_LOCAL_BRANCHES);
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    }),
  );

  return results;
}

function buildBranchRecord(branch, context = {}) {
  const {
    defaultBranch = null,
    currentBranch = "",
    aheadOfDefault = null,
    behindDefault = null,
    mergeBase = null,
    mergedIntoDefault = false,
    analyzed = false,
    now = Date.now(),
  } = context;
  const ageDays = getAgeDays(branch.date, now);
  const goneUpstream = Boolean(branch.gone);
  const aheadOfUpstream = Number(branch.ahead) || 0;
  const behindUpstream = Number(branch.behind) || 0;
  const stale = !branch.remote && ageDays !== null && ageDays >= STALE_AFTER_DAYS;
  const veryStale = !branch.remote && ageDays !== null && ageDays >= VERY_STALE_AFTER_DAYS;

  return {
    name: branch.name,
    ref: branch.ref,
    hash: branch.hash,
    shortHash: branch.shortHash,
    current: branch.name === currentBranch && !branch.remote,
    remote: branch.remote,
    upstream: branch.upstream || null,
    aheadOfUpstream,
    behindUpstream,
    goneUpstream,
    defaultBranch,
    aheadOfDefault,
    behindDefault,
    mergeBase,
    mergedIntoDefault,
    lastCommitAt: branch.date || null,
    ageDays,
    stale,
    veryStale,
    status: getBranchStatus({
      current: branch.name === currentBranch && !branch.remote,
      gone: goneUpstream,
      merged: mergedIntoDefault,
      stale,
      ahead: aheadOfDefault ?? 0,
      behind: behindDefault ?? 0,
    }),
    analyzed,
    author: branch.author,
    subject: branch.subject,
    date: branch.date,
    ahead: aheadOfUpstream,
    behind: behindUpstream,
    gone: goneUpstream,
  };
}

async function readBranchMetadata(repository) {
  const [currentResult, branchResult, originHeadResult] = await Promise.all([
    runGit(repository.rootPath, ["symbolic-ref", "--short", "--quiet", "HEAD"], { allowFailure: true }),
    runGit(repository.rootPath, [
      "for-each-ref",
      "--sort=-committerdate",
      "--format=%(refname)%00%(refname:short)%00%(objectname)%00%(upstream:short)%00%(committerdate:iso-strict)%00%(authorname)%00%(subject)%00%(upstream:track)",
      "refs/heads",
      "refs/remotes",
    ]),
    runGit(repository.rootPath, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { allowFailure: true }),
  ]);

  return {
    currentBranch: currentResult.failed ? "Detached HEAD" : currentResult.stdout.trim(),
    branches: parseBranchRows(branchResult.stdout, currentResult.stdout.trim()),
    originHead: originHeadResult.failed ? "" : originHeadResult.stdout.trim(),
  };
}

async function branchIntelligence(repositoryPath, options = {}) {
  const repository = await resolveRepository(repositoryPath);
  const metadata = await readBranchMetadata(repository);
  const requestedDefault = typeof options.defaultBranch === "string" ? options.defaultBranch.trim() : "";
  let defaultBranchInfo = resolveDefaultBranch(metadata);

  if (requestedDefault) {
    const requestedRef = assertRefName(requestedDefault);
    defaultBranchInfo = {
      defaultBranch: requestedRef.replace(/^origin\//, ""),
      defaultBranchRef: requestedRef,
      defaultBranchSource: "explicit",
    };
  }

  let defaultCommit = null;
  if (defaultBranchInfo.defaultBranchRef) {
    defaultCommit = await resolveCommit(repository.rootPath, defaultBranchInfo.defaultBranchRef);
  }

  const now = Date.now();
  const localBranches = selectLocalBranches(metadata.branches, metadata.currentBranch);
  const localRefs = new Set(localBranches.map((branch) => branch.ref));
  const remoteBranches = metadata.branches.filter((branch) => branch.remote);
  const analyzed = defaultCommit
      ? await mapWithConcurrency(localBranches, BRANCH_ANALYSIS_CONCURRENCY, async (branch) => {
        const countResult = await runGit(
          repository.rootPath,
          ["rev-list", "--left-right", "--count", `${defaultCommit.hash}...${branch.hash}`, "--"],
          { allowFailure: true },
        );
        const mergeBaseResult = await runGit(repository.rootPath, ["merge-base", defaultCommit.hash, branch.hash], { allowFailure: true });
        const mergedResult = await runGit(repository.rootPath, ["merge-base", "--is-ancestor", branch.hash, defaultCommit.hash], { allowFailure: true });
        const counts = countResult.failed ? { ahead: 0, behind: 0 } : parseDivergenceCounts(countResult.stdout);
        return buildBranchRecord(branch, {
          defaultBranch: defaultBranchInfo.defaultBranch,
          currentBranch: metadata.currentBranch,
          aheadOfDefault: counts.ahead,
          behindDefault: counts.behind,
          mergeBase: mergeBaseResult.failed ? null : mergeBaseResult.stdout.trim() || null,
          mergedIntoDefault: mergedResult.code === 0 && branch.name !== defaultBranchInfo.defaultBranch,
          analyzed: true,
          now,
        });
      })
    : localBranches.map((branch) =>
        buildBranchRecord(branch, {
          defaultBranch: defaultBranchInfo.defaultBranch,
          currentBranch: metadata.currentBranch,
          analyzed: false,
          now,
        }),
      );

  const remoteRecords = remoteBranches.map((branch) =>
    buildBranchRecord(branch, {
      defaultBranch: defaultBranchInfo.defaultBranch,
      currentBranch: metadata.currentBranch,
      analyzed: false,
      now,
    }),
  );

  const omittedLocal = metadata.branches.filter((branch) => !branch.remote && !localRefs.has(branch.ref)).length;
  return {
    ...defaultBranchInfo,
    defaultBranchHash: defaultCommit?.hash ?? null,
    currentBranch: metadata.currentBranch,
    scope: {
      totalLocal: metadata.branches.filter((branch) => !branch.remote).length,
      analyzedLocal: analyzed.length,
      omittedLocal,
      limit: MAX_LOCAL_BRANCHES,
      concurrency: BRANCH_ANALYSIS_CONCURRENCY,
      truncated: omittedLocal > 0,
    },
    branches: [...analyzed, ...remoteRecords],
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
  parseDivergenceCounts,
  getAgeDays,
  getBranchStatus,
  selectLocalBranches,
  mapWithConcurrency,
  buildBranchRecord,
  readBranchMetadata,
  branchIntelligence,
  runGit,
  resolveCommit,
  resolveRepository,
  assertRefName,
  GitServiceError,
};
