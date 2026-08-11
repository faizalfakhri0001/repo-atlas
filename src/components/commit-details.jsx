import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  Cherry,
  GitCompareArrows,
  GitMerge,
  LoaderCircle,
  MessageSquare,
  Pencil,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDate, formatRelativeDate } from "@/lib/utils";
import { AuthorAvatar } from "@/components/author-avatar";
import { RefChipList } from "@/components/ref-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CopyButton, DiffStat, DiffView, FilePathLabel, FileStatusBadge } from "@/components/diff-view";

/**
 * Side panel with full commit metadata + changed files + per-file diffs.
 */
export function CommitDetails({
  repoPath,
  hash,
  remotes = [],
  headHash,
  onClose,
  onNavigate,
  onCherryPick,
  onCompareWithHead,
  bookmark = null,
  note = null,
  onOpenBookmarkEditor,
  onRemoveBookmark,
  onOpenNoteEditor,
  onRemoveNote,
  className,
}) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [openFile, setOpenFile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });
    setOpenFile(null);
    api
      .commitDetails({ repositoryPath: repoPath, hash })
      .then((response) => {
        if (cancelled) return;
        if (!response?.ok) setState({ loading: false, error: response?.error?.message ?? "Failed to load commit.", data: null });
        else setState({ loading: false, error: null, data: response.data });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error: error?.message ?? "Failed to load commit.", data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath, hash]);

  const details = state.data;
  const isHead = headHash && details?.hash === headHash;

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-card/40", className)}>
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          {openFile ? (
            <>
              <button
                type="button"
                onClick={() => setOpenFile(null)}
                className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
              </button>
              <FilePathLabel path={openFile.path} oldPath={openFile.oldPath} className="min-w-0" />
              <DiffStat additions={openFile.additions} deletions={openFile.deletions} binary={openFile.binary} />
            </>
          ) : (
            <>
              <span>Commit</span>
              {details && <code className="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{details.shortHash}</code>}
              {details && <CopyButton value={details.hash} title="Copy full hash" />}
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!openFile && details && (bookmark ? onRemoveBookmark || onOpenBookmarkEditor : onOpenBookmarkEditor) && (
            <>
              <Button
                size="sm"
                variant={bookmark ? "secondary" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => bookmark ? onRemoveBookmark?.(bookmark) : onOpenBookmarkEditor?.(details.hash)}
                aria-label={bookmark ? "Remove bookmark" : "Add bookmark"}
              >
                {bookmark ? <Star className="fill-amber-400 text-amber-400" /> : <Bookmark />} {bookmark ? "Bookmarked" : "Bookmark"}
              </Button>
              {bookmark && onOpenBookmarkEditor && (
                <Button size="icon" variant="ghost" className="size-7" onClick={() => onOpenBookmarkEditor(details.hash)} title="Edit bookmark" aria-label="Edit bookmark">
                  <Pencil />
                </Button>
              )}
            </>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {state.loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Loading commit…
        </div>
      ) : state.error ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-red-400">{state.error}</div>
      ) : openFile ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <DiffView
            repoPath={repoPath}
            request={{ from: details.parents[0] ?? null, to: details.hash, path: openFile.path, oldPath: openFile.oldPath || undefined }}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="space-y-3 p-4">
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                {details.isMerge && (
                  <Badge variant="info">
                    <GitMerge className="size-3" /> merge
                  </Badge>
                )}
                {isHead && <Badge variant="success">HEAD</Badge>}
                {details.signature === "G" && (
                  <Badge variant="success">
                    <ShieldCheck className="size-3" /> signed
                  </Badge>
                )}
                <RefChipList refs={details.refs} remotes={remotes} max={6} />
              </div>
              <h3 className="mt-2 text-sm font-semibold leading-snug">{details.subject || "Untitled commit"}</h3>
              {details.body && (
                <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 font-sans text-xs leading-5 text-muted-foreground">
                  {details.body}
                </pre>
              )}
            </div>

            <div className="space-y-2 rounded-lg border border-border/70 p-3 text-xs">
              <div className="flex items-center gap-2.5">
                <AuthorAvatar name={details.author.name} email={details.author.email} size={24} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground">{details.author.name}</div>
                  <div className="truncate text-muted-foreground">{details.author.email}</div>
                </div>
                <div className="text-right text-muted-foreground" title={formatDate(details.author.date)}>
                  {formatRelativeDate(details.author.date)}
                </div>
              </div>
              {(details.committer.name !== details.author.name || details.committer.email !== details.author.email) && (
                <div className="flex items-center gap-2.5 border-t border-border/60 pt-2">
                  <AuthorAvatar name={details.committer.name} email={details.committer.email} size={24} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-foreground">{details.committer.name}</div>
                    <div className="truncate text-muted-foreground">committed · {details.committer.email}</div>
                  </div>
                  <div className="text-right text-muted-foreground" title={formatDate(details.committer.date)}>
                    {formatRelativeDate(details.committer.date)}
                  </div>
                </div>
              )}
              {details.parents.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2 text-muted-foreground">
                  <span>{details.parents.length > 1 ? "Parents" : "Parent"}</span>
                  {details.parents.map((parent) => (
                    <button
                      key={parent}
                      type="button"
                      onClick={() => onNavigate?.(parent)}
                      className="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[11px] transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {parent.slice(0, 8)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {(onCherryPick || onCompareWithHead) && (
              <div className="flex flex-wrap gap-2">
                {onCherryPick && !isHead && (
                  <Button size="sm" variant="outline" onClick={() => onCherryPick([details.hash])}>
                    <Cherry className="text-rose-500" /> Cherry-pick…
                  </Button>
                )}
                {onCompareWithHead && !isHead && (
                  <Button size="sm" variant="outline" onClick={() => onCompareWithHead(details.hash)}>
                    <GitCompareArrows /> Diff vs HEAD
                  </Button>
                )}
              </div>
            )}
            {(note || onOpenNoteEditor) && (
              <div className="space-y-2 rounded-lg border border-border/70 p-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="size-3.5 text-primary" />
                  <span className="text-xs font-medium">Local note</span>
                  <span className="flex-1" />
                  {note ? (
                    <>
                      {onOpenNoteEditor && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onOpenNoteEditor(details.hash)}><Pencil /> Edit</Button>}
                      {onRemoveNote && <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-red-400" onClick={() => onRemoveNote(note)} title="Remove local note" aria-label="Remove local note"><Trash2 /></Button>}
                    </>
                  ) : (
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onOpenNoteEditor?.(details.hash)}><MessageSquare /> Add note</Button>
                  )}
                </div>
                {note ? (
                  <div className="rounded-md bg-muted/40 p-2.5">
                    {note.title && <div className="mb-1 text-xs font-medium">{note.title}</div>}
                    <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-5 text-muted-foreground">{note.body}</pre>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Add private context for this commit.</p>
                )}
              </div>
            )}
          </div>

          <Separator />

          <div className="p-2">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {details.files.length} changed {details.files.length === 1 ? "file" : "files"}
                {details.isMerge && <span className="ml-1 opacity-70">(vs first parent)</span>}
              </span>
              <DiffStat additions={details.additions} deletions={details.deletions} />
            </div>
            <div className="space-y-0.5">
              {details.files.map((file) => (
                <button
                  key={`${file.status}-${file.path}`}
                  type="button"
                  onClick={() => setOpenFile(file)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/50"
                >
                  <FileStatusBadge status={file.status} />
                  <FilePathLabel path={file.path} oldPath={file.oldPath} className="min-w-0 flex-1" />
                  <DiffStat additions={file.additions} deletions={file.deletions} binary={file.binary} />
                </button>
              ))}
              {details.files.length === 0 && (
                <div className="px-2 py-6 text-center text-xs text-muted-foreground">No file changes recorded.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
