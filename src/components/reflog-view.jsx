import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronRight,
  CircleAlert,
  CircleDot,
  Clock3,
  Copy,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  History as HistoryIcon,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Tag,
  UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, copyText, formatDate, formatRelativeDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  REFLOG_ACTION_OPTIONS,
  filterReflogEntries,
  findPreviousReflogEntry,
  getReflogEntryKey,
  groupReflogEntries,
  mergeReflogEntries,
} from "@/features/reflog/reflog-model";

export const REFLOG_PAGE_SIZE = 200;

const ACTION_VARIANTS = {
  commit: "success",
  amend: "success",
  checkout: "info",
  merge: "info",
  "cherry-pick": "warning",
  reset: "destructive",
  rebase: "warning",
  other: "muted",
};

function getResponseData(response) {
  return response?.data ?? response;
}

function actionLabel(action) {
  return REFLOG_ACTION_OPTIONS.find((option) => option.value === action)?.label ?? "Other";
}

function normalizeBookmarkedHashes(value) {
  if (value instanceof Set) return value;
  if (Array.isArray(value)) return new Set(value.filter(Boolean));
  return new Set();
}

function getLocalBranchOptions(branches = [], currentBranch = "") {
  const names = new Set();
  if (currentBranch && currentBranch !== "Detached HEAD") names.add(currentBranch);
  for (const branch of Array.isArray(branches) ? branches : []) {
    if (branch && !branch.remote && branch.name) names.add(branch.name);
  }
  return [...names].sort((left, right) => {
    if (left === currentBranch) return -1;
    if (right === currentBranch) return 1;
    return left.localeCompare(right);
  });
}

export function ReflogView({
  repoPath,
  currentHead,
  currentBranch,
  branches = [],
  revision,
  initialConfig = null,
  now,
  bookmarkedHashes,
  onViewCommit,
  onCompare,
}) {
  const [ref, setRef] = useState(() => initialConfig?.ref || "HEAD");
  const [action, setAction] = useState(() => initialConfig?.actions?.length === 1 ? initialConfig.actions[0] : "all");
  const [query, setQuery] = useState(() => initialConfig?.search || "");
  const [state, setState] = useState({ entries: [], hasMore: false, nextSkip: null, loading: true, loadingMore: false, error: null });
  const [selectedKey, setSelectedKey] = useState(null);
  const [reachability, setReachability] = useState(new Map());
  const [reachabilityState, setReachabilityState] = useState({ loading: false, error: null });
  const entriesRef = useRef([]);
  const requestIdRef = useRef(0);
  const branchOptions = useMemo(() => getLocalBranchOptions(branches, currentBranch), [branches, currentBranch]);
  const bookmarks = useMemo(() => normalizeBookmarkedHashes(bookmarkedHashes), [bookmarkedHashes]);

  useEffect(() => {
    if (!initialConfig) return;
    setRef(initialConfig.ref || "HEAD");
    setAction(initialConfig.actions?.length === 1 ? initialConfig.actions[0] : "all");
    setQuery(initialConfig.search || "");
    setSelectedKey(null);
  }, [initialConfig]);

  useEffect(() => {
    if (ref !== "HEAD" && !branchOptions.includes(ref)) setRef("HEAD");
  }, [branchOptions, ref]);

  const loadPage = useCallback(
    async ({ append = false, skip = 0 } = {}) => {
      const requestId = ++requestIdRef.current;
      if (!append) entriesRef.current = [];
      setState((previous) => ({
        ...previous,
        entries: append ? previous.entries : [],
        loading: !append,
        loadingMore: append,
        error: null,
      }));
      try {
        if (typeof api.listReflog !== "function") throw new Error("Reflog is unavailable in this environment.");
        const response = await api.listReflog({ repositoryPath: repoPath, ref, limit: REFLOG_PAGE_SIZE, skip });
        if (requestId !== requestIdRef.current) return;
        if (response?.ok === false) {
          setState((previous) => ({ ...previous, loading: false, loadingMore: false, error: response.error?.message ?? "Failed to load reflog." }));
          return;
        }
        const payload = getResponseData(response) ?? {};
        const incoming = Array.isArray(payload.entries) ? payload.entries : [];
        const nextEntries = append ? mergeReflogEntries(entriesRef.current, incoming) : mergeReflogEntries([], incoming);
        entriesRef.current = nextEntries;
        setState({
          entries: nextEntries,
          hasMore: Boolean(payload.hasMore),
          nextSkip: Number.isSafeInteger(payload.nextSkip) ? payload.nextSkip : payload.hasMore ? nextEntries.length : null,
          loading: false,
          loadingMore: false,
          error: null,
        });
        setSelectedKey((previous) => {
          if (previous && nextEntries.some((entry) => getReflogEntryKey(entry) === previous)) return previous;
          return append ? previous : nextEntries[0] ? getReflogEntryKey(nextEntries[0]) : null;
        });
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        setState((previous) => ({
          ...previous,
          loading: false,
          loadingMore: false,
          error: error?.message ?? "Failed to load reflog.",
        }));
      }
    },
    [ref, repoPath],
  );

  useEffect(() => {
    setSelectedKey(null);
    setReachability(new Map());
    setReachabilityState({ loading: false, error: null });
    void loadPage();
  }, [loadPage, revision]);

  const filteredEntries = useMemo(
    () => filterReflogEntries(state.entries, { action, query }),
    [action, query, state.entries],
  );
  const groups = useMemo(() => groupReflogEntries(filteredEntries, { now }), [filteredEntries, now]);
  const selectedEntry = useMemo(
    () => filteredEntries.find((entry) => getReflogEntryKey(entry) === selectedKey) ?? null,
    [filteredEntries, selectedKey],
  );
  const previousEntry = useMemo(() => findPreviousReflogEntry(state.entries, selectedEntry), [selectedEntry, state.entries]);
  const selectedReachability = selectedEntry
    ? selectedEntry.reachable ?? reachability.get(selectedEntry.hash) ?? null
    : null;

  useEffect(() => {
    if (!selectedKey || !filteredEntries.some((entry) => getReflogEntryKey(entry) === selectedKey)) {
      setSelectedKey(filteredEntries[0] ? getReflogEntryKey(filteredEntries[0]) : null);
    }
  }, [filteredEntries, selectedKey]);

  useEffect(() => {
    setReachabilityState({ loading: false, error: null });
  }, [selectedEntry?.hash]);

  const checkReachability = useCallback(async () => {
    if (!selectedEntry) return;
    if (reachability.has(selectedEntry.hash)) return;
    if (typeof api.commitReachability !== "function") {
      setReachabilityState({ loading: false, error: "Reachability is unavailable in this environment." });
      return;
    }
    setReachabilityState({ loading: true, error: null });
    try {
      const response = await api.commitReachability({ repositoryPath: repoPath, hash: selectedEntry.hash });
      if (response?.ok === false) {
        setReachabilityState({ loading: false, error: response.error?.message ?? "Failed to check reachability." });
        return;
      }
      const payload = getResponseData(response);
      setReachability((previous) => new Map(previous).set(selectedEntry.hash, payload));
      setReachabilityState({ loading: false, error: null });
    } catch (error) {
      setReachabilityState({ loading: false, error: error?.message ?? "Failed to check reachability." });
    }
  }, [reachability, repoPath, selectedEntry]);

  const selectRef = (event) => {
    setRef(event.target.value);
    setSelectedKey(null);
  };

  const selectEntry = (entry) => setSelectedKey(getReflogEntryKey(entry));
  const retry = () => void loadPage();
  const loadMore = () => {
    if (!state.hasMore || state.loadingMore) return;
    void loadPage({ append: true, skip: state.nextSkip ?? state.entries.length });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <HistoryIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">HEAD Reflog</h1>
              <Badge variant="muted">{state.entries.length.toLocaleString()} loaded</Badge>
              {currentHead && <code className="font-mono text-[11px] text-muted-foreground">{currentHead.slice(0, 8)}</code>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Review local reference movement without changing repository state.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={retry} disabled={state.loading || state.loadingMore}>
          <RefreshCw className={state.loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <label className="flex h-8 items-center gap-1.5 rounded-md border border-input bg-background/70 px-2 text-xs text-muted-foreground">
          <GitBranch className="size-3.5" />
          <select value={ref} onChange={selectRef} aria-label="Select reflog reference" className="bg-transparent text-foreground outline-none">
            <option value="HEAD">HEAD</option>
            {branchOptions.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
          </select>
        </label>
        <label className="flex h-8 items-center gap-1.5 rounded-md border border-input bg-background/70 px-2 text-xs text-muted-foreground">
          <CircleDot className="size-3.5" />
          <select value={action} onChange={(event) => setAction(event.target.value)} aria-label="Filter reflog actions" className="bg-transparent text-foreground outline-none">
            {REFLOG_ACTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search hash, message, actor…" aria-label="Search reflog" className="h-8 pl-8 text-xs" />
        </div>
        {(action !== "all" || query) && <span className="text-[11px] text-muted-foreground">{filteredEntries.length.toLocaleString()} matching</span>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4">
          {state.loading && state.entries.length === 0 ? (
            <LoadingTimeline />
          ) : state.error && state.entries.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-md text-center">
                <CircleAlert className="mx-auto size-8 text-red-400" />
                <p className="mt-3 text-sm font-medium">Reflog could not be loaded</p>
                <p className="mt-1 text-xs text-muted-foreground">{state.error}</p>
                <Button className="mt-4" size="sm" onClick={retry}>Try again</Button>
              </div>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              No reflog entries match the current filters.
            </div>
          ) : (
            <div className="mx-auto w-full max-w-4xl space-y-6">
              {groups.map((group) => (
                <section key={group.key} aria-labelledby={`reflog-group-${group.key}`}>
                  <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold text-muted-foreground">
                    <CalendarClock className="size-3.5" />
                    <h2 id={`reflog-group-${group.key}`}>{group.label}</h2>
                    <span className="text-[10px] font-normal">{group.entries.length}</span>
                  </div>
                  <div className="relative space-y-2 pl-1">
                    <div className="absolute bottom-3 left-[13px] top-3 w-px bg-border" aria-hidden="true" />
                    {group.entries.map((entry) => (
                      <ReflogTimelineEntry
                        key={getReflogEntryKey(entry)}
                        entry={entry}
                        selected={getReflogEntryKey(entry) === selectedKey}
                        bookmarked={bookmarks.has(entry.hash) || Boolean(entry.bookmarked)}
                        onSelect={selectEntry}
                      />
                    ))}
                  </div>
                </section>
              ))}
              {state.error && <p className="text-xs text-red-400">{state.error}</p>}
              {state.hasMore && (
                <Button variant="outline" className="w-full" onClick={loadMore} disabled={state.loadingMore}>
                  {state.loadingMore ? <LoaderCircle className="animate-spin" /> : null}
                  {state.loadingMore ? "Loading…" : "Load more"}
                </Button>
              )}
            </div>
          )}
        </div>

        <ReflogDetail
          entry={selectedEntry}
          previousEntry={previousEntry}
          reachability={selectedReachability}
          reachabilityState={reachabilityState}
          onCheckReachability={checkReachability}
          onViewCommit={onViewCommit}
          onCompare={onCompare}
        />
      </div>
    </div>
  );
}

function ReflogTimelineEntry({ entry, selected, bookmarked, onSelect }) {
  return (
    <div className="relative flex gap-3">
      <div className="relative z-10 mt-3 flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-background">
        <span className={cn("size-2 rounded-full", selected ? "bg-primary" : "bg-muted-foreground/60")} />
      </div>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(entry)}
        className={cn(
          "min-w-0 flex-1 rounded-lg border border-border/70 bg-card/55 p-3 text-left transition-colors hover:border-primary/30 hover:bg-accent/40",
          selected && "border-primary/40 bg-primary/8 shadow-sm",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={ACTION_VARIANTS[entry.action] ?? "muted"}>{actionLabel(entry.action)}</Badge>
          {bookmarked && <span title="Bookmarked commit" aria-label="Bookmarked commit"><ShieldCheck className="size-3.5 text-amber-400" /></span>}
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{entry.detail || entry.rawMessage || "No additional details"}</span>
          <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", selected && "rotate-90 text-primary")} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><GitCommitHorizontal className="size-3" /><code className="font-mono">{entry.shortHash ?? entry.hash?.slice(0, 8)}</code></span>
          <span className="inline-flex items-center gap-1"><UserRound className="size-3" />{entry.actor?.name || "Unknown actor"}</span>
          <span className="inline-flex items-center gap-1" title={formatDate(entry.date)}><Clock3 className="size-3" />{formatRelativeDate(entry.date)}</span>
          <span className="font-mono text-muted-foreground/70">{entry.selector}</span>
        </div>
      </button>
    </div>
  );
}

function ReflogDetail({ entry, previousEntry, reachability, reachabilityState, onCheckReachability, onViewCommit, onCompare }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => setCopied(false), [entry?.hash]);

  const copyHash = async () => {
    if (!entry || !(await copyText(entry.hash))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <aside aria-label="Reflog entry details" className="min-h-0 w-full shrink-0 overflow-auto border-t border-border bg-card/35 p-4 lg:w-[360px] lg:border-l lg:border-t-0">
      {!entry ? (
        <div className="flex h-full min-h-40 items-center justify-center p-5 text-center text-sm text-muted-foreground">
          Select an entry to inspect its action and safe navigation options.
        </div>
      ) : (
        <Card className="border-border/70 bg-background/50 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Badge variant={ACTION_VARIANTS[entry.action] ?? "muted"}>{actionLabel(entry.action)}</Badge>
                  <span className="truncate">Reflog entry</span>
                </CardTitle>
                <CardDescription className="mt-1">{entry.selector}</CardDescription>
              </div>
              <HistoryIcon className="size-4 shrink-0 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <dl className="space-y-2 rounded-lg border border-border/70 p-3">
              <DetailRow label="Action">{entry.rawMessage || entry.detail || "Unknown action"}</DetailRow>
              <DetailRow label="Time" value={formatDate(entry.date)} />
              <DetailRow label="Actor" value={entry.actor?.name || "Unknown actor"} />
              <DetailRow label="Commit">
                <span className="flex items-center gap-2">
                  <code className="min-w-0 truncate font-mono">{entry.hash}</code>
                  <button type="button" onClick={copyHash} title="Copy hash" aria-label="Copy hash" className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                    {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                  </button>
                </span>
              </DetailRow>
            </dl>

            <div>
              <div className="mb-1.5 font-medium text-muted-foreground">Message</div>
              <p className="break-words rounded-lg bg-muted/40 p-3 leading-5">{entry.rawMessage || entry.detail || "No message recorded."}</p>
            </div>

            <div>
              <div className="mb-1.5 flex items-center gap-1.5 font-medium text-muted-foreground"><ShieldCheck className="size-3.5" />Reachability</div>
              {reachability ? (
                <ReachabilitySummary reachability={reachability} />
              ) : reachabilityState.loading ? (
                <div className="flex items-center gap-2 rounded-lg border border-border/70 p-3 text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" /> Checking known refs…</div>
              ) : (
                <div className="rounded-lg border border-border/70 p-3 text-muted-foreground">
                  <p>Reachability is checked only when requested.</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={onCheckReachability}>Check reachability</Button>
                </div>
              )}
              {reachabilityState.error && <p className="mt-1.5 text-red-400">{reachabilityState.error}</p>}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onViewCommit?.(entry.hash)} disabled={!onViewCommit}>
                <GitCommitHorizontal /> View Commit
              </Button>
              <Button size="sm" variant="outline" onClick={() => onCompare?.(previousEntry.hash, entry.hash)} disabled={!previousEntry || !onCompare}>
                <GitCompareArrows /> Compare with Previous
              </Button>
            </div>
            {!previousEntry && <p className="text-[11px] text-muted-foreground">No older loaded entry is available for comparison.</p>}
          </CardContent>
        </Card>
      )}
    </aside>
  );
}

function DetailRow({ label, value, children }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children ?? value}</dd>
    </div>
  );
}

function ReachabilitySummary({ reachability }) {
  const branches = Array.isArray(reachability.branches) ? reachability.branches : [];
  const tags = Array.isArray(reachability.tags) ? reachability.tags : [];
  const refs = [
    ...branches.map((branch) => <span key={`branch-${branch}`} className="inline-flex items-center gap-1"><GitBranch className="size-3" />{branch}</span>),
    ...tags.map((tag) => <span key={`tag-${tag}`} className="inline-flex items-center gap-1"><Tag className="size-3" />{tag}</span>),
  ];
  if (refs.length === 0) {
    return <p className="rounded-lg border border-border/70 p-3 text-muted-foreground">No known branch or tag contains this commit.</p>;
  }
  return (
    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-emerald-400">
      <p className="mb-2">Reachable from</p>
      <div className="flex flex-wrap gap-1.5">{refs}</div>
    </div>
  );
}

function LoadingTimeline() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-3">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="flex gap-3">
          <Skeleton className="mt-3 size-5 shrink-0 rounded-full" />
          <div className="flex-1 rounded-lg border border-border/70 p-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-3 h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
