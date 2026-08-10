import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, GitBranch, GitCommitHorizontal, GitCompareArrows, GitGraph, History, Search } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatRelativeDate } from "@/lib/utils";
import { AuthorAvatar } from "@/components/author-avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const STATUS_VARIANTS = {
  current: "success",
  healthy: "muted",
  ahead: "info",
  behind: "warning",
  diverged: "warning",
  stale: "warning",
  merged: "secondary",
  gone: "destructive",
};

const STATUS_FILTERS = [
  ["all", "All"],
  ["current", "Current"],
  ["ahead", "Ahead"],
  ["behind", "Behind"],
  ["diverged", "Diverged"],
  ["stale", "Stale"],
  ["merged", "Merged"],
  ["gone", "Gone"],
  ["remote", "Remote"],
];

const STATUS_ORDER = { current: 0, gone: 1, merged: 2, stale: 3, diverged: 4, behind: 5, ahead: 6, healthy: 7 };

function normalizeBranch(branch, currentBranch, defaultBranch) {
  const current = Boolean(branch.current || (!branch.remote && branch.name === currentBranch));
  const aheadOfUpstream = branch.aheadOfUpstream ?? branch.ahead ?? 0;
  const behindUpstream = branch.behindUpstream ?? branch.behind ?? 0;
  return {
    ...branch,
    current,
    upstream: branch.upstream || null,
    aheadOfUpstream,
    behindUpstream,
    goneUpstream: Boolean(branch.goneUpstream ?? branch.gone),
    defaultBranch: branch.defaultBranch ?? defaultBranch ?? null,
    aheadOfDefault: branch.aheadOfDefault ?? null,
    behindDefault: branch.behindDefault ?? null,
    lastCommitAt: branch.lastCommitAt ?? branch.date ?? null,
    status: branch.status ?? (current ? "current" : "healthy"),
    analyzed: Boolean(branch.analyzed),
  };
}

function StatusBadge({ status }) {
  return <Badge variant={STATUS_VARIANTS[status] ?? "muted"}>{status || "healthy"}</Badge>;
}

function UpstreamCell({ branch }) {
  if (branch.remote) return <span className="text-muted-foreground/60">—</span>;
  if (!branch.upstream) return <span className="text-muted-foreground/60">no upstream</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="max-w-36 truncate text-muted-foreground">{branch.upstream}</span>
      {branch.goneUpstream ? (
        <Badge variant="destructive">gone</Badge>
      ) : (
        <>
          {branch.aheadOfUpstream > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-500">
              <ArrowUp className="size-3" />
              {branch.aheadOfUpstream}
            </span>
          )}
          {branch.behindUpstream > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-500">
              <ArrowDown className="size-3" />
              {branch.behindUpstream}
            </span>
          )}
          {branch.aheadOfUpstream === 0 && branch.behindUpstream === 0 && (
            <span className="text-[11px] text-muted-foreground/60">in sync</span>
          )}
        </>
      )}
    </span>
  );
}

function DefaultDistance({ branch }) {
  if (!branch.analyzed || branch.aheadOfDefault == null || branch.behindDefault == null) {
    return <span className="text-muted-foreground/50">—</span>;
  }
  if (branch.aheadOfDefault === 0 && branch.behindDefault === 0) {
    return <span className="text-[11px] text-muted-foreground/60">in sync</span>;
  }
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-medium">
      <span className="inline-flex items-center gap-0.5 text-emerald-500" title="Commits ahead of default">
        <ArrowUp className="size-3" />
        {branch.aheadOfDefault}
      </span>
      <span className="inline-flex items-center gap-0.5 text-amber-500" title="Commits behind default">
        <ArrowDown className="size-3" />
        {branch.behindDefault}
      </span>
    </span>
  );
}

function DivergenceBar({ branch, direction, value, maximum, defaultBranch }) {
  const label = direction === "ahead" ? "Ahead" : "Behind";
  const tone = direction === "ahead" ? "bg-emerald-500/80" : "bg-amber-500/80";
  const width = value > 0 ? Math.max(6, (value / Math.max(maximum, 1)) * 100) : 0;
  const tooltip = [
    `${branch.name}: ${value} ${label.toLowerCase()} of ${defaultBranch || "default"}`,
    `Merge base: ${branch.mergeBase || "unavailable"}`,
    `Last activity: ${formatRelativeDate(branch.lastCommitAt)}`,
    `Upstream: ${branch.upstream || "none"}`,
  ].join(" · ");

  return (
    <div className="flex items-center gap-2" title={tooltip}>
      <span className="w-16 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/50">
        <div className={cn("h-full rounded-full transition-[width]", tone)} style={{ width: `${width}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-medium tabular-nums">{value}</span>
    </div>
  );
}

function DivergenceView({ branches, defaultBranch }) {
  const localBranches = branches.filter((branch) => !branch.remote);
  const analyzedBranches = localBranches.filter((branch) => branch.analyzed && branch.aheadOfDefault != null && branch.behindDefault != null);
  const maxAhead = Math.max(1, ...analyzedBranches.map((branch) => branch.aheadOfDefault));
  const maxBehind = Math.max(1, ...analyzedBranches.map((branch) => branch.behindDefault));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card/50 px-4 py-3 text-xs">
        <span className="text-muted-foreground">Divergence from <strong className="font-medium text-foreground">{defaultBranch || "the default branch"}</strong></span>
        <span className="text-muted-foreground">Independent scales · {analyzedBranches.length} analyzed</span>
      </div>
      {analyzedBranches.length === 0 ? (
        <div className="rounded-xl border border-border p-12 text-center text-sm text-muted-foreground">
          Branch divergence is not available yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-[minmax(180px,0.8fr)_minmax(260px,1fr)_minmax(260px,1fr)] gap-4 border-b border-border bg-card px-4 py-2.5 text-xs text-muted-foreground">
            <span>Branch</span>
            <span>Behind {defaultBranch || "default"}</span>
            <span>Ahead {defaultBranch || "default"}</span>
          </div>
          <div>
            {analyzedBranches.map((branch) => (
              <div key={branch.ref} className="grid grid-cols-[minmax(180px,0.8fr)_minmax(260px,1fr)_minmax(260px,1fr)] gap-4 border-b border-border/60 px-4 py-3 last:border-0 hover:bg-accent/25">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 truncate">
                    <GitBranch className={cn("size-4 shrink-0", branch.current ? "text-primary" : "text-muted-foreground")} />
                    <span className={cn("truncate text-sm font-medium", branch.current && "text-primary")}>{branch.name}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge status={branch.status} />
                    <span className="text-[11px] text-muted-foreground">{formatRelativeDate(branch.lastCommitAt)}</span>
                  </div>
                </div>
                <DivergenceBar branch={branch} direction="behind" value={branch.behindDefault} maximum={maxBehind} defaultBranch={defaultBranch} />
                <DivergenceBar branch={branch} direction="ahead" value={branch.aheadOfDefault} maximum={maxAhead} defaultBranch={defaultBranch} />
              </div>
            ))}
          </div>
        </div>
      )}
      {branches.some((branch) => branch.remote) && (
        <p className="text-[11px] text-muted-foreground">Remote refs are available in List view.</p>
      )}
    </div>
  );
}

export function BranchesView({
  repoPath,
  branches = [],
  currentBranch,
  defaultBranch,
  onShowInGraph,
  onCompareWithCurrent,
  onCompareWithDefault,
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [viewMode, setViewMode] = useState("list");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(Boolean(repoPath));
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    if (!repoPath || typeof api.branchIntelligence !== "function") {
      setReport(null);
      setLoading(false);
      setError(null);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);
    api
      .branchIntelligence({ repositoryPath: repoPath, defaultBranch })
      .then((response) => {
        if (!active) return;
        if (response?.ok) setReport(response.data);
        else setError(response?.error?.message || "Branch intelligence could not be loaded.");
      })
      .catch((requestError) => {
        if (active) setError(requestError?.message || "Branch intelligence could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [defaultBranch, repoPath]);

  const reportDefaultBranch = report?.defaultBranch ?? defaultBranch ?? currentBranch;
  const reportBranches = report?.branches ?? branches;
  const normalizedBranches = useMemo(
    () => reportBranches.map((branch) => normalizeBranch(branch, currentBranch, reportDefaultBranch)),
    [currentBranch, reportBranches, reportDefaultBranch],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    let list = normalizedBranches;
    if (statusFilter === "remote") list = list.filter((branch) => branch.remote);
    else if (statusFilter !== "all") list = list.filter((branch) => !branch.remote && branch.status === statusFilter);
    if (normalized) {
      list = list.filter((branch) =>
        [branch.name, branch.upstream, branch.author, branch.subject, branch.hash, branch.status].join(" ").toLowerCase().includes(normalized),
      );
    }
    return [...list].sort((left, right) => {
      if (sortBy === "activity") {
        return new Date(right.lastCommitAt || 0).getTime() - new Date(left.lastCommitAt || 0).getTime() || left.name.localeCompare(right.name);
      }
      if (sortBy === "ahead") {
        return (right.aheadOfDefault ?? -1) - (left.aheadOfDefault ?? -1) || left.name.localeCompare(right.name);
      }
      if (sortBy === "behind") {
        return (right.behindDefault ?? -1) - (left.behindDefault ?? -1) || left.name.localeCompare(right.name);
      }
      if (sortBy === "status") {
        return (STATUS_ORDER[left.status] ?? 99) - (STATUS_ORDER[right.status] ?? 99) || left.name.localeCompare(right.name);
      }
      return Number(right.current) - Number(left.current) || left.name.localeCompare(right.name);
    });
  }, [normalizedBranches, query, sortBy, statusFilter]);

  const remoteCount = normalizedBranches.filter((branch) => branch.remote).length;
  const filterCount = (filter) => {
    if (filter === "all") return normalizedBranches.length;
    if (filter === "remote") return remoteCount;
    return normalizedBranches.filter((branch) => !branch.remote && branch.status === filter).length;
  };
  const scopeMessage = report?.scope?.truncated
    ? `Showing intelligence for the ${report.scope.limit} most recently active local branches.`
    : report
      ? `Analyzed ${report.scope.analyzedLocal} local ${report.scope.analyzedLocal === 1 ? "branch" : "branches"}.`
      : "Branch intelligence is loading.";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="mr-auto">
          <h2 className="text-sm font-semibold leading-tight">Branches</h2>
          <p className="text-[11px] text-muted-foreground">
            Default: {reportDefaultBranch || "not resolved"}
            {report?.defaultBranchSource ? ` · ${report.defaultBranchSource} source` : ""}
          </p>
        </div>
        <Tabs value={viewMode} onValueChange={setViewMode}>
          <TabsList>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="divergence">Divergence</TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span>Sort</span>
          <select aria-label="Sort branches" value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring">
            <option value="name">Name</option>
            <option value="activity">Last activity</option>
            <option value="ahead">Ahead</option>
            <option value="behind">Behind</option>
            <option value="status">Status</option>
          </select>
        </label>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Filter branches" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter branches" className="h-8 pl-8 text-xs" />
        </div>
      </div>

      <div className="shrink-0 overflow-x-auto border-b border-border/60 px-4 py-2">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="h-auto min-w-max">
            {STATUS_FILTERS.map(([value, label]) => (
              <TabsTrigger key={value} value={value} className="h-7 px-2.5 text-xs">
                {label} {filterCount(value)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
        <span>{scopeMessage}</span>
        {loading && <span className="text-primary">Refreshing…</span>}
        {error && <span className="text-red-400">{error}</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {viewMode === "divergence" ? (
          <DivergenceView branches={filtered} defaultBranch={reportDefaultBranch} />
        ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="sticky top-0 z-[1] bg-card text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-medium">Branch</th>
                <th className="px-4 py-2.5 font-medium">Default distance</th>
                <th className="px-4 py-2.5 font-medium">Upstream</th>
                <th className="px-4 py-2.5 font-medium">Latest commit</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="w-36 px-3 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((branch) => (
                <tr
                  key={branch.ref}
                  className={cn("group border-b border-border/60 last:border-0 hover:bg-accent/25", branch.current && "bg-primary/[0.05]")}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <GitBranch className={cn("size-4", branch.current ? "text-primary" : "text-muted-foreground")} />
                      <span className={cn("font-medium", branch.current && "text-primary")}>{branch.name}</span>
                      {branch.current && <Badge variant="success">current</Badge>}
                      {branch.remote && <Badge variant="info">remote</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <DefaultDistance branch={branch} />
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <UpstreamCell branch={branch} />
                  </td>
                  <td className="max-w-md px-4 py-2.5">
                    <div className="truncate text-[13px]">{branch.subject || "—"}</div>
                    <div className="inline-flex items-center gap-2">
                      <code className="font-mono text-[11px] text-muted-foreground">{branch.shortHash}</code>
                      {branch.author && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <AuthorAvatar name={branch.author} size={16} />
                          {branch.author}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={branch.status} />
                      <span className="text-xs text-muted-foreground">{formatRelativeDate(branch.lastCommitAt)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Show ${branch.name} in graph`}
                            onClick={() => onShowInGraph?.(branch.name)}
                            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            <GitGraph className="size-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Show in Graph</TooltipContent>
                      </Tooltip>
                      {!branch.remote && branch.name !== reportDefaultBranch && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={`Compare ${branch.name} with default ${reportDefaultBranch}`}
                              onClick={() => onCompareWithDefault?.(reportDefaultBranch, branch.name)}
                              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <GitCompareArrows className="size-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Compare with Default</TooltipContent>
                        </Tooltip>
                      )}
                      {!branch.current && !branch.remote && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={`Compare ${branch.name} with current ${currentBranch}`}
                              onClick={() => onCompareWithCurrent?.(branch.name)}
                              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <History className="size-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Compare with Current</TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Open commits for ${branch.name}`}
                            onClick={() => onShowInGraph?.(branch.name)}
                            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            <GitCommitHorizontal className="size-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Open commits</TooltipContent>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="p-12 text-center text-sm text-muted-foreground">No branches match the filter.</div>}
        </div>
        )}
      </div>
    </div>
  );
}
