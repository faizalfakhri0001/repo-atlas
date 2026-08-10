import { useEffect, useState } from "react";
import { AlertCircle, ChevronRight, HeartPulse, LoaderCircle, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const GRADE_VARIANTS = { healthy: "success", attention: "warning", warning: "destructive" };
const CATEGORY_LABELS = {
  workingTree: "Working Tree",
  branches: "Branches",
  repository: "Repository",
  activity: "Activity",
  ownership: "Ownership",
};

function HealthStatus({ grade }) {
  return <Badge variant={GRADE_VARIANTS[grade] ?? "muted"}>{grade === "healthy" ? "Healthy" : grade === "attention" ? "Attention" : "Warning"}</Badge>;
}

function CategoryStatus({ name, category }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-xs">
      <span className="text-muted-foreground">{CATEGORY_LABELS[name] ?? name}</span>
      <span className={cn("font-medium", category.status === "healthy" ? "text-emerald-400" : category.status === "attention" ? "text-amber-400" : "text-red-400")}>
        {category.status === "healthy" ? "Healthy" : category.status === "attention" ? `${category.signalCount} issue${category.signalCount === 1 ? "" : "s"}` : "Warning"}
      </span>
    </div>
  );
}

export function HealthSummaryCard({ repoPath, revision, onOpenDetails }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
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

  return (
    <Card className="mt-5">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <HeartPulse className="size-4 text-primary" />
            <CardTitle>Repository Health</CardTitle>
          </div>
          <CardDescription className="mt-1">Explainable Git and repository signals. This is not a security or code-quality audit.</CardDescription>
        </div>
        {state.data && <HealthStatus grade={state.data.grade} />}
      </CardHeader>
      <CardContent>
        {state.loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Health analysis… Overview remains available while this loads.
          </div>
        ) : state.error ? (
          <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1"><div>{state.error}</div><Button variant="outline" size="sm" className="mt-3" onClick={() => setReloadToken((value) => value + 1)}><RefreshCw /> Try again</Button></div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(180px,0.45fr)_minmax(0,1fr)_auto] lg:items-center">
            <div className="flex items-center gap-3">
              <div className="text-4xl font-semibold tracking-tight tabular-nums">{state.data?.score ?? "—"}<span className="text-lg text-muted-foreground"> / 100</span></div>
              <div><HealthStatus grade={state.data?.grade} /><div className="mt-1 text-[11px] text-muted-foreground">Deterministic score with additive penalties</div></div>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-2">
              {Object.entries(state.data?.categories ?? {}).map(([key, category]) => <CategoryStatus key={key} name={key} category={category} />)}
            </div>
            <Button variant="outline" onClick={() => onOpenDetails?.()}>
              View health details <ChevronRight />
            </Button>
          </div>
        )}
        {!state.loading && !state.error && state.data?.scope?.sourceTruncated && (
          <div className="mt-3 text-[11px] text-muted-foreground">Scope is bounded; review the health details for the analyzed commit, branch, and tracked-file counts.</div>
        )}
      </CardContent>
    </Card>
  );
}
