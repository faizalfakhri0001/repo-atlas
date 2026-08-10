import { AlertCircle, Circle, LoaderCircle, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, truncateMiddle } from "@/lib/utils";

export function RepositoryTabs({
  sessions,
  activeSessionId,
  onActivate,
  onClose,
  onOpen,
}) {
  return (
    <div className="flex min-h-12 shrink-0 items-center gap-1 border-b border-border bg-card/35 px-3" role="tablist" aria-label="Open repositories">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1">
        {sessions.map((session) => {
          const repository = session.snapshot?.repository;
          const isActive = session.id === activeSessionId;
          const isDirty = Boolean(repository?.dirty);
          const branch = repository?.currentBranch;
          const isLoading = session.status === "loading" || session.loading;
          const hasError = session.status === "error" || session.status === "stale";

          return (
            <div
              key={session.id}
              className={cn(
                "group flex h-9 max-w-64 min-w-44 shrink-0 items-center rounded-md border border-transparent transition-colors",
                isActive ? "border-border bg-background shadow-sm" : "hover:bg-accent/60",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`repository-panel-${session.id}`}
                onClick={() => onActivate(session.id)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-l-md px-2.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                title={session.path ?? session.name}
              >
                {isLoading ? (
                  <LoaderCircle className="size-3.5 shrink-0 animate-spin text-primary" aria-label="Loading" />
                ) : hasError ? (
                  <AlertCircle className="size-3.5 shrink-0 text-amber-400" aria-label="Repository needs attention" />
                ) : (
                  <Circle
                    className={cn(
                      "size-2.5 shrink-0 fill-current",
                      repository ? (isDirty ? "text-amber-400" : "text-emerald-400") : "text-muted-foreground",
                    )}
                    aria-label={repository ? (isDirty ? "Uncommitted changes" : "Clean working tree") : "Not loaded"}
                  />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">{truncateMiddle(session.name, 24, 6)}</span>
                {branch && <span className="max-w-20 truncate text-[10px] text-muted-foreground">{branch}</span>}
              </button>
              <button
                type="button"
                aria-label={`Close ${session.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(session.id);
                }}
                className="mr-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-60 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onOpen} aria-label="Open another repository" title="Open another repository">
        <Plus />
      </Button>
    </div>
  );
}
