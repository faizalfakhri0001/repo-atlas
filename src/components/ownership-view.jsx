import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronRight, FolderTree, LoaderCircle, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDate, formatRelativeDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CONCENTRATION_VARIANTS = {
  Distributed: "success",
  "Moderately concentrated": "warning",
  "Highly concentrated": "destructive",
};

function percent(value) {
  return `${Math.round(Number(value ?? 0) * 100)}%`;
}

function count(value) {
  return Number(value ?? 0).toLocaleString();
}

function ContributorName({ contributor }) {
  if (!contributor) return <span className="text-muted-foreground">No contributor</span>;
  return <span title={contributor.email || contributor.name}>{contributor.name || contributor.email || "Unknown contributor"}</span>;
}

function OwnershipDetail({ node }) {
  if (!node) return null;
  return (
    <aside className="border-t border-border bg-card/30 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs text-primary">{node.path || "Repository"}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{node.type === "directory" ? "Directory summary" : "File summary"}</div>
        </div>
        <Badge variant={CONCENTRATION_VARIANTS[node.concentrationLabel] ?? "muted"}>{node.concentrationLabel}</Badge>
      </div>
      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2"><div className="text-muted-foreground">Primary contributor</div><div className="mt-1 truncate font-medium"><ContributorName contributor={node.primaryContributor} /></div></div>
        <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2"><div className="text-muted-foreground">Commit share</div><div className="mt-1 font-medium tabular-nums">{percent(node.primaryContributor?.commitShare)}</div></div>
        <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2"><div className="text-muted-foreground">Change-volume share</div><div className="mt-1 font-medium tabular-nums">{percent(node.primaryContributor?.churnShare)}</div></div>
        <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2"><div className="text-muted-foreground">Last activity</div><div className="mt-1 font-medium">{node.lastChangedAt ? formatRelativeDate(node.lastChangedAt) : "—"}</div></div>
      </div>
      <section className="mt-4">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Top contributors</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(node.topContributors ?? []).map((contributor) => (
            <div key={contributor.key} className="rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-xs">
              <div className="truncate font-medium"><ContributorName contributor={contributor} /></div>
              <div className="mt-1 flex gap-3 text-muted-foreground"><span>commits {percent(contributor.commitShare)}</span><span>churn {percent(contributor.churnShare)}</span><span>score {percent(contributor.ownershipScore)}</span></div>
            </div>
          ))}
          {(node.topContributors ?? []).length === 0 && <div className="text-xs text-muted-foreground">No contributor activity in this period.</div>}
        </div>
      </section>
    </aside>
  );
}

export function OwnershipView({ repoPath }) {
  const [period, setPeriod] = useState("all");
  const [currentPath, setCurrentPath] = useState("");
  const [selectedNode, setSelectedNode] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });
    api
      .ownership({ repositoryPath: repoPath, period, path: currentPath, limit: 100 })
      .then((response) => {
        if (cancelled) return;
        if (!response?.ok) {
          setState({ loading: false, error: response?.error?.message ?? "Failed to load ownership.", data: null });
          return;
        }
        setState({ loading: false, error: null, data: response.data ?? null });
        setSelectedNode(null);
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error: error?.message ?? "Failed to load ownership.", data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [currentPath, period, reloadToken, repoPath]);

  const breadcrumbs = useMemo(() => {
    const parts = currentPath ? currentPath.split("/") : [];
    return [{ path: "", label: "Repository" }, ...parts.map((part, index) => ({ path: parts.slice(0, index + 1).join("/"), label: part }))];
  }, [currentPath]);

  if (state.loading) {
    return <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Analyzing contributor ownership…</div>;
  }

  if (state.error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex max-w-lg items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-400">
          <AlertCircle className="mt-0.5 size-5 shrink-0" />
          <div><div className="font-medium">Ownership analysis failed</div><div className="mt-1 text-xs">{state.error}</div><Button variant="outline" size="sm" className="mt-4" onClick={() => setReloadToken((value) => value + 1)}><RefreshCw /> Try again</Button></div>
        </div>
      </div>
    );
  }

  const data = state.data ?? {};
  const summary = data.summary ?? {};
  const scope = data.scope ?? {};

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><FolderTree className="size-4 text-sky-400" /><h2 className="text-sm font-semibold">Ownership</h2></div>
          <p className="mt-1 text-xs text-muted-foreground">Historical contribution proxy by file and directory; not legal ownership or code ownership.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex h-8 items-center rounded-md border border-input bg-background/70 px-2 text-xs"><select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Ownership period" className="bg-transparent text-foreground outline-none"><option value="all">All time</option><option value="12m">Last 12 months</option></select></label>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setReloadToken((value) => value + 1)} title="Refresh ownership" aria-label="Refresh ownership"><RefreshCw /></Button>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card/30 px-5 py-3 text-[11px] text-muted-foreground">
        {breadcrumbs.map((breadcrumb, index) => <span key={breadcrumb.path} className="flex items-center gap-1">{index > 0 && <ChevronRight className="size-3" />}<button type="button" className={cn("hover:text-foreground", breadcrumb.path === currentPath && "font-medium text-foreground")} onClick={() => setCurrentPath(breadcrumb.path)}>{breadcrumb.label}</button></span>)}
        <span className="ml-auto">{count(scope.totalFiles)} files · {count(scope.processedCommits)} commits analyzed</span>
        {scope.truncated && <Badge variant="warning">Bounded analysis</Badge>}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-5 py-3 text-xs">
        <div><span className="text-muted-foreground">Primary contributor: </span><strong><ContributorName contributor={summary.primaryContributor} /></strong></div>
        <div><span className="text-muted-foreground">Commits: </span><strong className="tabular-nums">{count(summary.totalCommits)}</strong></div>
        <div><span className="text-muted-foreground">Churn: </span><strong className="tabular-nums">{count(summary.totalChurn)}</strong></div>
        <Badge variant={CONCENTRATION_VARIANTS[summary.concentrationLabel] ?? "muted"}>{summary.concentrationLabel ?? "Distributed"} · {percent(summary.top1Share)}</Badge>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {data.nodes?.length ? (
          <table className="w-full min-w-[900px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-background/95 text-[11px] text-muted-foreground backdrop-blur"><tr className="border-b border-border"><th className="px-5 py-2.5 font-medium">Area</th><th className="px-3 py-2.5 font-medium">Primary contributor</th><th className="px-3 py-2.5 font-medium text-right">Commit share</th><th className="px-3 py-2.5 font-medium text-right">Change-volume share</th><th className="px-3 py-2.5 font-medium text-right">Concentration</th><th className="px-5 py-2.5 font-medium text-right">Activity</th></tr></thead>
            <tbody>{data.nodes.map((node) => (
              <tr key={node.path} className={cn("border-b border-border/60 hover:bg-accent/30", selectedNode?.path === node.path && "bg-primary/5")}>
                <td className="max-w-[360px] px-5 py-3"><button type="button" className="flex max-w-full items-center gap-2 text-left font-mono text-[11px] text-primary hover:underline" onClick={() => node.type === "directory" ? setCurrentPath(node.path) : setSelectedNode(node)}><FolderTree className={cn("size-3.5 shrink-0", node.type === "file" && "opacity-0")} /><span className="truncate">{node.path || node.name}</span></button><div className="mt-1 text-[10px] text-muted-foreground">{node.type} · {count(node.fileCount)} files</div></td>
                <td className="max-w-40 truncate px-3 py-3"><ContributorName contributor={node.primaryContributor} /></td>
                <td className="px-3 py-3 text-right tabular-nums">{percent(node.primaryContributor?.commitShare)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{percent(node.primaryContributor?.churnShare)}</td>
                <td className="px-3 py-3 text-right"><Badge variant={CONCENTRATION_VARIANTS[node.concentrationLabel] ?? "muted"}>{percent(node.top1Share)}</Badge></td>
                <td className="px-5 py-3 text-right text-muted-foreground" title={node.lastChangedAt ? formatDate(node.lastChangedAt) : "No known activity"}>{node.lastChangedAt ? formatRelativeDate(node.lastChangedAt) : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground"><div><FolderTree className="mx-auto mb-3 size-7 opacity-40" />No ownership activity matches this period or directory.</div></div>
        )}
        <OwnershipDetail node={selectedNode} />
      </div>
    </div>
  );
}
