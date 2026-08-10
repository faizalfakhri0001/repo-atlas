import { useMemo, useState } from "react";
import { CircleDot, FolderOpen, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CopyButton, DiffView, FilePathLabel, FileStatusBadge } from "@/components/diff-view";

function statusCode(item, mode) {
  const code = mode === "staged" ? item.index : item.worktree;
  if (item.kind === "conflict") return "U";
  if (item.kind === "untracked") return "A";
  if (code === "." || code === " " || !code) return "M";
  return code;
}

/**
 * Working tree changes grouped GitLens-style (conflicts / staged / unstaged /
 * untracked) with an inline diff pane.
 */
export function WorkspaceView({ status, repoPath }) {
  const groups = useMemo(() => {
    const conflicts = [];
    const staged = [];
    const unstaged = [];
    const untracked = [];
    for (const item of status.files) {
      if (item.kind === "conflict") {
        conflicts.push(item);
        continue;
      }
      if (item.kind === "untracked") {
        untracked.push(item);
        continue;
      }
      if (item.kind === "ignored") continue;
      if (item.index !== "." && item.index !== " " && item.index !== "?") staged.push(item);
      if (item.worktree !== "." && item.worktree !== " " && item.worktree !== "?") unstaged.push(item);
    }
    return { conflicts, staged, unstaged, untracked };
  }, [status.files]);

  const [selected, setSelected] = useState(null); // { path, mode }

  const request = useMemo(() => {
    if (!selected) return null;
    if (selected.mode === "untracked") return { type: "untracked", path: selected.path };
    return { type: "workspace", path: selected.path, staged: selected.mode === "staged" };
  }, [selected]);

  const section = (title, items, mode, tone) => {
    if (items.length === 0) return null;
    return (
      <div key={title}>
        <div className={cn("flex items-center gap-1.5 px-2 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-wider", tone ?? "text-muted-foreground/70")}>
          {title} <span className="tabular-nums opacity-70">{items.length}</span>
        </div>
        {items.map((item) => {
          const isActive = selected?.path === item.path && selected?.mode === mode;
          return (
            <button
              key={`${mode}-${item.path}`}
              type="button"
              onClick={() => setSelected({ path: item.path, mode })}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/50",
                isActive && "bg-primary/10",
              )}
            >
              <FileStatusBadge status={statusCode(item, mode)} />
              <FilePathLabel path={item.path} className="min-w-0 flex-1" />
            </button>
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
          <p className="text-[11px] text-muted-foreground">Tracked and untracked working tree changes.</p>
        </div>
        <div className="flex gap-1.5">
          {groups.conflicts.length > 0 && (
            <Badge variant="destructive">
              <TriangleAlert className="size-3" /> {groups.conflicts.length} conflicted
            </Badge>
          )}
          {status.ahead > 0 && <Badge variant="success">ahead {status.ahead}</Badge>}
          {status.behind > 0 && <Badge variant="warning">behind {status.behind}</Badge>}
          {status.upstream && <Badge variant="muted">{status.upstream}</Badge>}
        </div>
      </div>

      {status.files.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <FolderOpen className="size-8" />
          <p className="text-sm">Working tree is clean.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="w-80 shrink-0 overflow-auto border-r border-border p-1.5 pb-6">
            {section("Merge conflicts", groups.conflicts, "worktree", "text-rose-400")}
            {section("Staged changes", groups.staged, "staged", "text-emerald-500/90")}
            {section("Unstaged changes", groups.unstaged, "worktree")}
            {section("Untracked files", groups.untracked, "untracked")}
          </div>
          <div className="min-w-0 flex-1 overflow-auto">
            {request ? (
              <>
                <div className="sticky top-0 z-[2] flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 text-xs backdrop-blur">
                  <CircleDot className="size-3.5 text-muted-foreground" />
                  <FilePathLabel path={selected.path} className="min-w-0 flex-1" />
                  <Badge variant="muted">{selected.mode === "staged" ? "staged vs HEAD" : selected.mode === "untracked" ? "new file" : "unstaged vs index"}</Badge>
                  <CopyButton value={selected.path} title="Copy path" />
                </div>
                <DiffView repoPath={repoPath} request={request} />
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
