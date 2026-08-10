import { useEffect, useMemo, useState } from "react";
import { FileWarning, LoaderCircle, ScanLine } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDate, formatRelativeDate, copyText } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { CopyButton, FilePathLabel, FileStatusBadge } from "@/components/diff-view";

function lineNumberWidth(lineCount) {
  return `${Math.max(2, String(lineCount).length)}ch`;
}

function metadataKey(line) {
  return `${line.commitHash}\u0000${line.author.email}\u0000${line.author.name}`;
}

export function BlameView({
  repoPath,
  node,
  revision = null,
  dirty = false,
  onOpenCommit,
  onOpenFileAtRevision,
  onOpenPreviousRevision,
}) {
  const [state, setState] = useState({ loading: false, error: null, data: null });
  const requestKey = useMemo(() => `${repoPath ?? ""}\u0000${node?.path ?? ""}\u0000${revision ?? "HEAD"}`, [repoPath, node?.path, revision]);

  useEffect(() => {
    if (!node) {
      setState({ loading: false, error: null, data: null });
      return undefined;
    }
    if (typeof api.fileBlame !== "function") {
      setState({ loading: false, error: { message: "Blame is unavailable in this environment.", code: "UNAVAILABLE" }, data: null });
      return undefined;
    }

    let cancelled = false;
    setState({ loading: true, error: null, data: null });
    api
      .fileBlame({ repositoryPath: repoPath, path: node.path, ...(revision ? { revision } : {}) })
      .then((response) => {
        if (cancelled) return;
        if (!response?.ok) {
          setState({ loading: false, error: response?.error ?? { message: "Failed to load blame.", code: "BLAME_FAILED" }, data: null });
          return;
        }
        setState({ loading: false, error: null, data: response.data ?? null });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error: { message: error?.message ?? "Failed to load blame.", code: error?.code ?? "BLAME_FAILED" }, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [node, repoPath, requestKey, revision]);

  if (!node) {
    return <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">Select a file to inspect its blame.</div>;
  }
  if (state.loading) {
    return <div className="flex h-full items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading blame…</div>;
  }
  if (state.error) {
    const isLarge = state.error.code === "BLAME_TOO_LARGE";
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-red-400">
        <FileWarning className="size-6" />
        <p>{isLarge ? "Blame is disabled for very large files." : state.error.message}</p>
      </div>
    );
  }
  if (state.data?.binary) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
        <ScanLine className="size-6" />
        <p className="font-medium text-foreground">Blame unavailable for binary files.</p>
      </div>
    );
  }

  const lines = state.data?.lines ?? [];
  const selectedDirty = dirty || Boolean(state.data?.workingTreeDirty);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
        <FilePathLabel path={node.path} className="min-w-0 flex-1 text-xs" />
        <Badge variant="muted">{lines.length.toLocaleString()} lines</Badge>
        {state.data?.revision && <code className="shrink-0 font-mono text-[11px] text-muted-foreground">{state.data.revision.slice(0, 8)}</code>}
        <CopyButton value={node.path} title="Copy path" />
      </div>
      {selectedDirty && (
        <div role="status" className="flex shrink-0 items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-500">
          <FileStatusBadge status="M" />
          <span>Blame is based on HEAD; working tree has uncommitted changes.</span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto bg-background/40">
        <div className="sticky top-0 z-10 grid min-w-[760px] grid-cols-[10rem_6rem_7rem_minmax(0,1fr)] border-b border-border bg-background/95 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
          <span>Author</span>
          <span>Age</span>
          <span>Commit</span>
          <span>Code</span>
        </div>
        <div className="min-w-[760px] font-mono text-[12px] leading-5">
          {lines.map((line, index) => {
            const previous = lines[index - 1];
            const showMetadata = !previous || metadataKey(previous) !== metadataKey(line);
            return (
              <ContextMenu key={`${line.commitHash}-${line.lineNumber}`}>
                <ContextMenuTrigger asChild>
                  <div className="grid grid-cols-[10rem_6rem_7rem_minmax(0,1fr)] min-h-5 border-b border-border/20 hover:bg-accent/40" data-blame-line={line.lineNumber}>
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-1 border-r border-border/50 px-2 text-left text-[11px] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      onClick={() => onOpenCommit?.(line.commitHash)}
                      title={showMetadata ? `${line.author.name} <${line.author.email}>` : undefined}
                    >
                      {showMetadata ? <span className="truncate">{line.author.name || "Unknown author"}</span> : null}
                    </button>
                    <span className="truncate border-r border-border/50 px-2 text-[11px] text-muted-foreground" title={line.authorTime ? formatDate(line.authorTime) : undefined}>
                      {showMetadata && line.authorTime ? formatRelativeDate(line.authorTime) : ""}
                    </span>
                    <button
                      type="button"
                      className="truncate border-r border-border/50 px-2 text-left text-[11px] text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      onClick={() => onOpenCommit?.(line.commitHash)}
                      title={line.summary || line.commitHash}
                    >
                      {showMetadata ? line.shortHash : ""}
                    </button>
                    <code className="whitespace-pre px-3 text-foreground/90" title={line.content || "empty line"}>{line.content || " "}</code>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuLabel className="max-w-72 truncate font-mono">Line {line.lineNumber}</ContextMenuLabel>
                  <ContextMenuItem onSelect={() => onOpenCommit?.(line.commitHash)}>View commit</ContextMenuItem>
                  <ContextMenuItem onSelect={() => onOpenFileAtRevision?.(line.commitHash, node.path)}>View file at commit</ContextMenuItem>
                  <ContextMenuItem disabled={!line.previous} onSelect={() => line.previous && onOpenPreviousRevision?.(line.previous.hash, line.previous.path)}>View previous revision</ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => copyText(line.commitHash)}>Copy commit hash</ContextMenuItem>
                  <ContextMenuItem onSelect={() => copyText(line.content)}>Copy line</ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>{state.data?.authors?.length ?? 0} authors</span>
        {state.data?.cached && <Badge variant="muted">cached</Badge>}
        <span className="ml-auto">Click a commit or line gutter for details.</span>
      </div>
    </div>
  );
}
