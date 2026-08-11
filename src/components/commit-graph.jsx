import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Cherry,
  ChevronDown,
  CircleDot,
  Copy,
  Eye,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  ListFilter,
  LoaderCircle,
  LocateFixed,
  MessageSquare,
  Search,
  Star,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { buildGraph } from "@/lib/git-graph";
import { classifyRef, cn, copyText, formatCount, formatDate, formatRelativeDate } from "@/lib/utils";
import { AuthorAvatar } from "@/components/author-avatar";
import { CommitDetails } from "@/components/commit-details";
import { RefChipList } from "@/components/ref-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

const ROW_HEIGHT = 44;
const CELL = 16;
const GRAPH_PAD = 14;
const OVERSCAN = 10;
const PAGE_SIZE = 1000;

const laneX = (lane) => GRAPH_PAD + lane * CELL;

function edgePath(edge) {
  const x1 = laneX(edge.from);
  const x2 = laneX(edge.to);
  const y1 = -ROW_HEIGHT / 2;
  const y2 = ROW_HEIGHT / 2;
  if (x1 === x2) return `M ${x1} ${y1} L ${x1} ${y2}`;
  const bend = ROW_HEIGHT * 0.55;
  return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
}

function GraphRow({ row, width, isHead }) {
  const cx = laneX(row.lane);
  const cy = ROW_HEIGHT / 2;
  return (
    <svg width={width} height={ROW_HEIGHT} className="shrink-0 overflow-visible" aria-hidden>
      {row.edges.map((edge, index) => (
        <path
          key={index}
          d={edgePath(edge)}
          fill="none"
          stroke={edge.color}
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.9"
        />
      ))}
      {isHead && <circle cx={cx} cy={cy} r="8" fill="none" stroke={row.color} strokeWidth="1.5" opacity="0.45" />}
      {row.isMerge ? (
        <>
          <circle cx={cx} cy={cy} r="4.5" fill="var(--background)" stroke={row.color} strokeWidth="2" />
          <circle cx={cx} cy={cy} r="1.6" fill={row.color} />
        </>
      ) : (
        <circle cx={cx} cy={cy} r="4.5" fill={row.color} stroke="var(--background)" strokeWidth="1.5" />
      )}
    </svg>
  );
}

function useContainerSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 600 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export function CommitGraph({
  data,
  onCompare,
  onCherryPick,
  onShowWorkspace,
  graphRequest,
  bookmarks = [],
  notes = [],
  onOpenBookmarkEditor,
  onRemoveBookmark,
  onOpenNoteEditor,
  onRemoveNote,
  onCommitSelected,
}) {
  const repoPath = data.repository.rootPath;
  const remoteNames = useMemo(() => data.remotes.map((remote) => remote.name), [data.remotes]);

  const [commits, setCommits] = useState(data.commits);
  const [total, setTotal] = useState(data.repository.totalCommits ?? data.commits.length);
  const [order, setOrder] = useState("topo");
  const [refFilter, setRefFilter] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [listError, setListError] = useState(null);

  const [selected, setSelected] = useState(() => new Set());
  const [anchorIndex, setAnchorIndex] = useState(null);
  const [detailHash, setDetailHash] = useState(null);
  const [query, setQuery] = useState("");
  const [matchCursor, setMatchCursor] = useState(0);
  const [pendingFocus, setPendingFocus] = useState(null);

  const containerRef = useRef(null);
  const searchRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const { height: viewHeight } = useContainerSize(containerRef);

  const { rows, maxLanes } = useMemo(() => buildGraph(commits), [commits]);
  const bookmarkByHash = useMemo(() => new Map(bookmarks.map((bookmark) => [bookmark.commitHash, bookmark])), [bookmarks]);
  const noteByHash = useMemo(() => new Map(notes.map((note) => [note.targetId, note])), [notes]);
  const indexByHash = useMemo(() => {
    const map = new Map();
    rows.forEach((row, index) => map.set(row.commit.hash, index));
    return map;
  }, [rows]);

  const branchColors = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      for (const label of row.commit.refs) {
        const ref = classifyRef(label, remoteNames);
        if ((ref.type === "head" || ref.type === "branch") && !map.has(ref.branch)) map.set(ref.branch, row.color);
      }
    }
    return map;
  }, [rows, remoteNames]);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return null;
    const list = [];
    rows.forEach((row, index) => {
      const commit = row.commit;
      const haystack = `${commit.hash} ${commit.subject} ${commit.author} ${commit.email} ${commit.refs.join(" ")}`.toLowerCase();
      if (haystack.includes(normalized)) list.push(index);
    });
    return list;
  }, [rows, query]);
  const matchSet = useMemo(() => (matches ? new Set(matches) : null), [matches]);

  const scrollToIndex = useCallback((index, center = true) => {
    const container = containerRef.current;
    if (!container || index == null || index < 0) return;
    const target = index * ROW_HEIGHT - (center ? container.clientHeight / 2 - ROW_HEIGHT : 0);
    container.scrollTo({ top: Math.max(0, target), behavior: "auto" });
  }, []);

  const selectSingle = useCallback((hash, index, { openDetails = true } = {}) => {
    setSelected(new Set([hash]));
    setAnchorIndex(index);
    onCommitSelected?.(hash);
    if (openDetails) setDetailHash(hash);
  }, [onCommitSelected]);

  const fetchList = useCallback(
    async ({ refs, nextOrder, append = false } = {}) => {
      const useRefs = refs !== undefined ? refs : refFilter;
      const useOrder = nextOrder ?? order;
      const skip = append ? commits.length : 0;
      append ? setMoreLoading(true) : setListLoading(true);
      setListError(null);
      try {
        const response = await api.listCommits({
          repositoryPath: repoPath,
          refs: useRefs ?? undefined,
          order: useOrder,
          limit: PAGE_SIZE,
          skip,
        });
        if (!response?.ok) {
          setListError(response?.error?.message ?? "Failed to load commits.");
          return;
        }
        setTotal(response.data.total);
        setCommits((current) => {
          if (!append) return response.data.commits;
          const seen = new Set(current.map((commit) => commit.hash));
          return [...current, ...response.data.commits.filter((commit) => !seen.has(commit.hash))];
        });
      } catch (error) {
        setListError(error?.message ?? "Failed to load commits.");
      } finally {
        append ? setMoreLoading(false) : setListLoading(false);
      }
    },
    [repoPath, refFilter, order, commits.length],
  );

  // Refresh local list when a rescan replaces the data prop.
  const scannedAt = data.scannedAt;
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    if (refFilter || order !== "topo") {
      fetchList({});
    } else {
      setCommits(data.commits);
      setTotal(data.repository.totalCommits ?? data.commits.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedAt]);

  // External requests (e.g. "show branch in graph", "focus commit").
  useEffect(() => {
    if (!graphRequest) return;
    const requestedOrder = graphRequest.order === "date" || graphRequest.order === "topo" ? graphRequest.order : null;
    if (requestedOrder && requestedOrder !== order) {
      setOrder(requestedOrder);
      fetchList({ refs: graphRequest.refs, nextOrder: requestedOrder });
    }
    if (graphRequest.refs !== undefined) {
      setRefFilter(graphRequest.refs);
      if (!requestedOrder) fetchList({ refs: graphRequest.refs });
    }
    if (graphRequest.query !== undefined) setQuery(graphRequest.query ?? "");
    if (graphRequest.focusHash) setPendingFocus(graphRequest.focusHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphRequest]);

  useEffect(() => {
    if (!pendingFocus) return;
    const index = indexByHash.get(pendingFocus);
    if (index != null) {
      selectSingle(pendingFocus, index);
      scrollToIndex(index);
      setPendingFocus(null);
    }
  }, [pendingFocus, indexByHash, selectSingle, scrollToIndex]);

  useEffect(() => {
    setMatchCursor(0);
    if (matches && matches.length > 0) scrollToIndex(matches[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const gotoMatch = useCallback(
    (direction) => {
      if (!matches || matches.length === 0) return;
      const next = ((matchCursor + direction) % matches.length + matches.length) % matches.length;
      setMatchCursor(next);
      scrollToIndex(matches[next]);
    },
    [matches, matchCursor, scrollToIndex],
  );

  const applyFilter = useCallback(
    (refs) => {
      setRefFilter(refs);
      setSelected(new Set());
      setDetailHash(null);
      fetchList({ refs });
    },
    [fetchList],
  );

  const changeOrder = useCallback(
    (nextOrder) => {
      if (nextOrder === order) return;
      setOrder(nextOrder);
      fetchList({ nextOrder });
    },
    [order, fetchList],
  );

  const handleRowClick = useCallback(
    (event, row, index) => {
      const hash = row.commit.hash;
      if (event.shiftKey && anchorIndex != null) {
        const [from, to] = [Math.min(anchorIndex, index), Math.max(anchorIndex, index)];
        const range = new Set();
        for (let i = from; i <= to; i++) range.add(rows[i].commit.hash);
        setSelected(range);
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(hash)) next.delete(hash);
          else next.add(hash);
          return next;
        });
        setAnchorIndex(index);
        return;
      }
      selectSingle(hash, index);
    },
    [anchorIndex, rows, selectSingle],
  );

  const handleKeyDown = useCallback(
    (event) => {
      if (event.target instanceof HTMLInputElement) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c" && selected.size > 0) {
        event.preventDefault();
        copyText([...selected].join("\n"));
        return;
      }
      if (event.key === "Escape") {
        setSelected(new Set());
        setDetailHash(null);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const currentIndex = anchorIndex ?? (detailHash != null ? indexByHash.get(detailHash) : null) ?? -delta;
        const next = Math.min(rows.length - 1, Math.max(0, currentIndex + delta));
        if (rows[next]) {
          selectSingle(rows[next].commit.hash, next, { openDetails: detailHash != null });
          const container = containerRef.current;
          if (container) {
            const top = next * ROW_HEIGHT;
            if (top < container.scrollTop || top + ROW_HEIGHT > container.scrollTop + container.clientHeight) {
              scrollToIndex(next, false);
            }
          }
        }
        return;
      }
      if (event.key === "Enter" && anchorIndex != null && rows[anchorIndex]) {
        setDetailHash(rows[anchorIndex].commit.hash);
      }
    },
    [anchorIndex, detailHash, indexByHash, rows, scrollToIndex, selectSingle, selected],
  );

  const jumpToHead = useCallback(() => {
    const index = indexByHash.get(data.repository.head);
    if (index != null) {
      selectSingle(data.repository.head, index);
      scrollToIndex(index);
    } else {
      setPendingFocus(data.repository.head);
      if (refFilter) applyFilter(null);
    }
  }, [indexByHash, data.repository.head, selectSingle, scrollToIndex, refFilter, applyFilter]);

  const selectedRows = useMemo(
    () =>
      [...selected]
        .map((hash) => ({ hash, index: indexByHash.get(hash) }))
        .filter((entry) => entry.index != null)
        .sort((a, b) => a.index - b.index),
    [selected, indexByHash],
  );

  const graphWidth = GRAPH_PAD * 2 + Math.min(maxLanes, 24) * CELL;
  const hasMore = total != null && commits.length < total;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(rows.length, Math.ceil((scrollTop + viewHeight) / ROW_HEIGHT) + OVERSCAN);
  const visibleRows = rows.slice(startIndex, endIndex);
  const dirtyCount = data.status.files.length;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <div className="mr-auto flex items-center gap-3">
            <div>
              <h2 className="text-sm font-semibold leading-tight">Commits</h2>
              <p className="text-[11px] text-muted-foreground">
                {formatCount(commits.length)}
                {total != null && total > commits.length ? ` of ${formatCount(total)}` : ""} commits
                {refFilter ? ` · ${refFilter.join(", ")}` : " · all refs"}
              </p>
            </div>
            {listLoading && <LoaderCircle className="size-4 animate-spin text-muted-foreground" />}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") gotoMatch(event.shiftKey ? -1 : 1);
                if (event.key === "Escape") setQuery("");
              }}
              placeholder="Search hash, message, author, ref"
              className="h-8 w-64 pl-8 pr-24 text-xs"
            />
            {query && (
              <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 text-[11px] text-muted-foreground">
                <span className="tabular-nums">
                  {matches.length === 0 ? "0/0" : `${matchCursor + 1}/${matches.length}`}
                </span>
                <button type="button" onClick={() => gotoMatch(-1)} className="rounded p-0.5 hover:bg-accent hover:text-foreground">
                  <ArrowUp className="size-3" />
                </button>
                <button type="button" onClick={() => gotoMatch(1)} className="rounded p-0.5 hover:bg-accent hover:text-foreground">
                  <ArrowDown className="size-3" />
                </button>
                <button type="button" onClick={() => setQuery("")} className="rounded p-0.5 hover:bg-accent hover:text-foreground">
                  <X className="size-3" />
                </button>
              </div>
            )}
          </div>

          <BranchFilter branches={data.branches} tags={data.tags} value={refFilter} onChange={applyFilter} />

          <div className="flex h-8 items-center rounded-lg bg-muted/60 p-0.5 text-xs">
            {[
              ["topo", "Topology"],
              ["date", "Date"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => changeOrder(value)}
                className={cn(
                  "h-7 rounded-md px-2.5 transition-colors",
                  order === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <Button variant="outline" size="sm" className="h-8" onClick={jumpToHead} title="Scroll to current HEAD">
            <LocateFixed /> HEAD
          </Button>
        </div>

        {listError && (
          <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-1.5 text-xs text-red-400">{listError}</div>
        )}

        {dirtyCount > 0 && (
          <button
            type="button"
            onClick={onShowWorkspace}
            className="group flex shrink-0 items-center gap-2.5 border-b border-amber-500/15 bg-amber-500/[0.07] px-4 py-2 text-left text-xs transition-colors hover:bg-amber-500/15"
          >
            <span className="relative flex size-[18px] items-center justify-center">
              <span className="absolute size-[14px] rounded-full border-2 border-dashed border-amber-500/80" />
            </span>
            <span className="font-medium text-amber-600 dark:text-amber-400">
              {dirtyCount} uncommitted {dirtyCount === 1 ? "change" : "changes"} on {data.repository.currentBranch}
            </span>
            <span className="ml-auto text-muted-foreground transition-colors group-hover:text-foreground">
              Open workspace →
            </span>
          </button>
        )}

        <div className="relative min-h-0 flex-1">
          <div
            ref={containerRef}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            className="h-full overflow-auto outline-none"
          >
            {rows.length === 0 && !listLoading ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <GitCommitHorizontal className="size-10" />
                <p className="text-sm">No commits found{refFilter ? " for this filter." : " in this repository yet."}</p>
                {refFilter && (
                  <Button variant="outline" size="sm" onClick={() => applyFilter(null)}>
                    Show all refs
                  </Button>
                )}
              </div>
            ) : (
              <div
                className="relative"
                style={{ height: rows.length * ROW_HEIGHT + (hasMore ? 64 : 16), minWidth: graphWidth + 660 }}
              >
                {visibleRows.map((row, sliceIndex) => {
                  const index = startIndex + sliceIndex;
                  const commit = row.commit;
                  const isSelected = selected.has(commit.hash);
                  const isHead = commit.hash === data.repository.head;
                  const bookmark = bookmarkByHash.get(commit.hash);
                  const note = noteByHash.get(commit.hash);
                  const dimmed = matchSet && !matchSet.has(index);
                  const isActiveMatch = matchSet && matches[matchCursor] === index;
                  return (
                    <ContextMenu key={commit.hash}>
                      <ContextMenuTrigger asChild>
                        <div
                          role="row"
                          onClick={(event) => handleRowClick(event, row, index)}
                          onContextMenu={() => {
                            if (!selected.has(commit.hash)) selectSingle(commit.hash, index, { openDetails: false });
                          }}
                          style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
                          className={cn(
                            "absolute left-0 right-0 flex cursor-pointer select-none items-center border-b border-border/40 pr-4 transition-[background-color,opacity]",
                            isSelected ? "bg-primary/10" : "hover:bg-accent/40",
                            isActiveMatch && "ring-1 ring-inset ring-primary/60",
                            dimmed && "opacity-35",
                          )}
                        >
                          <span
                            className={cn("absolute inset-y-0 left-0 w-[2.5px]", isSelected ? "bg-primary" : "bg-transparent")}
                          />
                          <GraphRow row={row} width={graphWidth} isHead={isHead} />
                          <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-1">
                            {bookmark && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" title="Bookmarked commit" aria-label="Bookmarked commit" />}
                            <RefChipList
                              refs={commit.refs}
                              remotes={remoteNames}
                              colorFor={(label) => branchColors.get(classifyRef(label, remoteNames).branch)}
                              onRefClick={(label) => {
                                const ref = classifyRef(label, remoteNames);
                                if (ref.type !== "detached") applyFilter([ref.name]);
                              }}
                              max={3}
                            />
                            <span className={cn("truncate text-[13px]", row.isMerge ? "text-muted-foreground" : "text-foreground")}>
                              {commit.subject || "Untitled commit"}
                            </span>
                          </div>
                          <div className="flex w-40 shrink-0 items-center gap-2 pl-3">
                            <AuthorAvatar name={commit.author} email={commit.email} size={20} />
                            <span className="truncate text-xs text-muted-foreground">{commit.author}</span>
                          </div>
                          <code className="w-[76px] shrink-0 text-right font-mono text-[11px] text-muted-foreground/80">
                            {commit.shortHash.slice(0, 7)}
                          </code>
                          <span
                            className="w-[92px] shrink-0 text-right text-[11px] text-muted-foreground"
                            title={formatDate(commit.date)}
                          >
                            {formatRelativeDate(commit.date)}
                          </span>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuLabel className="font-mono">{commit.shortHash}</ContextMenuLabel>
                        <ContextMenuItem onSelect={() => selectSingle(commit.hash, index)}>
                          <Eye /> View details
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => copyText(commit.hash)}>
                          <Copy /> Copy hash
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => copyText(commit.subject)}>
                          <Copy /> Copy message
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onSelect={() => bookmark ? onRemoveBookmark?.(bookmark) : onOpenBookmarkEditor?.(commit.hash)}
                          disabled={bookmark ? !onRemoveBookmark : !onOpenBookmarkEditor}
                        >
                          {bookmark ? <Star className="fill-amber-400 text-amber-400" /> : <Bookmark />}
                          {bookmark ? "Remove bookmark" : "Add bookmark"}
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => onOpenNoteEditor?.(commit.hash)} disabled={!onOpenNoteEditor}>
                          <MessageSquare /> {note ? "Edit local note" : "Add local note"}
                        </ContextMenuItem>
                        {note && onRemoveNote && (
                          <ContextMenuItem onSelect={() => onRemoveNote(note)}>
                            <MessageSquare /> Remove local note
                          </ContextMenuItem>
                        )}
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onSelect={() =>
                            onCherryPick(
                              selected.has(commit.hash) && selected.size > 1 ? selectedRows.map((entry) => entry.hash) : [commit.hash],
                            )
                          }
                        >
                          <Cherry className="!text-rose-500" />
                          Cherry-pick {selected.has(commit.hash) && selected.size > 1 ? `${selected.size} commits` : "commit"} onto{" "}
                          {data.repository.currentBranch}…
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem onSelect={() => onCompare(commit.hash, data.repository.head)} disabled={isHead}>
                          <GitCompareArrows /> Compare with HEAD
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}

                {hasMore && (
                  <div
                    className="absolute left-0 right-0 flex items-center justify-center"
                    style={{ top: rows.length * ROW_HEIGHT, height: 56 }}
                  >
                    <Button variant="outline" size="sm" disabled={moreLoading} onClick={() => fetchList({ append: true })}>
                      {moreLoading ? <LoaderCircle className="animate-spin" /> : <ChevronDown />}
                      Load {formatCount(Math.min(PAGE_SIZE, (total ?? 0) - commits.length))} more
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {selected.size > 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
              <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-popover/95 py-1.5 pl-4 pr-1.5 shadow-xl backdrop-blur">
                <span className="text-xs font-medium tabular-nums">
                  {selected.size} {selected.size === 1 ? "commit" : "commits"} selected
                </span>
                <div className="mx-1 h-4 w-px bg-border" />
                <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={() => onCherryPick(selectedRows.map((entry) => entry.hash))}>
                  <Cherry className="!text-rose-500" /> Cherry-pick
                </Button>
                {selected.size === 2 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 rounded-full"
                    onClick={() => onCompare(selectedRows[1].hash, selectedRows[0].hash)}
                    title="Compare older → newer"
                  >
                    <GitCompareArrows /> Compare
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 rounded-full"
                  onClick={() => copyText(selectedRows.map((entry) => entry.hash).join("\n"))}
                >
                  <Copy /> Hashes
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(new Set());
                    setDetailHash(null);
                  }}
                  className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {detailHash && (
        <div className="w-[420px] shrink-0 border-l border-border xl:w-[460px]">
          <CommitDetails
            repoPath={repoPath}
            hash={detailHash}
            remotes={remoteNames}
            headHash={data.repository.head}
            onClose={() => setDetailHash(null)}
            onNavigate={(hash) => {
              const index = indexByHash.get(hash);
              if (index != null) {
                selectSingle(hash, index);
                scrollToIndex(index);
              } else {
                setDetailHash(hash);
              }
            }}
            onCherryPick={onCherryPick}
            onCompareWithHead={(hash) => onCompare(hash, data.repository.head)}
            bookmark={bookmarkByHash.get(detailHash) ?? null}
            note={noteByHash.get(detailHash) ?? null}
            onOpenBookmarkEditor={onOpenBookmarkEditor}
            onRemoveBookmark={onRemoveBookmark}
            onOpenNoteEditor={onOpenNoteEditor}
            onRemoveNote={onRemoveNote}
          />
        </div>
      )}
    </div>
  );
}

function BranchFilter({ branches, tags, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");

  const selected = useMemo(() => new Set(value ?? []), [value]);
  const local = branches.filter((branch) => !branch.remote);
  const remote = branches.filter((branch) => branch.remote);

  const toggle = (name) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(next.size === 0 ? null : [...next]);
  };

  const normalized = filterQuery.trim().toLowerCase();
  const show = (name) => !normalized || name.toLowerCase().includes(normalized);

  const section = (title, items, getName) => {
    const visible = items.filter((item) => show(getName(item)));
    if (visible.length === 0) return null;
    return (
      <div key={title}>
        <div className="px-2 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">{title}</div>
        {visible.slice(0, 60).map((item) => {
          const name = getName(item);
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                selected.has(name) && "text-primary",
              )}
            >
              <span
                className={cn(
                  "flex size-3.5 shrink-0 items-center justify-center rounded border",
                  selected.has(name) ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {selected.has(name) && <span className="text-[9px] leading-none">✓</span>}
              </span>
              <span className="truncate">{name}</span>
              {item.current && (
                <Badge variant="success" className="ml-auto">
                  current
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-8", value && "border-primary/50 text-primary")}>
          <ListFilter />
          {value ? `${value.length} ${value.length === 1 ? "ref" : "refs"}` : "All refs"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="border-b border-border p-2">
          <Input
            value={filterQuery}
            onChange={(event) => setFilterQuery(event.target.value)}
            placeholder="Filter branches and tags"
            className="h-8 text-xs"
          />
        </div>
        <div className="max-h-80 overflow-auto p-1.5">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
              !value && "font-medium text-primary",
            )}
          >
            <GitBranch className="size-3.5" /> All refs
          </button>
          {section("Local branches", local, (branch) => branch.name)}
          {section("Remote branches", remote, (branch) => branch.name)}
          {section("Tags", tags, (tag) => tag.name)}
        </div>
        {value && (
          <div className="border-t border-border p-1.5">
            <Button variant="ghost" size="sm" className="h-7 w-full" onClick={() => onChange(null)}>
              <CircleDot /> Reset filter
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
