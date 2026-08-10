import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  FolderOpen,
  LoaderCircle,
  Search,
} from "lucide-react";
import { api } from "@/lib/api";
import { buildFileTree, collectDirectoryPaths, filterFileEntries, flattenVisibleTree } from "@/lib/file-tree";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ROW_HEIGHT = 28;
const OVERSCAN = 8;

export function FileExplorer({ repoPath, onSelectFile }) {
  const [state, setState] = useState({ loading: true, error: null, files: [] });
  const [expandedPaths, setExpandedPaths] = useState(() => new Set());
  const [selectedPath, setSelectedPath] = useState(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, files: [] });
    setSelectedPath(null);
    setQuery("");
    api
      .listRepositoryFiles({ repositoryPath: repoPath })
      .then((response) => {
        if (cancelled) return;
        if (!response?.ok) {
          setState({ loading: false, error: response?.error?.message ?? "Failed to list repository files.", files: [] });
          return;
        }
        setState({ loading: false, error: null, files: response.data ?? [] });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error: error?.message ?? "Failed to list repository files.", files: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath]);

  const filteredFiles = useMemo(() => filterFileEntries(state.files, query), [state.files, query]);
  const tree = useMemo(() => buildFileTree(filteredFiles), [filteredFiles]);
  const visibleRows = useMemo(() => flattenVisibleTree(tree, expandedPaths), [tree, expandedPaths]);
  const firstRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const lastRow = Math.min(visibleRows.length, Math.ceil((scrollTop + 560) / ROW_HEIGHT) + OVERSCAN);
  const renderedRows = visibleRows.slice(firstRow, lastRow);

  useEffect(() => {
    if (filteredFiles.length === 0) return;
    setExpandedPaths((current) => {
      if (query.trim()) return new Set(collectDirectoryPaths(tree));
      if (current.size > 0) return current;
      return new Set(collectDirectoryPaths(tree).filter((path) => path.split("/").length === 1));
    });
  }, [filteredFiles.length, query, tree]);

  const toggleDirectory = (filePath) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const selectFile = (node) => {
    setSelectedPath(node.path);
    onSelectFile?.(node);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-tight">Files</h2>
          <p className="text-[11px] text-muted-foreground">
            {state.loading
              ? "Reading repository index…"
              : query.trim()
                ? `${filteredFiles.length.toLocaleString()} of ${state.files.length.toLocaleString()} files`
                : `${state.files.length.toLocaleString()} files`}
          </p>
        </div>
        <div className="relative ml-auto w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter files…"
            className="h-8 pl-8 text-xs"
            aria-label="Filter files"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex min-w-[240px] w-[300px] shrink-0 flex-col border-r border-border">
          {state.loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Loading files…
            </div>
          ) : state.error ? (
            <div className="m-4 rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">{state.error}</div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">No files found.</div>
          ) : (
            <div
              role="tree"
              aria-label="Repository files"
              className="min-h-0 flex-1 overflow-auto py-1"
              onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            >
              <div style={{ height: visibleRows.length * ROW_HEIGHT }} className="relative">
                <div className="absolute inset-x-0 top-0" style={{ transform: `translateY(${firstRow * ROW_HEIGHT}px)` }}>
                  {renderedRows.map(({ node, depth }) => {
                    const isDirectory = node.type === "directory";
                    const isExpanded = expandedPaths.has(node.path);
                    const Icon = isDirectory ? (isExpanded ? FolderOpen : Folder) : FileCode2;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        role="treeitem"
                        aria-expanded={isDirectory ? isExpanded : undefined}
                        aria-selected={node.path === selectedPath}
                        onClick={() => (isDirectory ? toggleDirectory(node.path) : selectFile(node))}
                        className={cn(
                          "flex h-7 w-full items-center gap-1.5 px-2 text-left text-xs hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                          node.path === selectedPath && "bg-primary/10 text-primary",
                        )}
                        style={{ paddingLeft: `${8 + depth * 16}px` }}
                        title={node.path}
                      >
                        {isDirectory ? (
                          isExpanded ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />
                        ) : (
                          <span className="size-3 shrink-0" />
                        )}
                        <Icon className={cn("size-3.5 shrink-0", isDirectory ? "text-sky-400" : "text-muted-foreground")} />
                        <span className="min-w-0 flex-1 truncate">{node.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </aside>

        <main className="min-w-0 flex-1">
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
            Select a file to preview its contents.
          </div>
        </main>
      </div>
    </div>
  );
}
