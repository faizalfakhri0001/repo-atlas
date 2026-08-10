import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Cherry,
  ChevronDown,
  CircleCheck,
  CircleHelp,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  GitMerge,
  LoaderCircle,
  Tag,
  TriangleAlert,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatCount, formatRelativeDate } from "@/lib/utils";
import { AuthorAvatar } from "@/components/author-avatar";
import { CommitDetails } from "@/components/commit-details";
import { CopyButton, DiffStat, DiffView, FilePathLabel, FileStatusBadge } from "@/components/diff-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function RefPicker({ label, value, branches, tags, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const local = branches.filter((branch) => !branch.remote);
  const remote = branches.filter((branch) => branch.remote);
  const normalized = query.trim().toLowerCase();
  const show = (name) => !normalized || name.toLowerCase().includes(normalized);

  const pick = (name) => {
    onChange(name);
    setOpen(false);
    setQuery("");
  };

  const section = (title, icon, items) => {
    const visible = items.filter(show);
    if (visible.length === 0) return null;
    const Icon = icon;
    return (
      <div key={title}>
        <div className="px-2 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">{title}</div>
        {visible.slice(0, 50).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => pick(name)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
              name === value && "font-medium text-primary",
            )}
          >
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{name}</span>
          </button>
        ))}
      </div>
    );
  };

  const isHash = /^[0-9a-f]{7,40}$/i.test(value ?? "");
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 max-w-56 justify-start font-normal">
            <GitBranch className="text-muted-foreground" />
            <span className={cn("truncate", isHash && "font-mono text-xs")}>{isHash ? value.slice(0, 10) : value || "Select ref"}</span>
            <ChevronDown className="ml-auto !size-3 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72">
          <div className="border-b border-border p-2">
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search refs"
              className="h-8 text-xs"
            />
          </div>
          <div className="max-h-80 overflow-auto p-1.5">
            {section("Local branches", GitBranch, local.map((branch) => branch.name))}
            {section("Remote branches", GitBranch, remote.map((branch) => branch.name))}
            {section("Tags", Tag, tags.map((tag) => tag.name))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function MergeabilityBadge({ result }) {
  if (result.identical) return <Badge variant="muted">Same commit</Badge>;
  if (result.conflicts.status === "clean")
    return (
      <Badge variant="success">
        <CircleCheck className="size-3" /> Merges cleanly
      </Badge>
    );
  if (result.conflicts.status === "conflicts")
    return (
      <Badge variant="destructive">
        <TriangleAlert className="size-3" /> {result.conflicts.files.length} conflicting {result.conflicts.files.length === 1 ? "file" : "files"}
      </Badge>
    );
  if (result.conflicts.status === "unsupported")
    return (
      <Badge variant="muted">
        <CircleHelp className="size-3" /> Conflict check needs Git ≥ 2.38
      </Badge>
    );
  return (
    <Badge variant="muted">
      <CircleHelp className="size-3" /> Mergeability unknown
    </Badge>
  );
}

export function CompareView({ data, initial, onCherryPick }) {
  const repoPath = data.repository.rootPath;
  const remoteNames = useMemo(() => data.remotes.map((remote) => remote.name), [data.remotes]);
  const otherLocal = data.branches.find((branch) => !branch.remote && !branch.current)?.name;

  const [base, setBase] = useState(initial?.base ?? data.repository.defaultBranch ?? data.repository.currentBranch);
  const [head, setHead] = useState(
    initial?.head ??
      (data.repository.currentBranch !== (data.repository.defaultBranch ?? data.repository.currentBranch)
        ? data.repository.currentBranch
        : otherLocal ?? data.repository.currentBranch),
  );
  const [state, setState] = useState({ loading: true, error: null, result: null });
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedCommits, setSelectedCommits] = useState(() => new Set());
  const [detailHash, setDetailHash] = useState(null);

  useEffect(() => {
    if (initial?.base) setBase(initial.base);
    if (initial?.head) setHead(initial.head);
  }, [initial?.nonce, initial?.base, initial?.head]);

  const load = useCallback(async () => {
    if (!base || !head) return;
    setState((current) => ({ ...current, loading: true, error: null }));
    setSelectedFile(null);
    setSelectedCommits(new Set());
    setDetailHash(null);
    try {
      const response = await api.compareRefs({ repositoryPath: repoPath, base, head });
      if (!response?.ok) {
        setState({ loading: false, error: response?.error?.message ?? "Comparison failed.", result: null });
        return;
      }
      setState({ loading: false, error: null, result: response.data });
      setSelectedFile(response.data.files[0] ?? null);
    } catch (error) {
      setState({ loading: false, error: error?.message ?? "Comparison failed.", result: null });
    }
  }, [repoPath, base, head]);

  useEffect(() => {
    load();
  }, [load, data.scannedAt]);

  const result = state.result;
  const diffFrom = result?.mergeBase ?? result?.base.hash;

  const toggleCommit = (hash) => {
    setSelectedCommits((current) => {
      const next = new Set(current);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="mr-2">
              <h2 className="text-sm font-semibold leading-tight">Compare · Pull request simulation</h2>
              <p className="text-[11px] text-muted-foreground">Preview what merging would change, before any branch is touched.</p>
            </div>
            <RefPicker label="Base" value={base} branches={data.branches} tags={data.tags} onChange={setBase} />
            <button
              type="button"
              title="Swap base and compare"
              onClick={() => {
                setBase(head);
                setHead(base);
              }}
              className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowLeftRight className="size-3.5" />
            </button>
            <RefPicker label="Compare" value={head} branches={data.branches} tags={data.tags} onChange={setHead} />
            {state.loading && <LoaderCircle className="size-4 animate-spin text-muted-foreground" />}
          </div>

          {result && !state.loading && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
              <MergeabilityBadge result={result} />
              {result.fastForwardPossible && <Badge variant="info">fast-forward possible</Badge>}
              {result.headIsAncestorOfBase && <Badge variant="muted">already merged into base</Badge>}
              {result.unrelatedHistories && <Badge variant="warning">unrelated histories</Badge>}
              <span className="ml-1 inline-flex items-center gap-1 text-muted-foreground">
                <span className="font-medium text-emerald-500">{result.ahead} ahead</span>
                ·
                <span className="font-medium text-amber-500">{result.behind} behind</span>
                ·
                <span>{result.files.length} files</span>
                <DiffStat additions={result.additions} deletions={result.deletions} />
              </span>
              {result.mergeBase && (
                <span className="inline-flex items-center gap-1 text-muted-foreground/80">
                  · merge-base <code className="font-mono">{result.mergeBase.slice(0, 8)}</code>
                  <CopyButton value={result.mergeBase} title="Copy merge-base hash" size="size-5" />
                </span>
              )}
            </div>
          )}
        </div>

        {state.error ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="max-w-md rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-center text-sm">
              <TriangleAlert className="mx-auto mb-2 size-6 text-red-400" />
              <p className="text-red-400">{state.error}</p>
            </div>
          </div>
        ) : state.loading && !result ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Comparing refs…
          </div>
        ) : !result ? null : result.identical ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
            <GitCompareArrows className="size-10" />
            <p className="text-sm">Base and compare point at the same commit.</p>
          </div>
        ) : (
          <Tabs defaultValue="commits" className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-border px-4 py-2">
              <TabsList>
                <TabsTrigger value="commits">
                  <GitCommitHorizontal className="size-3.5" /> Commits <span className="tabular-nums opacity-70">{result.commits.length}</span>
                </TabsTrigger>
                <TabsTrigger value="files">
                  <FileDiff className="size-3.5" /> Files changed <span className="tabular-nums opacity-70">{result.files.length}</span>
                </TabsTrigger>
                {result.conflicts.status === "conflicts" && (
                  <TabsTrigger value="conflicts" className="data-[state=active]:text-rose-500">
                    <TriangleAlert className="size-3.5" /> Conflicts <span className="tabular-nums opacity-70">{result.conflicts.files.length}</span>
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <TabsContent value="commits" className="min-h-0 flex-1 overflow-auto">
              {result.commits.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <GitMerge className="size-8" />
                  <p className="text-sm">No commits in {head} that are missing from {base}.</p>
                </div>
              ) : (
                <div className="relative">
                  {result.commits.map((commit) => (
                    <div
                      key={commit.hash}
                      onClick={() => setDetailHash(commit.hash)}
                      className={cn(
                        "flex h-11 cursor-pointer items-center gap-2.5 border-b border-border/40 px-4 transition-colors hover:bg-accent/40",
                        detailHash === commit.hash && "bg-primary/10",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCommits.has(commit.hash)}
                        onChange={() => toggleCommit(commit.hash)}
                        onClick={(event) => event.stopPropagation()}
                        className="size-3.5 shrink-0 accent-[var(--primary)]"
                      />
                      <span className="size-2 shrink-0 rounded-full bg-emerald-500/80" />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{commit.subject}</span>
                      <AuthorAvatar name={commit.author} email={commit.email} size={20} />
                      <code className="w-[70px] shrink-0 text-right font-mono text-[11px] text-muted-foreground/80">
                        {commit.shortHash.slice(0, 7)}
                      </code>
                      <span className="w-[88px] shrink-0 text-right text-[11px] text-muted-foreground">
                        {formatRelativeDate(commit.date)}
                      </span>
                    </div>
                  ))}
                  {result.ahead > result.commits.length && (
                    <div className="px-4 py-3 text-center text-xs text-muted-foreground">
                      Showing first {formatCount(result.commits.length)} of {formatCount(result.ahead)} commits.
                    </div>
                  )}
                </div>
              )}

              {selectedCommits.size > 0 && (
                <div className="pointer-events-none sticky bottom-4 flex justify-center">
                  <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-popover/95 py-1.5 pl-4 pr-2 shadow-xl backdrop-blur">
                    <span className="text-xs font-medium tabular-nums">{selectedCommits.size} selected</span>
                    <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={() => onCherryPick([...selectedCommits])}>
                      <Cherry className="!text-rose-500" /> Cherry-pick onto {data.repository.currentBranch}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={() => setSelectedCommits(new Set())}>
                      Clear
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="files" className="min-h-0 flex-1">
              {result.files.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <FileDiff className="size-8" />
                  <p className="text-sm">No file changes between the merge-base and {head}.</p>
                </div>
              ) : (
                <div className="flex h-full min-h-0">
                  <div className="w-80 shrink-0 overflow-auto border-r border-border p-1.5">
                    {result.files.map((file) => (
                      <button
                        key={`${file.status}-${file.path}`}
                        type="button"
                        onClick={() => setSelectedFile(file)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/50",
                          selectedFile?.path === file.path && "bg-primary/10",
                        )}
                      >
                        <FileStatusBadge status={file.status} />
                        <FilePathLabel path={file.path} oldPath={file.oldPath} className="min-w-0 flex-1" />
                        <DiffStat additions={file.additions} deletions={file.deletions} binary={file.binary} />
                      </button>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1 overflow-auto">
                    {selectedFile ? (
                      <>
                        <div className="sticky top-0 z-[2] flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 text-xs backdrop-blur">
                          <FileStatusBadge status={selectedFile.status} />
                          <FilePathLabel path={selectedFile.path} oldPath={selectedFile.oldPath} className="min-w-0 flex-1" />
                          <DiffStat additions={selectedFile.additions} deletions={selectedFile.deletions} binary={selectedFile.binary} />
                          <CopyButton value={selectedFile.path} title="Copy path" />
                        </div>
                        <DiffView
                          repoPath={repoPath}
                          request={{
                            from: diffFrom,
                            to: result.head.hash,
                            path: selectedFile.path,
                            oldPath: selectedFile.oldPath || undefined,
                          }}
                        />
                      </>
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        Select a file to view its diff.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            {result.conflicts.status === "conflicts" && (
              <TabsContent value="conflicts" className="min-h-0 flex-1 overflow-auto p-4">
                <div className="mx-auto max-w-2xl">
                  <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-rose-400">
                      <TriangleAlert className="size-4" />
                      Merging {head} into {base} would conflict in {result.conflicts.files.length}{" "}
                      {result.conflicts.files.length === 1 ? "file" : "files"}
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                      Predicted with <code className="font-mono">git merge-tree</code> — nothing was written to the working tree. Resolve these
                      files during the real merge, or rebase {head} onto {base} first.
                    </p>
                  </div>
                  <div className="mt-3 overflow-hidden rounded-xl border border-border">
                    {result.conflicts.files.map((file) => (
                      <div key={file} className="flex items-center gap-2.5 border-b border-border/60 px-3.5 py-2.5 text-xs last:border-0">
                        <FileStatusBadge status="U" />
                        <FilePathLabel path={file} className="min-w-0 flex-1" />
                        <CopyButton value={file} title="Copy path" />
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
            )}
          </Tabs>
        )}
      </div>

      {detailHash && result && (
        <div className="w-[420px] shrink-0 border-l border-border xl:w-[460px]">
          <CommitDetails
            repoPath={repoPath}
            hash={detailHash}
            remotes={remoteNames}
            headHash={data.repository.head}
            onClose={() => setDetailHash(null)}
            onNavigate={setDetailHash}
            onCherryPick={onCherryPick}
          />
        </div>
      )}
    </div>
  );
}
