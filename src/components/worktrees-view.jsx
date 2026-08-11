import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  FolderGit2,
  GitBranch,
  Info,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, truncateMiddle } from "@/lib/utils";

function worktreeName(worktree) {
  const value = String(worktree?.path ?? "");
  return value.split(/[\\/]/).filter(Boolean).pop() || value || "Unnamed worktree";
}

function statusLabel(worktree, detail) {
  const dirty = detail?.dirty ?? worktree?.dirty;
  const changes = detail?.changes ?? worktree?.changes;
  if (!worktree?.exists || worktree?.prunable) return { label: "Unavailable", variant: "warning" };
  if (dirty === true) return { label: `${changes ?? 0} change${changes === 1 ? "" : "s"}`, variant: "warning" };
  if (dirty === false) return { label: "Clean", variant: "success" };
  return { label: "Status not loaded", variant: "muted" };
}

export function WorktreesView({
  worktrees = [],
  repoPath,
  currentWorktreePath,
  onRefresh,
}) {
  const [selectedPath, setSelectedPath] = useState(currentWorktreePath || worktrees.find((worktree) => worktree.main)?.path || worktrees[0]?.path || "");
  const [details, setDetails] = useState({});
  const [detailErrors, setDetailErrors] = useState({});
  const [loadingPath, setLoadingPath] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const selectedWorktree = useMemo(
    () => worktrees.find((worktree) => worktree.path === selectedPath) ?? null,
    [selectedPath, worktrees],
  );
  const selectedDetail = selectedWorktree ? details[selectedWorktree.path] : null;
  const selectedError = selectedWorktree ? detailErrors[selectedWorktree.path] : null;

  useEffect(() => {
    if (worktrees.length === 0) {
      setSelectedPath("");
      return;
    }
    if (worktrees.some((worktree) => worktree.path === selectedPath)) return;
    if (currentWorktreePath && worktrees.some((worktree) => worktree.path === currentWorktreePath)) {
      setSelectedPath(currentWorktreePath);
    } else {
      setSelectedPath(worktrees.find((worktree) => worktree.main)?.path || worktrees[0].path);
    }
  }, [currentWorktreePath, selectedPath, worktrees]);

  useEffect(() => {
    if (!selectedWorktree || !repoPath) return undefined;
    let active = true;
    setLoadingPath(selectedWorktree.path);
    setDetailErrors((current) => ({ ...current, [selectedWorktree.path]: "" }));

    const load = async () => {
      try {
        if (typeof api.worktreeDetails !== "function") {
          if (active) setDetails((current) => ({ ...current, [selectedWorktree.path]: { worktree: selectedWorktree, dirty: selectedWorktree.dirty, changes: selectedWorktree.changes, status: null } }));
          return;
        }
        const response = await api.worktreeDetails({ repositoryPath: repoPath, path: selectedWorktree.path });
        if (!response?.ok) throw new Error(response?.error?.message || "Worktree status could not be loaded.");
        if (active) setDetails((current) => ({ ...current, [selectedWorktree.path]: response.data }));
      } catch (error) {
        if (active) setDetailErrors((current) => ({ ...current, [selectedWorktree.path]: error?.message || "Worktree status could not be loaded." }));
      } finally {
        if (active) setLoadingPath("");
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [repoPath, selectedWorktree]);

  const refresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const mainWorktrees = worktrees.filter((worktree) => worktree.main || worktree.path === currentWorktreePath);
  const additionalWorktrees = worktrees.filter((worktree) => !mainWorktrees.includes(worktree));

  return (
    <div className="h-full overflow-auto p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Worktrees</h2>
          <p className="text-sm text-muted-foreground">Inspect every worktree registered by the repository without changing Git state.</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={cn(refreshing && "animate-spin")} /> Refresh
        </Button>
      </div>

      {worktrees.length > 0 ? (
        <div className="space-y-5">
          {mainWorktrees.length > 0 && (
            <WorktreeGroup label="Main worktree" worktrees={mainWorktrees} selectedPath={selectedPath} details={details} onSelect={setSelectedPath} />
          )}
          {additionalWorktrees.length > 0 && (
            <WorktreeGroup label="Additional worktrees" worktrees={additionalWorktrees} selectedPath={selectedPath} details={details} onSelect={setSelectedPath} />
          )}
          {selectedWorktree && (
            <WorktreeDetails
              worktree={selectedWorktree}
              detail={selectedDetail}
              error={selectedError}
              loading={loadingPath === selectedWorktree.path}
              currentPath={currentWorktreePath}
              onReveal={() => api.revealRepository(selectedWorktree.path)}
            />
          )}
        </div>
      ) : (
        <Empty label="No worktrees found." />
      )}
    </div>
  );
}

function WorktreeGroup({ label, worktrees, selectedPath, details, onSelect }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{worktrees.length}</span>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {worktrees.map((worktree) => {
          const state = statusLabel(worktree, details[worktree.path]);
          const selected = worktree.path === selectedPath;
          return (
            <Card key={`${worktree.path}-${worktree.head}`} className={cn("transition-colors", selected && "border-primary/60 bg-primary/[0.04]")}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <button type="button" className="min-w-0 text-left" aria-pressed={selected} onClick={() => onSelect(worktree.path)}>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <FolderGit2 className="size-4 text-primary" />
                      <span className="truncate">{worktreeName(worktree)}</span>
                      {selected && <Badge variant="info">Selected</Badge>}
                    </CardTitle>
                    <CardDescription className="mt-1" title={worktree.path}>{truncateMiddle(worktree.path, 46, 20)}</CardDescription>
                  </button>
                  <Badge variant={state.variant}>{state.label}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  {worktree.detached && <Badge variant="warning"><Unplug className="size-3" />detached</Badge>}
                  {worktree.locked && <Badge variant="destructive"><LockKeyhole className="size-3" />locked</Badge>}
                  {worktree.prunable && <Badge variant="warning">prunable</Badge>}
                  {worktree.bare && <Badge variant="muted">bare</Badge>}
                  {worktree.exists === false && <Badge variant="destructive">missing</Badge>}
                </div>
                <div className="flex items-center gap-3">
                  <GitBranch className="size-4 text-muted-foreground" />
                  <span className="w-16 text-muted-foreground">Branch</span>
                  <span className="truncate">{worktree.branch || "Detached HEAD"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="size-4 text-center font-mono text-xs text-muted-foreground">#</span>
                  <span className="w-16 text-muted-foreground">HEAD</span>
                  <code className="text-xs">{worktree.shortHead || worktree.head?.slice(0, 12) || "—"}</code>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function WorktreeDetails({
  worktree,
  detail,
  error,
  loading,
  currentPath,
  onReveal,
}) {
  const status = detail?.status;
  const isCurrent = worktree.path === currentPath;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base"><Info className="size-4 text-primary" />{worktreeName(worktree)} details</CardTitle>
            <CardDescription title={worktree.path}>{worktree.path}</CardDescription>
          </div>
          {isCurrent && <Badge variant="success"><CheckCircle2 className="size-3" />Current session</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 rounded-lg bg-muted/35 p-3 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Checking working tree status…</div>
        ) : error ? (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-300"><Info className="mt-0.5 size-4 shrink-0" />{error}</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DetailMetric label="Branch" value={status?.branch || worktree.branch || "Detached HEAD"} />
            <DetailMetric label="HEAD" value={status?.oid?.slice(0, 12) || worktree.shortHead || worktree.head?.slice(0, 12) || "—"} mono />
            <DetailMetric label="Changes" value={detail?.dirty ? `${detail.changes ?? 0} files` : "Clean"} />
            <DetailMetric label="Tracking" value={status?.upstream || "No upstream"} />
          </div>
        )}

        {status?.files?.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Changed files</div>
            <div className="grid gap-1 rounded-lg border border-border/70 p-2 text-xs sm:grid-cols-2">
              {status.files.slice(0, 12).map((file) => <div key={`${file.path}-${file.kind}`} className="truncate rounded bg-muted/35 px-2 py-1.5" title={file.path}>{file.path}</div>)}
            </div>
            {status.files.length > 12 && <div className="mt-2 text-xs text-muted-foreground">Showing 12 of {status.files.length} changed files.</div>}
          </div>
        )}

        {(worktree.lockReason || worktree.pruneReason || worktree.reason) && (
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">{worktree.lockReason || worktree.pruneReason || worktree.reason}</div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={onReveal}><ExternalLink /> Reveal in file manager</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailMetric({ label, value, mono = false }) {
  return <div className="rounded-lg bg-muted/35 p-3"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div><div className={cn("mt-1 truncate text-sm", mono && "font-mono text-xs")} title={value}>{value}</div></div>;
}

function Empty({ label }) {
  return <div className="rounded-xl border border-dashed border-border p-16 text-center text-sm text-muted-foreground">{label}</div>;
}
