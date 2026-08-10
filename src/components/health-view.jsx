import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronRight, HeartPulse, LoaderCircle, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatRelativeDate } from "@/lib/utils";
import { resolveHealthNavigation } from "@/features/health/health-actions";

const GRADE_VARIANTS = { healthy: "success", attention: "warning", warning: "destructive" };
const SEVERITY_VARIANTS = { high: "destructive", medium: "warning", low: "muted", info: "info" };
const CATEGORY_LABELS = { workingTree: "Working Tree", branches: "Branch Hygiene", repository: "Repository", activity: "History / Activity", ownership: "Ownership" };
const ACTION_LABELS = { workspace: "Open Workspace", branches: "View Branches", files: "Open Files", hotspots: "Open Hotspots", ownership: "Open Ownership", commits: "Open Commits" };

function gradeLabel(value) {
  return value === "healthy" ? "Healthy" : value === "attention" ? "Attention" : "Warning";
}

function SignalCard({ signal, onAction }) {
  const view = signal.action?.payload?.view;
  const runAction = (action) => {
    const navigation = resolveHealthNavigation(action);
    if (navigation) onAction?.(navigation);
  };
  return (
    <Card className="bg-card/70">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={SEVERITY_VARIANTS[signal.severity] ?? "muted"}>{signal.severity}</Badge>
              <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[signal.category] ?? signal.category}</span>
              {signal.penalty > 0 && <span className="text-xs font-medium text-amber-400">−{signal.penalty} points</span>}
            </div>
            <h3 className="mt-2 text-sm font-medium">{signal.title}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{signal.description}</p>
          </div>
          {view && <Button variant="outline" size="sm" onClick={() => runAction(signal.action)}>{ACTION_LABELS[view] ?? "Open view"}<ChevronRight /></Button>}
        </div>
        {signal.relatedActions?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{signal.relatedActions.map((action) => { const relatedView = action?.payload?.view; return <Button key={relatedView} variant="ghost" size="sm" onClick={() => runAction(action)}>{ACTION_LABELS[relatedView] ?? "Open related view"}<ChevronRight /></Button>; })}</div>}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          {signal.metric !== undefined && <span>Metric: <strong className="font-medium text-foreground">{Number(signal.metric).toLocaleString()}</strong></span>}
          <span>Penalty: <strong className="font-medium text-foreground">{signal.penalty > 0 ? signal.penalty : "none"}</strong></span>
        </div>
        {signal.details?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {signal.details.slice(0, 8).map((detail) => <code key={detail} className="rounded bg-muted/60 px-1.5 py-1 text-[10px] text-muted-foreground">{detail}</code>)}
            {signal.details.length > 8 && <span className="px-1.5 py-1 text-[10px] text-muted-foreground">+{signal.details.length - 8} more</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryCard({ category, name }) {
  return (
    <Card className="bg-card/70">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">{CATEGORY_LABELS[name] ?? name}</div>
          <Badge variant={category.status === "healthy" ? "success" : category.status === "attention" ? "warning" : "destructive"}>{gradeLabel(category.status)}</Badge>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="text-2xl font-semibold tabular-nums">{category.score}<span className="text-sm text-muted-foreground"> / 100</span></div>
          <div className="text-right text-[11px] text-muted-foreground">{category.signalCount} signal{category.signalCount === 1 ? "" : "s"}<br />{category.penalty} penalty points</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function HealthView({ repoPath, revision, onNavigate }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [severity, setSeverity] = useState("all");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });
    if (typeof api.repositoryHealth !== "function") {
      setState({ loading: false, error: "Repository health is unavailable in this runtime.", data: null });
      return () => {
        cancelled = true;
      };
    }
    api
      .repositoryHealth({ repositoryPath: repoPath })
      .then((response) => {
        if (cancelled) return;
        if (!response?.ok) {
          setState({ loading: false, error: response?.error?.message ?? "Repository health could not be loaded.", data: null });
          return;
        }
        setState({ loading: false, error: null, data: response.data ?? null });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error: error?.message ?? "Repository health could not be loaded.", data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken, repoPath, revision]);

  const signals = useMemo(
    () => (state.data?.signals ?? []).filter((signal) => severity === "all" || signal.severity === severity),
    [severity, state.data?.signals],
  );

  if (state.loading) return <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Analyzing repository health…</div>;
  if (state.error) {
    return <div className="flex h-full items-center justify-center p-8"><div className="flex max-w-lg items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-400"><AlertCircle className="mt-0.5 size-5 shrink-0" /><div><div className="font-medium">Repository health failed</div><div className="mt-1 text-xs">{state.error}</div><Button variant="outline" size="sm" className="mt-4" onClick={() => setReloadToken((value) => value + 1)}><RefreshCw /> Try again</Button></div></div></div>;
  }

  const data = state.data ?? {};
  const facts = data.facts ?? {};
  const scope = data.scope ?? {};
  return (
    <div className="h-full overflow-auto p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><HeartPulse className="size-4 text-primary" /><h2 className="text-sm font-semibold">Repository Health</h2><Badge variant={GRADE_VARIANTS[data.grade] ?? "muted"}>{gradeLabel(data.grade)}</Badge></div>
          <p className="mt-1 text-xs text-muted-foreground">Signals from Git metadata and local repository history. Scores explain observations; they do not judge code quality or security.</p>
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => setReloadToken((value) => value + 1)} title="Refresh health" aria-label="Refresh health"><RefreshCw /></Button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(220px,0.45fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader><CardTitle>Health score</CardTitle><CardDescription>Additive penalties from visible signals.</CardDescription></CardHeader>
          <CardContent><div className="text-5xl font-semibold tracking-tight tabular-nums">{data.score ?? "—"}<span className="text-xl text-muted-foreground"> / 100</span></div><div className="mt-3 flex items-center gap-2"><Badge variant={GRADE_VARIANTS[data.grade] ?? "muted"}>{gradeLabel(data.grade)}</Badge><span className="text-xs text-muted-foreground">{data.signals?.length ?? 0} visible signals</span></div></CardContent>
        </Card>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Object.entries(data.categories ?? {}).map(([name, category]) => <CategoryCard key={name} name={name} category={category} />)}</div>
      </div>

      <Card className="mt-5">
        <CardHeader className="flex-row flex-wrap items-end justify-between gap-3"><div><CardTitle>Signals</CardTitle><CardDescription>Each signal includes its raw metric, explanation, and optional navigation action.</CardDescription></div><label className="flex h-8 items-center rounded-md border border-input bg-background/70 px-2 text-xs"><span className="mr-2 text-muted-foreground">Severity</span><select aria-label="Filter health signals" value={severity} onChange={(event) => setSeverity(event.target.value)} className="bg-transparent text-foreground outline-none"><option value="all">All</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="info">Info</option></select></label></CardHeader>
        <CardContent className="space-y-3">{signals.length > 0 ? signals.map((signal) => <SignalCard key={signal.id} signal={signal} onAction={(action) => action && onNavigate?.(action.view, action.payload)} />) : <div className="rounded-lg border border-border/70 bg-background/40 p-6 text-center text-sm text-muted-foreground"><CheckCircle2 className="mx-auto mb-2 size-6 text-emerald-400" />No signals match this filter.</div>}</CardContent>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Repository facts</CardTitle><CardDescription>Raw context used by the current rules.</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3"><Fact label="Commits analyzed" value={facts.processedCommits} /><Fact label="Total commits" value={facts.totalCommits} /><Fact label="Local branches" value={facts.localBranchCount} /><Fact label="Stale branches" value={facts.staleBranchCount} /><Fact label="Behind branches" value={facts.behindBranchCount} /><Fact label="Gone upstream" value={facts.goneBranchCount} /><Fact label="Tracked files" value={facts.trackedFileCount} /><Fact label="Large files" value={facts.largeFileCount} /><Fact label="High-activity files" value={facts.highActivityFileCount} /><Fact label="Concentrated hotspots" value={facts.concentratedHotspotCount} /><Fact label="Conflicts" value={facts.conflictedFileCount} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Activity context</CardTitle><CardDescription>Dates and scope help explain what the score covers.</CardDescription></CardHeader><CardContent className="space-y-3 text-xs"><div className="flex justify-between gap-3"><span className="text-muted-foreground">Last commit</span><span title={formatDate(facts.lastCommitAt)}>{facts.lastCommitAt ? formatRelativeDate(facts.lastCommitAt) : "No commit history"}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Current branch</span><span>{facts.currentBranch || "Detached HEAD"}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Default branch</span><span>{facts.defaultBranch || "Not resolved"}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Working changes</span><span>{Number(facts.dirtyFileCount ?? 0).toLocaleString()}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Ownership threshold</span><span>{Math.round(Number(facts.ownershipConcentrationThreshold ?? 0) * 100)}% on high-activity files</span></div>{scope.sourceTruncated && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-amber-400">This report is bounded. Commits, branches, tracked-file, or hotspot metadata were truncated; metrics are not a claim about the entire repository.</div>}</CardContent></Card>
      </div>
    </div>
  );
}

function Fact({ label, value }) {
  return <div className="rounded-lg border border-border/70 bg-background/40 p-3"><div className="text-muted-foreground">{label}</div><div className="mt-1 text-lg font-medium tabular-nums">{Number(value ?? 0).toLocaleString()}</div></div>;
}
