import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FileCode2,
  Folder,
  FolderOpen,
  History as HistoryIcon,
  LoaderCircle,
  Search,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  buildFileTree,
  collectDirectoryPaths,
  filterFileEntries,
  flattenVisibleTree,
  mergeWorkingTreeStatuses,
} from "@/lib/file-tree";
import { cn, copyText } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileStatusBadge } from "@/components/diff-view";
import { FilePreview } from "@/components/file-preview";
import { FileHistory } from "@/components/file-history";
import { BlameView } from "@/components/blame-view";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

const ROW_HEIGHT = 28;
const OVERSCAN = 8;

export function FileExplorer({
  repoPath,
  status,
  onSelectFile,
  historyState,
  onHistoryStateChange,
  focusFilterRequest = null,
  initialConfig = null,
  fileSelectionRequest = null,
  onOpenCommit,
  onOpenFileAtRevision,
  onOpenPreviousRevision,
  bookmarkedHashes,
}) {
  const [state, setState] = useState({ loading: true, error: null, files: [] });
  const [expandedPaths, setExpandedPaths] = useState(() => new Set());
  const [selectedPath, setSelectedPath] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [fileMode, setFileMode] = useState("preview");
  const [selectedRevision, setSelectedRevision] = useState(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [query, setQuery] = useState(() => initialConfig?.filter ?? initialConfig?.pathPrefix ?? "");
  const filterRef = useRef(null);
  const rowRefs = useRef(new Map());
  const handledSelectionRef = useRef(null);

  useEffect(() => {
    const handleQuickFileShortcut = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "p") return;
      event.preventDefault();
      filterRef.current?.focus();
      filterRef.current?.select();
    };
    window.addEventListener("keydown", handleQuickFileShortcut);
    return () => window.removeEventListener("keydown", handleQuickFileShortcut);
  }, []);

  useEffect(() => {
    if (focusFilterRequest == null) return undefined;
    setQuery("");
    const timer = window.setTimeout(() => {
      filterRef.current?.focus();
      filterRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusFilterRequest]);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, files: [] });
    setSelectedPath(null);
    setSelectedNode(null);
    setFileMode("preview");
    setSelectedRevision(null);
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

  useEffect(() => {
    if (!initialConfig) return;
    setQuery(initialConfig.filter ?? initialConfig.pathPrefix ?? "");
  }, [initialConfig]);

  const indexedFiles = useMemo(() => mergeWorkingTreeStatuses(state.files, status?.files), [state.files, status?.files]);
  const filteredFiles = useMemo(() => filterFileEntries(indexedFiles, query), [indexedFiles, query]);
  const tree = useMemo(() => buildFileTree(filteredFiles), [filteredFiles]);
  const visibleRows = useMemo(() => flattenVisibleTree(tree, expandedPaths), [tree, expandedPaths]);
  const firstRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const lastRow = Math.min(visibleRows.length, Math.ceil((scrollTop + 560) / ROW_HEIGHT) + OVERSCAN);
  const renderedRows = visibleRows.slice(firstRow, lastRow);

  useEffect(() => {
    if (!historyState?.selectedPath) return;
    const nextNode = indexedFiles.find((file) => file.path === historyState.selectedPath);
    if (!nextNode) return;
    setSelectedPath(nextNode.path);
    setSelectedNode(nextNode);
  }, [historyState?.selectedPath, indexedFiles]);

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
    setSelectedNode(node);
    onHistoryStateChange?.(null);
    setFileMode("preview");
    setSelectedRevision(null);
    onSelectFile?.(node);
  };

  const openHistory = (node) => {
    if (!node || node.type !== "file") return;
    setSelectedPath(node.path);
    setSelectedNode(node);
    setFileMode("history");
    setSelectedRevision(null);
    onHistoryStateChange?.({ selectedPath: node.path, selectedHash: null, entries: [], hasMore: false, loaded: false, scrollTop: 0 });
  };

  const openBlame = (node = selectedNode) => {
    if (!node || node.type !== "file") return;
    setSelectedPath(node.path);
    setSelectedNode(node);
    setFileMode("blame");
  };

  const focusNode = (node) => {
    if (!node) return;
    const element = rowRefs.current.get(node.id);
    if (!element) return;
    element.focus();
    if (typeof element.scrollIntoView === "function") element.scrollIntoView({ block: "nearest" });
  };

  useEffect(() => {
    if (!fileSelectionRequest?.path) return undefined;
    const requestedMode = fileSelectionRequest.mode ?? (fileSelectionRequest.openHistory ? "history" : "preview");
    const requestedRevision = fileSelectionRequest.revision ?? null;
    const requestKey = `${fileSelectionRequest.nonce ?? ""}:${fileSelectionRequest.path}:${requestedMode}:${requestedRevision ?? "HEAD"}`;
    if (handledSelectionRef.current === requestKey) return undefined;
    const nextNode = indexedFiles.find((file) => file.path === fileSelectionRequest.path);
    const requestedNode = nextNode ?? (requestedRevision ? { path: fileSelectionRequest.path, name: fileSelectionRequest.path.split("/").at(-1), type: "file", tracked: false } : null);
    if (!requestedNode) return undefined;
    handledSelectionRef.current = requestKey;
    setQuery("");
    setSelectedPath(requestedNode.path);
    setSelectedNode(requestedNode);
    setSelectedRevision(requestedRevision);
    setFileMode(requestedMode);
    onHistoryStateChange?.(
        fileSelectionRequest.openHistory
        ? { selectedPath: requestedNode.path, selectedHash: null, entries: [], hasMore: false, loaded: false, scrollTop: 0 }
        : null,
    );
    setExpandedPaths((current) => {
      const next = new Set(current);
      const parts = requestedNode.path.split("/");
      for (let index = 1; index < parts.length; index += 1) next.add(parts.slice(0, index).join("/"));
      return next;
    });
    const timer = nextNode ? window.setTimeout(() => focusNode(nextNode), 0) : null;
    onSelectFile?.(requestedNode);
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [fileSelectionRequest, indexedFiles, onHistoryStateChange, onSelectFile]);

  const handleTreeKeyDown = (event, node) => {
    const currentIndex = visibleRows.findIndex(({ node: candidate }) => candidate.id === node.id);
    const focusRelative = (offset) => focusNode(visibleRows[currentIndex + offset]?.node);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusRelative(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (node.type === "directory") toggleDirectory(node.path);
      else selectFile(node);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (node.type === "file") {
        selectFile(node);
      } else if (!expandedPaths.has(node.path)) {
        toggleDirectory(node.path);
      } else {
        focusNode(node.children[0]);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (node.type === "directory" && expandedPaths.has(node.path)) {
        toggleDirectory(node.path);
        return;
      }
      const parentPath = node.path.includes("/") ? node.path.slice(0, node.path.lastIndexOf("/")) : "";
      focusNode(visibleRows.find(({ node: candidate }) => candidate.path === parentPath)?.node);
    }
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
            ref={filterRef}
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
                      <ContextMenu key={node.id}>
                        <ContextMenuTrigger asChild>
                          <button
                            type="button"
                            role="treeitem"
                            ref={(element) => {
                              if (element) rowRefs.current.set(node.id, element);
                              else rowRefs.current.delete(node.id);
                            }}
                            aria-expanded={isDirectory ? isExpanded : undefined}
                            aria-selected={node.path === selectedPath}
                            onClick={() => (isDirectory ? toggleDirectory(node.path) : selectFile(node))}
                            className={cn(
                              "flex h-7 w-full items-center gap-1.5 px-2 text-left text-xs hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                              node.path === selectedPath && "bg-primary/10 text-primary",
                            )}
                            style={{ paddingLeft: `${8 + depth * 16}px` }}
                            aria-label={node.name}
                            title={node.path}
                            data-file-tree-row="true"
                            onKeyDown={(event) => handleTreeKeyDown(event, node)}
                          >
                            {isDirectory ? (
                              isExpanded ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />
                            ) : (
                              <span className="size-3 shrink-0" />
                            )}
                            <Icon className={cn("size-3.5 shrink-0", isDirectory ? "text-sky-400" : "text-muted-foreground")} />
                            <span className="min-w-0 flex-1 truncate">{node.name}</span>
                            {node.changeCount > 0 && (
                              <span className="shrink-0 text-[10px] tabular-nums text-amber-400" title={`${node.changeCount} working tree changes`}>
                                {isDirectory ? node.changeCount : <FileStatusBadge status={node.status} />}
                              </span>
                            )}
                          </button>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuLabel className="max-w-64 truncate font-mono">{node.path}</ContextMenuLabel>
                          <ContextMenuItem onSelect={() => (isDirectory ? toggleDirectory(node.path) : selectFile(node))}>
                            <FolderOpen /> Open
                          </ContextMenuItem>
                          {!isDirectory && (
                            <>
                              <ContextMenuItem onSelect={() => copyText(node.path)}>
                                <Copy /> Copy Path
                              </ContextMenuItem>
                              <ContextMenuItem onSelect={() => copyText(node.path)}>
                                <Copy /> Copy Relative Path
                              </ContextMenuItem>
                              <ContextMenuItem onSelect={() => openHistory(node)}>
                                <HistoryIcon /> View History
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem onSelect={() => api.revealRepositoryFile?.({ repositoryPath: repoPath, path: node.path })}>
                                <ExternalLink /> Reveal in File Manager
                              </ContextMenuItem>
                            </>
                          )}
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {selectedNode && (
            <div role="tablist" aria-label="File view mode" className="flex shrink-0 items-center gap-1 border-b border-border bg-background/80 px-3 py-1.5">
              <Button role="tab" aria-selected={fileMode === "preview"} variant={fileMode === "preview" ? "secondary" : "ghost"} size="sm" onClick={() => { setFileMode("preview"); onHistoryStateChange?.(null); }}>Preview</Button>
              <Button role="tab" aria-selected={fileMode === "history"} variant={fileMode === "history" ? "secondary" : "ghost"} size="sm" onClick={() => openHistory(selectedNode)}>History</Button>
              <Button role="tab" aria-selected={fileMode === "blame"} variant={fileMode === "blame" ? "secondary" : "ghost"} size="sm" onClick={() => openBlame(selectedNode)}>Blame</Button>
            </div>
          )}
          <div className="min-h-0 flex-1">
            {fileMode === "history" && historyState?.selectedPath === selectedPath && selectedNode ? (
              <FileHistory repoPath={repoPath} node={selectedNode} state={historyState} bookmarkedHashes={bookmarkedHashes} onStateChange={onHistoryStateChange} onClose={() => { setFileMode("preview"); onHistoryStateChange?.(null); }} />
            ) : fileMode === "blame" ? (
              <BlameView
                repoPath={repoPath}
                node={selectedNode}
                revision={selectedRevision ?? (historyState?.selectedPath === selectedPath ? historyState.selectedHash : null)}
                dirty={Boolean(selectedNode?.status)}
                onOpenCommit={onOpenCommit}
                onOpenFileAtRevision={onOpenFileAtRevision}
                onOpenPreviousRevision={onOpenPreviousRevision}
              />
            ) : (
              <FilePreview
                repoPath={repoPath}
                node={selectedNode}
                revision={selectedRevision}
                onOpenHistory={() => openHistory(selectedNode)}
                onOpenBlame={() => openBlame(selectedNode)}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
