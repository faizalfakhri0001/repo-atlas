import { useCallback, useEffect, useRef } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  LoaderCircle,
  Search,
  Tag,
  UserRound,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useGlobalSearch } from "./use-global-search.js";

const ICONS = {
  file: FileCode2,
  commit: GitCommitHorizontal,
  branch: GitBranch,
  tag: Tag,
  author: UserRound,
};

const LABELS = {
  file: "File",
  commit: "Commit",
  branch: "Branch",
  tag: "Tag",
  author: "Author",
};

function resultTitle(result) {
  if (result.type === "file") return result.path;
  if (result.type === "commit") return result.subject || result.shortHash || result.hash;
  return result.name;
}

function resultDetails(result) {
  if (result.type === "file") return `${result.tracked ? "Tracked" : "Untracked"}${result.extension ? ` · ${result.extension}` : ""}`;
  if (result.type === "commit") return `${result.shortHash} · ${result.author || "Unknown author"}`;
  if (result.type === "author") return `${result.email} · ${Number(result.commits ?? 0).toLocaleString()} commits`;
  if (result.type === "branch") return `${result.current ? "Current branch" : result.remote ? "Remote branch" : "Local branch"} · ${result.hash?.slice(0, 8) ?? ""}`;
  return `${result.hash?.slice(0, 8) ?? ""}${result.date ? ` · ${result.date.slice(0, 10)}` : ""}`;
}

function SearchResult({ result, index, selected, onSelect, onOpen }) {
  const Icon = ICONS[result.type] ?? Search;
  return (
    <button
      id={`repository-search-result-${index}`}
      type="button"
      role="option"
      aria-selected={selected}
      onMouseMove={() => onSelect(index)}
      onClick={() => onOpen(result)}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{resultTitle(result)}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{resultDetails(result)}</span>
      </span>
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/70">{LABELS[result.type]}</span>
    </button>
  );
}

export function GlobalSearch({
  open,
  onOpenChange,
  repositoryPath,
  revision,
  onOpenResult,
}) {
  const search = useGlobalSearch({ repositoryPath, revision, open });
  const itemRefs = useRef(new Map());

  useEffect(() => {
    const element = itemRefs.current.get(search.selectedIndex);
    element?.scrollIntoView?.({ block: "nearest" });
  }, [search.results, search.selectedIndex]);

  const handleResultOpen = useCallback(
    (result) => {
      onOpenResult?.(result);
      onOpenChange?.(false);
    },
    [onOpenChange, onOpenResult],
  );

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      search.moveSelection(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      search.moveSelection(-1);
      return;
    }
    if (event.key === "Home" && search.results.length > 0) {
      event.preventDefault();
      search.setSelectedIndex(0);
      return;
    }
    if (event.key === "End" && search.results.length > 0) {
      event.preventDefault();
      search.setSelectedIndex(search.results.length - 1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const result = search.results[search.selectedIndex];
      if (result) handleResultOpen(result);
    }
  };

  const status = search.loading
    ? "Searching repository…"
    : search.results.length > 0
      ? `${search.results.length.toLocaleString()} result${search.results.length === 1 ? "" : "s"}${search.durationMs != null ? ` · ${search.durationMs} ms` : ""}`
      : search.query.trim().length < 2
        ? "Type at least 2 characters, or paste a commit hash."
        : "No matches found.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-0" hideClose>
        <DialogTitle className="sr-only">Search repository</DialogTitle>
        <DialogDescription className="sr-only">
          Search files, commits, branches, tags, authors, and commit hashes in the current repository.
        </DialogDescription>
        <div role="search" className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={search.query}
            onChange={(event) => search.updateQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files, commits, branches, tags, authors…"
            aria-label="Search repository"
            aria-controls="repository-search-results"
            aria-activedescendant={search.results.length ? `repository-search-result-${search.selectedIndex}` : undefined}
            className="h-14 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          />
          <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Esc</kbd>
        </div>

        <div role="tablist" aria-label="Search categories" className="flex gap-1 overflow-auto border-b border-border px-3 py-2">
          {search.categories.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={search.category === item.id}
              onClick={() => search.updateCategory(item.id)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs transition-colors",
                search.category === item.id ? "bg-primary/12 font-medium text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {search.error && (
          <div role="alert" className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-400">
            <AlertCircle className="size-3.5" /> {search.error}
          </div>
        )}
        {search.errors.length > 0 && (
          <div role="alert" className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
            {search.errors[0].message}
          </div>
        )}

        <div aria-live="polite" className="flex items-center gap-2 border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
          {search.loading && <LoaderCircle className="size-3.5 animate-spin" />}
          <span>{status}</span>
        </div>

        <div id="repository-search-results" role="listbox" aria-label="Repository search results" className="max-h-[min(60vh,32rem)] overflow-auto py-2">
          {search.results.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              {search.loading ? "Reading repository metadata…" : search.query.trim() ? "No repository metadata matches this query." : "Search stays local and does not inspect source-code contents."}
            </div>
          ) : (
            search.results.map((result, index) => (
              <div
                key={`${result.type}:${result.path || result.hash || result.name}:${index}`}
                ref={(element) => {
                  if (element) itemRefs.current.set(index, element);
                  else itemRefs.current.delete(index);
                }}
              >
                <SearchResult result={result} index={index} selected={search.selectedIndex === index} onSelect={search.setSelectedIndex} onOpen={handleResultOpen} />
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><ArrowDown className="size-3" /><ArrowUp className="size-3" /> Navigate</span>
          <span>Enter Open</span>
          <span className="ml-auto">Offline · no source content search</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
