import { useMemo, useState } from "react";
import { Check, CircleDot, FolderOpen, LockKeyhole, LockKeyholeOpen, Minus, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton, DiffView, FilePathLabel, FileStatusBadge } from "@/components/diff-view";

function hasIndexChange(item) {
  if (typeof item.staged === "boolean") return item.staged;
  return item.index !== "." && item.index !== " " && item.index !== "?" && item.index !== "!";
}

function hasWorktreeChange(item) {
  if (typeof item.unstaged === "boolean") return item.unstaged;
  return item.worktree !== "." && item.worktree !== " " && item.worktree !== "!";
}

function isUntracked(item) {
  return item.untracked ?? (item.kind === "untracked" || item.index === "?" || item.worktree === "?");
}

function isConflicted(item) {
  return item.conflicted ?? (item.kind === "conflict" || item.index === "U" || item.worktree === "U");
}

function statusCode(item, mode) {
  if (isConflicted(item)) return "U";
  if (isUntracked(item)) return "?";
  const code = mode === "staged" ? item.indexStatus ?? item.index : item.worktreeStatus ?? item.worktree;
  if (code === "." || code === " " || !code) return "M";
  return code;
}

function operationForMode(mode) {
  if (mode === "staged") return "unstage";
  if (mode === "conflict") return "resolve";
  return "stage";
}

function selectionKey(mode, item) {
  return `${mode}:${item.path}`;
}

/**
 * Working tree changes grouped into conflict, staged, unstaged, and untracked
 * sections. File operations stay explicit and are sent only as repository-
 * relative paths returned by Git status.
 */
export function WorkspaceView({
  status,
  repoPath,
  operationMode = "read-only",
  isDemo = false,
  operationError: externalOperationError = null,
  onSetOperationMode,
  onOperation,
  onRefresh,
}) {
  const [selected, setSelected] = useState(() => new Set());
  const [anchor, setAnchor] = useState(null);
  const [preview, setPreview] = useState(null);
  const [operationBusy, setOperationBusy] = useState(false);
  const [operationError, setOperationError] = useState(null);
  const [operationMessage, setOperationMessage] = useState(null);

  const groups = useMemo(() => {
    const conflicts = [];
    const staged = [];
    const unstaged = [];
    const untracked = [];
    for (const item of status?.files ?? []) {
      if (item.kind === "ignored") continue;
      if (isConflicted(item)) {
        conflicts.push(item);
        continue;
      }
      if (isUntracked(item)) {
        untracked.push(item);
        continue;
      }
      if (hasIndexChange(item)) staged.push(item);
      if (hasWorktreeChange(item)) unstaged.push(item);
    }
    return { conflicts, staged, unstaged, untracked };
  }, [status?.files]);

  const selectionItems = useMemo(() => {
    const items = new Map();
    for (const [mode, entries] of [
      ["conflict", groups.conflicts],
      ["staged", groups.staged],
      ["unstaged", groups.unstaged],
      ["untracked", groups.untracked],
    ]) {
      entries.forEach((item, index) => {
        items.set(selectionKey(mode, item), { item, mode, index, entries });
      });
    }
    return items;
  }, [groups]);

  const selectedItems = useMemo(
    () => [...selected].map((key) => selectionItems.get(key)).filter(Boolean),
    [selected, selectionItems],
  );
  const selectedAction = selectedItems.length > 0 ? operationForMode(selectedItems[0].mode) : null;
  const selectedPaths = [...new Set(selectedItems.map(({ item }) => item.path))];
  const activeOperationError = operationError ?? externalOperationError;
  const visibleItemCount = groups.conflicts.length + groups.staged.length + groups.unstaged.length + groups.untracked.length;
  const safeWriteEnabled = operationMode === "safe-write";

  const toggleSelection = (item, mode, entries, index, event) => {
    const key = selectionKey(mode, item);
    const action = operationForMode(mode);
    setOperationMessage(null);
    setOperationError(null);
    setSelected((current) => {
      const next = new Set(current);
      const currentActions = [...next].map((entryKey) => selectionItems.get(entryKey)?.mode).filter(Boolean).map(operationForMode);
      if (currentActions.some((currentAction) => currentAction !== action)) next.clear();

      if (event.shiftKey && anchor?.mode === mode) {
        const start = Math.min(anchor.index, index);
        const end = Math.max(anchor.index, index);
        entries.slice(start, end + 1).forEach((entry) => next.add(selectionKey(mode, entry)));
      } else if (event.metaKey || event.ctrlKey) {
        if (next.has(key)) next.delete(key);
        else next.add(key);
      } else if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    setAnchor({ mode, index });
  };

  const runOperation = async (requestedAction = selectedAction, paths = selectedPaths) => {
    if (!requestedAction || paths.length === 0) return;
    if (!safeWriteEnabled) {
      setOperationError({ message: "Enable Safe Write before changing the Git index.", code: "READ_ONLY_MODE" });
      return;
    }
    if (requestedAction === "resolve" && typeof window !== "undefined" && !window.confirm("Mark the selected file as resolved in the Git index?")) return;
    setOperationBusy(true);
    setOperationError(null);
    setOperationMessage(null);
    try {
      if (typeof onOperation !== "function") {
        setOperationError({ message: "Workspace operation is unavailable.", code: "OPERATION_UNAVAILABLE" });
        return;
      }
      const response = await onOperation(requestedAction === "unstage" ? "unstage" : "stage", paths);
      if (response?.ok === false) {
        setOperationError(response.error ?? { message: "Workspace operation failed.", code: "OPERATION_FAILED" });
        return;
      }
      const operationLabel = requestedAction === "unstage" ? "Unstaged" : requestedAction === "resolve" ? "Marked resolved" : "Staged";
      setOperationMessage(`${operationLabel} ${paths.length} file${paths.length === 1 ? "" : "s"}.`);
      setSelected(new Set());
      setAnchor(null);
      setPreview((current) => (current ? { ...current, revision: Date.now() } : current));
    } catch (error) {
      setOperationError({ message: error?.message || "Workspace operation failed.", code: "OPERATION_FAILED" });
    } finally {
      setOperationBusy(false);
    }
  };

  const runHunkOperation = async (hunkId) => {
    if (!preview || !["staged", "unstaged"].includes(preview.mode) || !hunkId) return;
    if (!safeWriteEnabled) {
      setOperationError({ message: "Enable Safe Write before changing the Git index.", code: "READ_ONLY_MODE" });
      return;
    }
    if (typeof onOperation !== "function") {
      setOperationError({ message: "Workspace operation is unavailable.", code: "OPERATION_UNAVAILABLE" });
      return;
    }
    setOperationBusy(true);
    setOperationError(null);
    setOperationMessage(null);
    const operation = preview.mode === "staged" ? "unstage-hunk" : "stage-hunk";
    try {
      const response = await onOperation(operation, {
        path: preview.item.path,
        hunkId,
        source: preview.mode === "staged" ? "staged" : "unstaged",
      });
      if (response?.ok === false) {
        setOperationError(response.error ?? { message: "Hunk operation failed.", code: "OPERATION_FAILED" });
        return;
      }
      setOperationMessage(preview.mode === "staged" ? "Unstaged hunk." : "Staged hunk.");
      setPreview((current) => (current ? { ...current, revision: Date.now() } : current));
    } catch (error) {
      setOperationError({ message: error?.message || "Hunk operation failed.", code: "OPERATION_FAILED" });
    } finally {
      setOperationBusy(false);
    }
  };

  const changeMode = async (mode) => {
    setOperationError(null);
    const response = await onSetOperationMode?.(mode);
    if (response?.ok === false) setOperationError(response.error ?? { message: "Operation policy could not be changed.", code: "POLICY_FAILED" });
  };

  const requestForPreview = (item, mode) => {
    setPreview({ item, mode, revision: Date.now() });
    setOperationError(null);
  };

  const section = (title, items, mode, tone, actionLabel = null) => {
    if (items.length === 0) return null;
    const action = operationForMode(mode);
    const canRunBulk = action === "stage" || action === "unstage";
    return (
      <div key={title}>
        <div className={cn("flex items-center gap-1.5 px-2 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-wider", tone ?? "text-muted-foreground/70")}>
          <span>{title} <span className="tabular-nums opacity-70">{items.length}</span></span>
          {canRunBulk && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 px-2 text-[10px] normal-case tracking-normal"
              disabled={!safeWriteEnabled || operationBusy}
              onClick={() => runOperation(action, items.map((item) => item.path))}
              title={!safeWriteEnabled ? "Enable Safe Write first" : undefined}
            >
              {action === "stage" ? "Stage all" : "Unstage all"}
            </Button>
          )}
          {actionLabel && <span className="ml-auto text-[10px] normal-case tracking-normal opacity-70">{actionLabel}</span>}
        </div>
        {items.map((item, index) => {
          const key = selectionKey(mode, item);
          const isSelected = selected.has(key);
          const isActive = preview?.item.path === item.path && preview?.mode === mode;
          return (
            <div
              key={key}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/50",
                isActive && "bg-primary/10",
              )}
            >
              <input
                type="checkbox"
                checked={isSelected}
                disabled={operationBusy}
                aria-label={`Select ${item.path} for ${action === "unstage" ? "unstaging" : action === "resolve" ? "marking resolved" : "staging"}`}
                className="size-3.5 accent-primary"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => toggleSelection(item, mode, items, index, event.nativeEvent)}
              />
              <button type="button" onClick={() => requestForPreview(item, mode)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <FileStatusBadge status={statusCode(item, mode)} />
                <FilePathLabel path={item.path} className="min-w-0 flex-1" />
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold leading-tight">Workspace</h2>
          <p className="text-[11px] text-muted-foreground">Manage the Git index without leaving the repository.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {isDemo ? (
            <Badge variant="muted"><LockKeyhole className="size-3" /> Demo read-only</Badge>
          ) : safeWriteEnabled ? (
            <>
              <Badge variant="success"><LockKeyholeOpen className="size-3" /> Safe Write</Badge>
              <Button variant="ghost" size="sm" onClick={() => changeMode("read-only")} disabled={operationBusy}>Lock</Button>
            </>
          ) : (
            <>
              <Badge variant="muted"><LockKeyhole className="size-3" /> Read-only</Badge>
              <Button variant="outline" size="sm" onClick={() => changeMode("safe-write")} disabled={operationBusy}>Enable Safe Write</Button>
            </>
          )}
          {status?.ahead > 0 && <Badge variant="success">ahead {status.ahead}</Badge>}
          {status?.behind > 0 && <Badge variant="warning">behind {status.behind}</Badge>}
          {status?.upstream && <Badge variant="muted">{status.upstream}</Badge>}
        </div>
      </div>

      {activeOperationError && (
        <div role="alert" className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-400">
          <TriangleAlert className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{activeOperationError.message}</span>
          {onRefresh && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onRefresh}>Refresh</Button>}
        </div>
      )}
      {operationMessage && <div className="border-b border-emerald-500/20 bg-emerald-500/5 px-4 py-2 text-xs text-emerald-500">{operationMessage}</div>}

      {visibleItemCount === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <FolderOpen className="size-8" />
          <p className="text-sm">Working tree is clean.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="relative w-80 shrink-0 overflow-auto border-r border-border p-1.5 pb-20">
            {section("Merge conflicts", groups.conflicts, "conflict", "text-rose-400", "Mark as resolved")}
            {section("Staged changes", groups.staged, "staged", "text-emerald-500/90")}
            {section("Unstaged changes", groups.unstaged, "unstaged")}
            {section("Untracked files", groups.untracked, "untracked")}
            {selectedItems.length > 0 && (
              <div className="sticky bottom-2 z-[2] mt-3 flex items-center gap-2 rounded-lg border border-border bg-card/95 p-2 shadow-lg backdrop-blur">
                <span className="min-w-0 flex-1 text-xs font-medium">{selectedItems.length} file{selectedItems.length === 1 ? "" : "s"} selected</span>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSelected(new Set())} disabled={operationBusy}>Clear</Button>
                <Button size="sm" className="h-7 px-2 text-xs" onClick={() => runOperation()} disabled={operationBusy || !safeWriteEnabled}>
                  {operationBusy ? <Minus className="animate-pulse" /> : selectedAction === "unstage" ? <Minus /> : selectedAction === "resolve" ? <Check /> : <Check />}
                  {selectedAction === "unstage" ? "Unstage" : selectedAction === "resolve" ? "Mark resolved" : "Stage"}
                </Button>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 overflow-auto">
            {preview ? (
              <>
                <div className="sticky top-0 z-[2] flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 text-xs backdrop-blur">
                  <CircleDot className="size-3.5 text-muted-foreground" />
                  <FilePathLabel path={preview.item.path} className="min-w-0 flex-1" />
                  <Badge variant="muted">{preview.mode === "staged" ? "staged vs HEAD" : preview.mode === "untracked" ? "new file" : preview.mode === "conflict" ? "conflict resolution" : "unstaged vs index"}</Badge>
                  <CopyButton value={preview.item.path} title="Copy path" />
                </div>
                <DiffView
                  repoPath={repoPath}
                  request={preview.mode === "untracked" ? { type: "untracked", path: preview.item.path } : { type: "workspace", path: preview.item.path, staged: preview.mode === "staged" }}
                  revisionKey={preview.revision}
                  onHunkAction={preview.mode === "staged" || preview.mode === "unstaged" ? runHunkOperation : undefined}
                  hunkActionDisabled={operationBusy || !safeWriteEnabled || isDemo}
                />
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a file to view its changes.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
