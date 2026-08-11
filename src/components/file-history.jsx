import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Calendar, FileWarning, History as HistoryIcon, LoaderCircle, Search, Star, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDate, formatRelativeDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton, DiffView, FilePathLabel, FileStatusBadge } from "@/components/diff-view";
import { RevisionFileView } from "@/components/revision-file-view";

export const FILE_HISTORY_PAGE_SIZE = 200;

const DATE_FILTERS = [
  ["all", "All dates"],
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["365d", "Last year"],
];

function filterHistoryEntries(entries, query, author, dateFilter) {
  const normalizedQuery = query.trim().toLowerCase();
  const cutoff = dateFilter === "all" ? null : Date.now() - Number(dateFilter.slice(0, -1)) * (dateFilter.endsWith("d") ? 24 * 60 * 60 * 1000 : 1);
  return entries.filter((entry) => {
    if (author !== "all" && entry.author.name !== author) return false;
    if (cutoff && new Date(entry.date).getTime() < cutoff) return false;
    if (!normalizedQuery) return true;
    return [entry.subject, entry.author.name, entry.author.email, entry.hash, entry.shortHash, entry.path, entry.oldPath]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
  });
}

export function FileHistory({ repoPath, node, state, bookmarkedHashes, onStateChange, onClose }) {
  const [loadState, setLoadState] = useState({ loading: false, error: null });
  const [query, setQuery] = useState("");
  const [author, setAuthor] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const listRef = useRef(null);
  const entries = state?.entries ?? [];
  const requestKey = useMemo(() => `${repoPath ?? ""}\u0000${node?.path ?? ""}`, [repoPath, node?.path]);
  const authors = useMemo(
    () => [...new Set(entries.map((entry) => entry.author.name).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
    [entries],
  );
  const filteredEntries = useMemo(() => filterHistoryEntries(entries, query, author, dateFilter), [entries, query, author, dateFilter]);
  const selectedEntry = entries.find((entry) => entry.hash === state?.selectedHash) ?? null;
  const bookmarkSet = useMemo(() => bookmarkedHashes instanceof Set ? bookmarkedHashes : new Set(bookmarkedHashes ?? []), [bookmarkedHashes]);

  useEffect(() => {
    if (!node || state?.selectedPath !== node.path || state?.loaded) return undefined;
    let cancelled = false;
    setLoadState({ loading: true, error: null });
    api
      .fileHistory({ repositoryPath: repoPath, path: node.path, limit: FILE_HISTORY_PAGE_SIZE, skip: 0 })
      .then((response) => {
        if (cancelled) return;
        if (!response?.ok) {
          setLoadState({ loading: false, error: response?.error?.message ?? "Failed to load file history." });
          return;
        }
        setLoadState({ loading: false, error: null });
        onStateChange?.({
          ...state,
          selectedPath: node.path,
          entries: response.data?.entries ?? [],
          hasMore: Boolean(response.data?.hasMore),
          loaded: true,
          scrollTop: 0,
        });
      })
      .catch((error) => {
        if (!cancelled) setLoadState({ loading: false, error: error?.message ?? "Failed to load file history." });
      });
    return () => {
      cancelled = true;
    };
  }, [node, onStateChange, repoPath, requestKey, state]);

  useEffect(() => {
    if (state?.loaded && listRef.current) listRef.current.scrollTop = state.scrollTop ?? 0;
  }, [state?.loaded, state?.selectedPath]);

  const loadMore = () => {
    if (!node || loadState.loading || !state?.hasMore) return;
    let cancelled = false;
    setLoadState({ loading: true, error: null });
    api
      .fileHistory({ repositoryPath: repoPath, path: node.path, limit: FILE_HISTORY_PAGE_SIZE, skip: entries.length })
      .then((response) => {
        if (cancelled) return;
        if (!response?.ok) {
          setLoadState({ loading: false, error: response?.error?.message ?? "Failed to load more file history." });
          return;
        }
        setLoadState({ loading: false, error: null });
        onStateChange?.({
          ...state,
          entries: [...entries, ...(response.data?.entries ?? [])],
          hasMore: Boolean(response.data?.hasMore),
          loaded: true,
        });
      })
      .catch((error) => {
        if (!cancelled) setLoadState({ loading: false, error: error?.message ?? "Failed to load more file history." });
      });
    return () => {
      cancelled = true;
    };
  };

  const selectEntry = (entry) => onStateChange?.({ ...state, selectedHash: entry.hash, detailMode: "diff" });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose} title="Back to preview" aria-label="Back to preview">
          <ArrowLeft />
        </Button>
        <HistoryIcon className="size-4 text-primary" />
        <FilePathLabel path={node?.path ?? state?.selectedPath ?? ""} oldPath={selectedEntry?.oldPath} className="min-w-0 flex-1 text-xs" />
        <Badge variant="muted">{entries.length.toLocaleString()} commits</Badge>
        <CopyButton value={node?.path ?? state?.selectedPath ?? ""} title="Copy path" />
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search history…" aria-label="Search file history" className="h-8 pl-8 text-xs" />
        </div>
        <label className="flex h-8 items-center gap-1.5 rounded-md border border-input bg-background/70 px-2 text-xs text-muted-foreground">
          <UserRound className="size-3.5" />
          <select value={author} onChange={(event) => setAuthor(event.target.value)} aria-label="Filter history by author" className="bg-transparent text-foreground outline-none">
            <option value="all">All authors</option>
            {authors.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="flex h-8 items-center gap-1.5 rounded-md border border-input bg-background/70 px-2 text-xs text-muted-foreground">
          <Calendar className="size-3.5" />
          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label="Filter history by date" className="bg-transparent text-foreground outline-none">
            {DATE_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      <div className="flex min-h-0 flex-1">
        <div ref={listRef} onScroll={(event) => onStateChange?.({ ...state, scrollTop: event.currentTarget.scrollTop })} className="w-[min(360px,42%)] shrink-0 overflow-auto border-r border-border p-1.5">
          {loadState.loading && entries.length === 0 ? (
            <div className="flex h-full items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading history…</div>
          ) : loadState.error && entries.length === 0 ? (
            <div className="m-2 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-400"><FileWarning className="mt-0.5 size-4 shrink-0" />{loadState.error}</div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">No matching history.</div>
          ) : (
            <>
              {filteredEntries.map((entry) => (
                <button
                  key={entry.hash}
                  type="button"
                  onClick={() => selectEntry(entry)}
                  className={cn("mb-1 w-full rounded-lg border border-transparent p-2.5 text-left transition-colors hover:bg-accent/50", selectedEntry?.hash === entry.hash && "border-primary/30 bg-primary/10")}
                  title={entry.subject}
                >
                  <div className="flex items-start gap-2">
                    <FileStatusBadge status={entry.status} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{entry.subject || "Untitled commit"}</span>
                      <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <code className="font-mono">{entry.shortHash}</code>
                        {bookmarkSet.has(entry.hash) && <Star className="size-3 fill-amber-400 text-amber-400" title="Bookmarked commit" aria-label="Bookmarked commit" />}
                        <span>·</span>
                        <span className="truncate">{entry.author.name}</span>
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 pl-6 text-[10px] text-muted-foreground">
                    <FilePathLabel path={entry.path} oldPath={entry.oldPath} className="min-w-0" />
                    <span className="shrink-0" title={formatDate(entry.date)}>{formatRelativeDate(entry.date)}</span>
                  </div>
                </button>
              ))}
              {loadState.error && <div className="m-2 text-xs text-red-400">{loadState.error}</div>}
              {state?.hasMore && (
                <Button variant="outline" size="sm" className="my-2 w-full" onClick={loadMore} disabled={loadState.loading}>
                  {loadState.loading ? <LoaderCircle className="animate-spin" /> : null} Load more
                </Button>
              )}
            </>
          )}
        </div>

        <div className="min-w-0 flex-1 overflow-auto">
          {selectedEntry ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium">{selectedEntry.subject}</span>
                <code className="font-mono text-muted-foreground">{selectedEntry.shortHash}</code>
                <div role="tablist" aria-label="Commit file view" className="flex items-center gap-1">
                  <Button
                    role="tab"
                    aria-selected={state?.detailMode !== "revision"}
                    variant={state?.detailMode === "revision" ? "ghost" : "secondary"}
                    size="sm"
                    onClick={() => onStateChange?.({ ...state, detailMode: "diff" })}
                  >
                    Diff
                  </Button>
                  <Button
                    role="tab"
                    aria-selected={state?.detailMode === "revision"}
                    variant={state?.detailMode === "revision" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => onStateChange?.({ ...state, detailMode: "revision" })}
                  >
                    File at commit
                  </Button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                {state?.detailMode === "revision" ? (
                  <RevisionFileView repoPath={repoPath} entry={selectedEntry} />
                ) : (
                  <DiffView
                    repoPath={repoPath}
                    request={{ from: selectedEntry.parentHash, to: selectedEntry.hash, path: selectedEntry.path, oldPath: selectedEntry.oldPath || undefined }}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">Select a commit to view its file diff.</div>
          )}
        </div>
      </div>
    </div>
  );
}
