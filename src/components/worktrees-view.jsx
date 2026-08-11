import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FolderOpen,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  Info,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn, copyText, truncateMiddle } from "@/lib/utils";

function worktreeName(worktree) {
  const value = String(worktree?.path ?? "");
  return value.split(/[\\/]/).filter(Boolean).pop() || value || "Unnamed worktree";
}

function worktreeRef(worktree) {
  return worktree?.branch || worktree?.head || "HEAD";
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
  currentBranch,
  defaultBranch,
  currentHead,
  branches = [],
  sessionId,
  operationMode = "read-only",
  isDemo = false,
  onSetOperationMode,
  onOperationTransaction,
  onOpenWorktree,
  onCompare,
  onRefresh,
}) {
  const [selectedPath, setSelectedPath] = useState(currentWorktreePath || worktrees.find((worktree) => worktree.main)?.path || worktrees[0]?.path || "");
  const [details, setDetails] = useState({});
  const [detailErrors, setDetailErrors] = useState({});
  const [loadingPath, setLoadingPath] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [copiedPath, setCopiedPath] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [cleanupPreview, setCleanupPreview] = useState(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupError, setCleanupError] = useState("");
  const [cleanupMessage, setCleanupMessage] = useState("");

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

  const copyPath = async (worktree) => {
    if (!(await copyText(worktree.path))) return;
    setCopiedPath(worktree.path);
    window.setTimeout(() => setCopiedPath((current) => current === worktree.path ? "" : current), 1400);
  };

  const requestRemove = async (worktree) => {
    if (isDemo) return;
    setCleanupPreview(null);
    setCleanupError("");
    setCleanupMessage("");
    setCleanupBusy(true);
    try {
      if (typeof api.worktreeRemovePreview !== "function") throw new Error("Worktree removal preview is unavailable.");
      const response = await api.worktreeRemovePreview({
        sessionId,
        repositoryPath: repoPath,
        path: worktree.path,
        currentWorktreePath,
      });
      if (!response?.ok) {
        setCleanupError(response?.error?.message || "The worktree removal preview failed.");
        return;
      }
      setCleanupPreview({ type: "remove", data: response.data });
    } catch (error) {
      setCleanupError(error?.message || "The worktree removal preview failed.");
    } finally {
      setCleanupBusy(false);
    }
  };

  const requestPrune = async () => {
    if (isDemo) return;
    setCleanupPreview(null);
    setCleanupError("");
    setCleanupMessage("");
    setCleanupBusy(true);
    try {
      if (typeof api.worktreePrunePreview !== "function") throw new Error("Worktree prune preview is unavailable.");
      const response = await api.worktreePrunePreview({ sessionId, repositoryPath: repoPath });
      if (!response?.ok) {
        setCleanupError(response?.error?.message || "The worktree prune preview failed.");
        return;
      }
      setCleanupPreview({ type: "prune", data: response.data });
    } catch (error) {
      setCleanupError(error?.message || "The worktree prune preview failed.");
    } finally {
      setCleanupBusy(false);
    }
  };

  const confirmCleanup = async () => {
    if (!cleanupPreview?.data?.allowed || isDemo) return;
    const isRemove = cleanupPreview.type === "remove";
    const target = cleanupPreview.data.operation?.targetPath || "the selected worktree";
    const prompt = isRemove
      ? `Remove the clean worktree at ${target}?`
      : `Prune ${cleanupPreview.data.items?.length || 0} stale worktree metadata entr${cleanupPreview.data.items?.length === 1 ? "y" : "ies"}?`;
    if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(prompt)) return;

    setCleanupBusy(true);
    setCleanupError("");
    setCleanupMessage("");
    try {
      const payload = isRemove
        ? {
            sessionId,
            repositoryPath: repoPath,
            path: target,
            currentWorktreePath,
          }
        : { sessionId, repositoryPath: repoPath };
      const method = isRemove ? api.worktreeRemove : api.worktreePrune;
      if (typeof method !== "function") throw new Error(`${isRemove ? "Worktree removal" : "Worktree prune"} is unavailable.`);
      const response = await method(payload);
      if (!response?.ok) {
        setCleanupError(response?.error?.message || `The worktree ${isRemove ? "could not be removed" : "metadata could not be pruned"}.`);
        return;
      }
      const result = response.data ?? response;
      onOperationTransaction?.(result);
      setCleanupMessage(isRemove ? "Worktree removed." : `Pruned ${result.items?.length || 0} stale worktree entr${result.items?.length === 1 ? "y" : "ies"}.`);
      setCleanupPreview(null);
      await refresh();
    } catch (error) {
      setCleanupError(error?.message || `The worktree ${isRemove ? "could not be removed" : "metadata could not be pruned"}.`);
    } finally {
      setCleanupBusy(false);
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
        <div className="flex flex-wrap gap-2">
          <Button variant={createOpen ? "secondary" : "outline"} size="sm" onClick={() => setCreateOpen((open) => !open)}>
            {createOpen ? <X /> : <Plus />}{createOpen ? "Close" : "Create Worktree"}
          </Button>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && "animate-spin")} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={requestPrune} disabled={cleanupBusy || isDemo}>
            <Trash2 /> Prune stale
          </Button>
        </div>
      </div>

      {createOpen && (
        <WorktreeCreatePanel
          repoPath={repoPath}
          currentBranch={currentBranch}
          currentHead={currentHead}
          branches={branches}
          sessionId={sessionId}
          operationMode={operationMode}
          isDemo={isDemo}
          onSetOperationMode={onSetOperationMode}
          onOperationTransaction={onOperationTransaction}
          onCreated={async () => {
            setCreateOpen(false);
            await refresh();
          }}
        />
      )}

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
              currentBranch={currentBranch}
              defaultBranch={defaultBranch}
              copied={copiedPath === selectedWorktree.path}
              onCopy={() => copyPath(selectedWorktree)}
              onOpen={() => onOpenWorktree?.(selectedWorktree.path)}
              onReveal={() => api.revealRepository(selectedWorktree.path)}
              onCompareWithCurrent={() => onCompare?.(currentBranch, worktreeRef(selectedWorktree))}
              onCompareWithDefault={() => onCompare?.(defaultBranch, worktreeRef(selectedWorktree))}
              onRemove={() => requestRemove(selectedWorktree)}
              removeDisabled={isDemo || selectedWorktree.exists === false}
            />
          )}
          {(cleanupPreview || cleanupError || cleanupMessage) && (
            <WorktreeCleanupPreview
              preview={cleanupPreview}
              busy={cleanupBusy}
              error={cleanupError}
              message={cleanupMessage}
              isDemo={isDemo}
              onCancel={() => { setCleanupPreview(null); setCleanupError(""); }}
              onConfirm={confirmCleanup}
              onSetOperationMode={onSetOperationMode}
            />
          )}
        </div>
      ) : (
        <Empty label="No worktrees found." />
      )}
    </div>
  );
}

function repositoryBaseName(repoPath) {
  return String(repoPath ?? "").split(/[\\/]/).filter(Boolean).pop() || "repository";
}

function suggestedParentPath(repoPath) {
  const value = String(repoPath ?? "").replace(/[\\/]+$/, "");
  const separatorIndex = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  if (separatorIndex < 0) return value;
  if (separatorIndex === 0) return value.startsWith("/") ? "/" : value;
  return value.slice(0, separatorIndex);
}

function joinWorktreePath(parentPath, targetName) {
  const parent = String(parentPath ?? "").replace(/[\\/]+$/, "");
  const name = String(targetName ?? "").trim();
  if (!parent) return name;
  if (!name) return parent;
  const separator = parent.includes("\\") ? "\\" : "/";
  return `${parent}${separator}${name}`;
}

function suggestedTargetName(repoPath, ref) {
  const repository = repositoryBaseName(repoPath);
  const suffix = String(ref || "worktree").split(/[\\/]/).filter(Boolean).pop() || "worktree";
  const safeSuffix = suffix.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "worktree";
  return `${repository}-${safeSuffix}`;
}

function createModeLabel(mode) {
  if (mode === "new-branch") return "New branch";
  if (mode === "detached") return "Detached HEAD";
  return "Existing local branch";
}

function WorktreeCreatePanel({
  repoPath,
  currentBranch,
  currentHead,
  branches,
  sessionId,
  operationMode,
  isDemo,
  onSetOperationMode,
  onOperationTransaction,
  onCreated,
}) {
  const localBranches = useMemo(
    () => (branches ?? []).filter((branch) => !branch.remote && branch.name),
    [branches],
  );
  const initialBranch = localBranches.find((branch) => branch.name === currentBranch)?.name || localBranches[0]?.name || currentBranch || "";
  const [mode, setMode] = useState("existing-branch");
  const [branch, setBranch] = useState(initialBranch);
  const [newBranch, setNewBranch] = useState("feature/new-worktree");
  const [startPoint, setStartPoint] = useState(currentBranch && currentBranch !== "Detached HEAD" ? currentBranch : currentHead || "HEAD");
  const [commit, setCommit] = useState(currentHead || "HEAD");
  const [parentPath, setParentPath] = useState(() => suggestedParentPath(repoPath));
  const [targetName, setTargetName] = useState(() => suggestedTargetName(repoPath, initialBranch));
  const [targetNameTouched, setTargetNameTouched] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!branch && initialBranch) setBranch(initialBranch);
  }, [branch, initialBranch]);

  const targetRef = mode === "new-branch" ? newBranch : mode === "detached" ? "detached" : branch;
  useEffect(() => {
    if (!targetNameTouched) setTargetName(suggestedTargetName(repoPath, targetRef));
  }, [repoPath, targetNameTouched, targetRef]);

  useEffect(() => {
    setPreview(null);
    setError("");
    setMessage("");
  }, [mode, branch, newBranch, startPoint, commit, parentPath, targetName]);

  const targetNameValid = Boolean(targetName.trim()) && !/[\\/]/.test(targetName.trim()) && !/[\0\n\r]/.test(targetName);
  const targetPath = targetNameValid ? joinWorktreePath(parentPath, targetName) : "";
  const previewPayload = () => {
    const payload = {
      sessionId,
      repositoryPath: repoPath,
      mode,
      targetPath,
    };
    if (mode === "existing-branch") payload.branch = branch;
    if (mode === "new-branch") {
      payload.newBranch = newBranch;
      payload.startPoint = startPoint;
    }
    if (mode === "detached") payload.commit = commit;
    return payload;
  };

  const chooseParent = async () => {
    if (isDemo) return;
    setError("");
    if (typeof api.chooseWorktreeLocation !== "function") {
      setError("The native folder picker is unavailable.");
      return;
    }
    try {
      const response = await api.chooseWorktreeLocation({ repositoryPath: repoPath });
      if (!response?.ok) {
        setError(response?.error?.message || "The parent folder could not be selected.");
        return;
      }
      if (response.data) setParentPath(response.data);
    } catch (pickerError) {
      setError(pickerError?.message || "The parent folder could not be selected.");
    }
  };

  const requestPreview = async () => {
    if (isDemo) {
      setError("Demo mode is read-only — run the desktop app on a real repository to create a worktree.");
      return;
    }
    if (!targetPath) {
      setError("Choose a parent folder and a single target folder name.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (typeof api.worktreeCreatePreview !== "function") throw new Error("Worktree creation preview is unavailable.");
      const response = await api.worktreeCreatePreview(previewPayload());
      if (!response?.ok) {
        setPreview(null);
        setError(response?.error?.message || "The worktree creation preview failed.");
        return;
      }
      setPreview(response.data);
    } catch (previewError) {
      setPreview(null);
      setError(previewError?.message || "The worktree creation preview failed.");
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!preview?.allowed || isDemo) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (typeof api.worktreeCreate !== "function") throw new Error("Worktree creation is unavailable.");
      const response = await api.worktreeCreate(previewPayload());
      if (!response?.ok) {
        setError(response?.error?.message || "The worktree could not be created.");
        return;
      }
      const payload = response.data ?? response;
      onOperationTransaction?.(payload);
      setMessage(`Created ${createModeLabel(mode).toLowerCase()} at ${payload?.operation?.targetPath || targetPath}.`);
      await onCreated?.(payload);
    } catch (createError) {
      setError(createError?.message || "The worktree could not be created.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-5 border-primary/30 bg-primary/[0.03]">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Plus className="size-4 text-primary" />Create Worktree</CardTitle>
            <CardDescription className="mt-1">Choose a parent folder, review the Git command, then confirm the local worktree creation.</CardDescription>
          </div>
          {isDemo ? <Badge variant="muted">Demo read-only</Badge> : operationMode === "safe-write" ? <Badge variant="success"><ShieldCheck className="size-3" />Safe Write enabled</Badge> : <Badge variant="warning">Read-only</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isDemo && <div className="rounded-lg border border-border/70 bg-muted/35 p-3 text-sm text-muted-foreground">Worktree creation is disabled in browser demo mode.</div>}

        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">Creation mode</span>
            <select aria-label="Create mode" value={mode} onChange={(event) => setMode(event.target.value)} disabled={busy} className="flex h-9 w-full rounded-md border border-input bg-background/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <option value="existing-branch">Existing local branch</option>
              <option value="new-branch">New branch</option>
              <option value="detached">Detached HEAD</option>
            </select>
          </label>

          {mode === "existing-branch" && (
            <label className="space-y-1.5 text-sm md:col-span-2">
              <span className="text-muted-foreground">Local branch</span>
              {localBranches.length > 0 ? (
                <select aria-label="Existing local branch" value={branch} onChange={(event) => setBranch(event.target.value)} disabled={busy} className="flex h-9 w-full rounded-md border border-input bg-background/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                  {localBranches.map((candidate) => <option key={candidate.name} value={candidate.name}>{candidate.name}{candidate.current ? " (current)" : ""}</option>)}
                </select>
              ) : <Input aria-label="Existing local branch" value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="feature/example" disabled={busy} />}
            </label>
          )}

          {mode === "new-branch" && (
            <>
              <label className="space-y-1.5 text-sm">
                <span className="text-muted-foreground">New branch name</span>
                <Input aria-label="New branch name" value={newBranch} onChange={(event) => setNewBranch(event.target.value)} placeholder="feature/example" disabled={busy} />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="text-muted-foreground">Start point</span>
                <Input aria-label="Start point" value={startPoint} onChange={(event) => setStartPoint(event.target.value)} placeholder="main or commit" disabled={busy} />
              </label>
            </>
          )}

          {mode === "detached" && (
            <label className="space-y-1.5 text-sm md:col-span-2">
              <span className="text-muted-foreground">Commit or ref</span>
              <Input aria-label="Commit" value={commit} onChange={(event) => setCommit(event.target.value)} placeholder="commit hash or ref" disabled={busy} />
            </label>
          )}
        </div>

        <div className="rounded-lg border border-border/70 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">Target location</div>
            <Button variant="outline" size="sm" onClick={chooseParent} disabled={busy || isDemo}><FolderOpen /> Choose parent folder</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-w-0 rounded-md bg-muted/35 px-3 py-2 text-xs text-muted-foreground" title={parentPath || "No parent selected"}>
              <div className="mb-1 text-[11px] uppercase tracking-wide">Parent folder</div>
              <div className="truncate">{parentPath || "Choose a parent folder"}</div>
            </div>
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">Target folder name</span>
              <Input aria-label="Target folder name" value={targetName} onChange={(event) => { setTargetNameTouched(true); setTargetName(event.target.value); }} placeholder="repository-feature" disabled={busy} />
            </label>
          </div>
          <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><FolderGit2 className="mt-0.5 size-3.5 shrink-0" /><span className="break-all">Suggested target: {targetPath || "choose a valid folder name"}</span></div>
        </div>

        {operationMode !== "safe-write" && !isDemo && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-300">
            <div className="flex items-center gap-2"><ShieldCheck className="size-4" />Safe Write is required after preview.</div>
            <Button size="sm" variant="outline" onClick={() => onSetOperationMode?.("safe-write")} disabled={busy}>Enable Safe Write</Button>
          </div>
        )}

        {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300"><Info className="mt-0.5 size-4 shrink-0" />{error}</div>}
        {message && <div role="status" className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</div>}

        <div className="flex flex-wrap gap-2">
          <Button onClick={requestPreview} disabled={busy || isDemo || !targetPath || !targetNameValid}><GitCommitHorizontal />{busy ? "Preparing…" : "Preview creation"}</Button>
          {preview?.allowed && <Button variant="secondary" onClick={create} disabled={busy || isDemo}><ShieldCheck />{busy ? "Creating…" : "Create worktree"}</Button>}
        </div>

        {preview && (
          <div className="rounded-lg border border-border/70 bg-background/50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">Creation preview</div>
              <Badge variant={preview.allowed ? "success" : "warning"}>{preview.allowed ? "Allowed" : "Blocked"}</Badge>
            </div>
            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <DetailMetric label="Mode" value={createModeLabel(preview.operation?.mode)} />
              <DetailMetric label="Target" value={preview.operation?.targetPath || targetPath} mono />
              {preview.operation?.branch && <DetailMetric label="Branch" value={preview.operation.branch} />}
              {preview.operation?.newBranch && <DetailMetric label="New branch" value={preview.operation.newBranch} />}
              {preview.operation?.startPoint && <DetailMetric label="Start point" value={preview.operation.startPoint} mono />}
              {preview.operation?.commit && <DetailMetric label="Commit" value={preview.operation.commit} mono />}
            </div>
            {preview.warnings?.length > 0 && <PreviewMessages label="Warnings" items={preview.warnings} variant="warning" />}
            {preview.blockingReasons?.length > 0 && <PreviewMessages label="Blocking reasons" items={preview.blockingReasons} variant="destructive" />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PreviewMessages({ label, items, variant }) {
  return (
    <div className={cn("mt-3 rounded-lg border p-3 text-xs", variant === "destructive" ? "border-red-500/25 bg-red-500/10 text-red-300" : "border-amber-500/25 bg-amber-500/10 text-amber-300")}>
      <div className="mb-1 font-medium">{label}</div>
      <ul className="list-disc space-y-1 pl-4">{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  );
}

function WorktreeCleanupPreview({ preview, busy, error, message, isDemo, onCancel, onConfirm, onSetOperationMode }) {
  const data = preview?.data;
  const isRemove = preview?.type === "remove";
  const readOnlyBlocked = data?.blockingReasons?.some((reason) => String(reason).startsWith("READ_ONLY_MODE"));
  return (
    <Card className="border-amber-500/30 bg-amber-500/[0.03]">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Trash2 className="size-4 text-amber-400" />{isRemove ? "Remove worktree preview" : "Prune worktree preview"}</CardTitle>
            <CardDescription className="mt-1">Review the guard results before confirming this local Git metadata operation.</CardDescription>
          </div>
          {data && <Badge variant={data.allowed ? "success" : "warning"}>{data.allowed ? "Allowed" : "Blocked"}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {data && isRemove && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <DetailMetric label="Target" value={data.operation?.targetPath || "—"} mono />
            <DetailMetric label="Main" value={data.main ? "Yes" : "No"} />
            <DetailMetric label="Changes" value={data.dirty ? `${data.changes ?? 0} files` : "Clean"} />
            <DetailMetric label="Locked" value={data.locked ? "Yes" : "No"} />
          </div>
        )}
        {data && !isRemove && data.items?.length > 0 && (
          <div className="rounded-lg border border-border/70 p-3 text-xs">
            <div className="mb-2 font-medium">Stale metadata ({data.items.length})</div>
            <div className="space-y-1">
              {data.items.slice(0, 12).map((item) => <div key={`${item.path}-${item.raw}`} className="truncate rounded bg-muted/35 px-2 py-1.5" title={item.raw}>{item.path}{item.reason ? ` — ${item.reason}` : ""}</div>)}
            </div>
            {data.items.length > 12 && <div className="mt-2 text-muted-foreground">Showing 12 of {data.items.length} entries.</div>}
          </div>
        )}
        {data?.warnings?.length > 0 && <PreviewMessages label="Warnings" items={data.warnings} variant="warning" />}
        {data?.blockingReasons?.length > 0 && <PreviewMessages label="Blocking reasons" items={data.blockingReasons} variant="destructive" />}
        {readOnlyBlocked && !isDemo && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-300"><span>Safe Write is required for this operation.</span><Button size="sm" variant="outline" onClick={() => onSetOperationMode?.("safe-write")} disabled={busy}>Enable Safe Write</Button></div>}
        {error && <div role="alert" className="rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
        {message && <div role="status" className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</div>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>Close</Button>
          {data?.allowed && <Button variant="destructive" size="sm" onClick={onConfirm} disabled={busy || isDemo}><Trash2 />{busy ? "Working…" : isRemove ? "Confirm remove" : "Confirm prune"}</Button>}
        </div>
      </CardContent>
    </Card>
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
  currentBranch,
  defaultBranch,
  copied,
  onCopy,
  onOpen,
  onReveal,
  onCompareWithCurrent,
  onCompareWithDefault,
  onRemove,
  removeDisabled = false,
}) {
  const status = detail?.status;
  const isCurrent = worktree.path === currentPath;
  const ref = worktreeRef(worktree);
  const canCompare = Boolean(ref && !worktree.bare && worktree.exists !== false);
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
          <Button size="sm" onClick={onOpen} disabled={isCurrent || worktree.exists === false}><FolderGit2 /> Open in Repo Atlas</Button>
          <Button variant="outline" size="sm" onClick={onReveal}><ExternalLink /> Reveal in file manager</Button>
          <Button variant="outline" size="sm" onClick={onCopy}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy path"}</Button>
          <Button variant="outline" size="sm" onClick={onCompareWithCurrent} disabled={!canCompare || !currentBranch || isCurrent}><GitCompareArrows /> Compare with current</Button>
          <Button variant="outline" size="sm" onClick={onCompareWithDefault} disabled={!canCompare || !defaultBranch}><GitCompareArrows /> Compare with default</Button>
          <Button variant="destructive" size="sm" onClick={onRemove} disabled={removeDisabled}><Trash2 /> Remove worktree</Button>
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
