import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  Cherry,
  CircleCheck,
  CircleHelp,
  CircleX,
  GitBranch,
  LoaderCircle,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { api, isDemo } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function PredictionBadge({ commit }) {
  if (commit.prediction === "clean")
    return (
      <Badge variant="success">
        <CircleCheck className="size-3" /> clean
      </Badge>
    );
  if (commit.prediction === "conflicts")
    return (
      <Badge variant="destructive" title={commit.conflictFiles.join("\n")}>
        <TriangleAlert className="size-3" /> {commit.conflictFiles.length || ""} conflict{commit.conflictFiles.length === 1 ? "" : "s"}
      </Badge>
    );
  if (commit.prediction === "root") return <Badge variant="muted">root commit</Badge>;
  if (commit.prediction === "skipped") return <Badge variant="muted">not simulated</Badge>;
  return (
    <Badge variant="muted">
      <CircleHelp className="size-3" /> unknown
    </Badge>
  );
}

/**
 * Guided cherry-pick: simulate first (merge-tree), then execute with a
 * clear conflict outcome (abort / resolve manually).
 */
export function CherryPickDialog({ repoPath, hashes, currentBranch, onClose, onDone }) {
  const [phase, setPhase] = useState("preview"); // preview | executing | done
  const [preview, setPreview] = useState({ loading: true, error: null, data: null });
  const [outcome, setOutcome] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPhase("preview");
    setOutcome(null);
    setPreview({ loading: true, error: null, data: null });
    api
      .cherryPickPreview({ repositoryPath: repoPath, hashes })
      .then((response) => {
        if (cancelled) return;
        if (!response?.ok) setPreview({ loading: false, error: response?.error?.message ?? "Preview failed.", data: null });
        else setPreview({ loading: false, error: null, data: response.data });
      })
      .catch((error) => {
        if (!cancelled) setPreview({ loading: false, error: error?.message ?? "Preview failed.", data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath, hashes]);

  const execute = useCallback(async () => {
    setPhase("executing");
    try {
      const response = await api.cherryPickExecute({ repositoryPath: repoPath, hashes });
      if (!response?.ok) {
        setOutcome({ status: "error", message: response?.error?.message ?? "Cherry-pick failed." });
      } else {
        setOutcome(response.data);
      }
    } catch (error) {
      setOutcome({ status: "error", message: error?.message ?? "Cherry-pick failed." });
    }
    setPhase("done");
  }, [repoPath, hashes]);

  const abort = useCallback(async () => {
    setActionBusy(true);
    try {
      const response = await api.sequencerAction({ repositoryPath: repoPath, action: "abort" });
      if (response?.ok) {
        setOutcome({ status: "aborted" });
      } else {
        setOutcome({ status: "error", message: response?.error?.message ?? "Abort failed." });
      }
    } finally {
      setActionBusy(false);
    }
  }, [repoPath]);

  const finish = useCallback(
    (refresh) => {
      onClose();
      if (refresh) onDone();
    },
    [onClose, onDone],
  );

  const data = preview.data;
  const conflictExpected = data?.commits.some((commit) => commit.prediction === "conflicts");

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && phase !== "executing") finish(phase === "done");
      }}
    >
      <DialogContent
        className="max-w-xl"
        onInteractOutside={(event) => {
          if (phase === "executing") event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (phase === "executing") event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cherry className="size-4 text-rose-500" />
            Cherry-pick {hashes.length} {hashes.length === 1 ? "commit" : "commits"}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-1.5">
            Apply onto
            <Badge variant="secondary">
              <GitBranch className="size-3" /> {data?.targetBranch ?? currentBranch}
            </Badge>
            (current branch) in oldest-to-newest order.
          </DialogDescription>
        </DialogHeader>

        {phase === "preview" && (
          <>
            {preview.loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" /> Simulating with git merge-tree…
              </div>
            ) : preview.error ? (
              <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-400">{preview.error}</div>
            ) : (
              <>
                <div className="max-h-64 space-y-1 overflow-auto rounded-lg border border-border p-1.5">
                  {data.commits.map((commit, index) => (
                    <div key={commit.hash}>
                      <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs">
                        <code className="shrink-0 font-mono text-muted-foreground">{commit.shortHash}</code>
                        <span className="min-w-0 flex-1 truncate">{commit.subject || "(no subject)"}</span>
                        <PredictionBadge commit={commit} />
                      </div>
                      {index < data.commits.length - 1 && (
                        <div className="flex justify-center py-0.5 text-muted-foreground/50">
                          <ArrowDown className="size-3" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {!data.workingTree.clean && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-500">
                      <TriangleAlert className="size-3.5 shrink-0" />
                      Working tree has {data.workingTree.trackedChanges} uncommitted{" "}
                      {data.workingTree.trackedChanges === 1 ? "change" : "changes"} — commit, stash, or discard them first.
                    </div>
                  )}
                  {data.state.inProgress && (
                    <div className="flex items-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-rose-400">
                      <TriangleAlert className="size-3.5 shrink-0" />A {data.state.current} operation is already in progress.
                    </div>
                  )}
                  {data.detachedHead && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-500">
                      <TriangleAlert className="size-3.5 shrink-0" />
                      HEAD is detached — the new commits will not belong to any branch.
                    </div>
                  )}
                  {conflictExpected && !data.blocked && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-500">
                      <TriangleAlert className="size-3.5 shrink-0" />
                      Conflicts are expected. The sequence will pause on the conflicting commit — you can abort safely at that point.
                    </div>
                  )}
                  <p className="px-1 leading-5">
                    Predictions are simulated against the current HEAD without touching your files. Multi-commit sequences may differ
                    slightly once earlier picks land.
                  </p>
                </div>

                <DialogFooter>
                  <Button variant="ghost" onClick={() => finish(false)}>
                    Cancel
                  </Button>
                  <Button onClick={execute} disabled={data.blocked || isDemo} title={isDemo ? "Demo mode is read-only" : undefined}>
                    <Cherry /> Cherry-pick {data.commits.length === 1 ? "commit" : `${data.commits.length} commits`}
                  </Button>
                </DialogFooter>
              </>
            )}
          </>
        )}

        {phase === "executing" && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Running git cherry-pick…
          </div>
        )}

        {phase === "done" && outcome && (
          <>
            {outcome.status === "applied" && (
              <div className="flex items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-500">
                <CircleCheck className="size-5 shrink-0" />
                <div>
                  <div className="font-medium">Cherry-pick complete</div>
                  <div className="mt-0.5 text-xs opacity-80">
                    {outcome.applied ?? hashes.length} {(outcome.applied ?? hashes.length) === 1 ? "commit" : "commits"} applied to{" "}
                    {data?.targetBranch ?? currentBranch}.
                  </div>
                </div>
              </div>
            )}
            {outcome.status === "conflict" && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-lg border border-rose-500/25 bg-rose-500/10 p-4 text-sm">
                  <TriangleAlert className="mt-0.5 size-5 shrink-0 text-rose-400" />
                  <div className="min-w-0">
                    <div className="font-medium text-rose-400">Cherry-pick paused on conflicts</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">
                      Resolve the files below and continue from the banner at the top of the app — or abort now to restore the branch
                      exactly as it was.
                    </div>
                  </div>
                </div>
                {outcome.conflictFiles?.length > 0 && (
                  <div className="max-h-36 overflow-auto rounded-lg border border-border">
                    {outcome.conflictFiles.map((file) => (
                      <div key={file} className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 font-mono text-xs last:border-0">
                        <CircleX className="size-3.5 shrink-0 text-rose-400" /> {file}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {outcome.status === "aborted" && (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
                <Undo2 className="size-5 shrink-0 text-muted-foreground" />
                <div>
                  <div className="font-medium">Cherry-pick aborted</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">The branch was restored to its previous state.</div>
                </div>
              </div>
            )}
            {outcome.status === "error" && (
              <div className="flex items-start gap-3 rounded-lg border border-rose-500/25 bg-rose-500/10 p-4 text-sm">
                <CircleX className="mt-0.5 size-5 shrink-0 text-rose-400" />
                <div className="min-w-0">
                  <div className="font-medium text-rose-400">Cherry-pick failed</div>
                  <div className="mt-1 break-words text-xs text-muted-foreground">{outcome.message}</div>
                </div>
              </div>
            )}

            <DialogFooter>
              {outcome.status === "conflict" ? (
                <>
                  <Button variant="outline" disabled={actionBusy} onClick={abort}>
                    {actionBusy ? <LoaderCircle className="animate-spin" /> : <Undo2 />} Abort cherry-pick
                  </Button>
                  <Button variant="destructive" onClick={() => finish(true)}>
                    Resolve manually
                  </Button>
                </>
              ) : (
                <Button onClick={() => finish(true)}>Done</Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
