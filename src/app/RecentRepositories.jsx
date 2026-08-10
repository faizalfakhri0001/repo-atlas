import { ExternalLink, FolderOpen, LoaderCircle, Pin, PinOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeDate, truncateMiddle } from "@/lib/utils";

export function RecentRepositories({
  repositories = [],
  loadingPath = null,
  onOpenRepository,
  onPin,
  onRemove,
  onReveal,
}) {
  return (
    <div className="flex h-full overflow-auto p-8">
      <div className="m-auto w-full max-w-2xl">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <FolderOpen className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Recent repositories</h1>
              <p className="mt-1 text-sm text-muted-foreground">Open a local repository or continue where you left off.</p>
            </div>
          </div>
        </div>

        {repositories.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
            <FolderOpen className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-3 font-medium">No recent repositories</h2>
            <p className="mt-1 text-sm text-muted-foreground">Your local repository metadata will appear here after you open a folder.</p>
            <Button className="mt-5" onClick={() => onOpenRepository()}>
              <FolderOpen /> Open Repository
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card/45">
            <div className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent repositories
            </div>
            <div className="divide-y divide-border">
              {repositories.map((repository) => {
                const isLoading = loadingPath === repository.path;
                return (
                  <div key={repository.path} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent/35">
                    <button
                      type="button"
                      onClick={() => onOpenRepository(repository.path)}
                      disabled={isLoading}
                      aria-label={`Open ${repository.name}`}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title={repository.path}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {isLoading ? <LoaderCircle className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{repository.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {truncateMiddle(repository.path, 36, 18)}
                        </span>
                        <span className="mt-1 block text-[11px] text-muted-foreground/75">
                          {repository.lastKnownBranch || "No branch recorded"} · {repository.lastOpenedAt ? formatRelativeDate(repository.lastOpenedAt) : "Not opened yet"}
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => onPin(repository.path, !repository.pinned)}
                        aria-label={repository.pinned ? `Unpin ${repository.name}` : `Pin ${repository.name}`}
                        title={repository.pinned ? "Unpin" : "Pin"}
                      >
                        {repository.pinned ? <Pin className="text-primary" /> : <PinOff />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => onReveal(repository.path)}
                        aria-label={`Reveal ${repository.name}`}
                        title="Reveal in file manager"
                      >
                        <ExternalLink />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => onRemove(repository.path)}
                        aria-label={`Remove ${repository.name} from recent repositories`}
                        title="Remove from recent"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
