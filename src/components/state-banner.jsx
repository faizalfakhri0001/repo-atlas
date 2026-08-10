import { useState } from "react";
import { LoaderCircle, Play, SkipForward, TriangleAlert, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

const LABELS = {
  "cherry-pick": "A cherry-pick is in progress",
  merge: "A merge is in progress",
  rebase: "A rebase is in progress",
  revert: "A revert is in progress",
  bisect: "A bisect session is active",
};

/**
 * Amber banner shown while the repository has an unfinished operation.
 * Cherry-picks can be continued / skipped / aborted right from here.
 */
export function StateBanner({ state, repoPath, conflictCount, onRefresh, onResult }) {
  const [busy, setBusy] = useState(null);
  if (!state?.inProgress) return null;

  const runAction = async (action) => {
    setBusy(action);
    try {
      const response = await api.sequencerAction({ repositoryPath: repoPath, action });
      if (response?.ok) onResult?.(response.data, action);
      else onResult?.({ status: "error", message: response?.error?.message ?? `${action} failed.` }, action);
    } finally {
      setBusy(null);
      onRefresh();
    }
  };

  const isCherryPick = state.current === "cherry-pick";

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-500/25 bg-amber-500/10 px-5 py-2 text-xs">
      <TriangleAlert className="size-4 shrink-0 text-amber-500" />
      <span className="font-medium text-amber-600 dark:text-amber-400">{LABELS[state.current] ?? "An operation is in progress"}</span>
      {conflictCount > 0 && (
        <span className="text-muted-foreground">
          · {conflictCount} conflicted {conflictCount === 1 ? "file" : "files"} in the workspace
        </span>
      )}
      <span className="mr-auto" />
      {isCherryPick ? (
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7" disabled={busy != null} onClick={() => runAction("continue")}>
            {busy === "continue" ? <LoaderCircle className="animate-spin" /> : <Play />} Continue
          </Button>
          <Button size="sm" variant="outline" className="h-7" disabled={busy != null} onClick={() => runAction("skip")}>
            {busy === "skip" ? <LoaderCircle className="animate-spin" /> : <SkipForward />} Skip commit
          </Button>
          <Button size="sm" variant="outline" className="h-7 border-rose-500/40 text-rose-500 hover:bg-rose-500/10 hover:text-rose-500" disabled={busy != null} onClick={() => runAction("abort")}>
            {busy === "abort" ? <LoaderCircle className="animate-spin" /> : <Undo2 />} Abort
          </Button>
        </div>
      ) : (
        <span className="text-muted-foreground">Finish or abort it in your terminal, then refresh.</span>
      )}
    </div>
  );
}
