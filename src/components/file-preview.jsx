import { useEffect, useMemo, useState } from "react";
import { FileWarning, History as HistoryIcon, LoaderCircle, ScanLine } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton, FilePathLabel, FileStatusBadge } from "@/components/diff-view";

function formatBytes(value) {
  if (value == null) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function lineNumberWidth(lineCount) {
  return `${Math.max(2, String(lineCount).length)}ch`;
}

export function FilePreview({ repoPath, node, onOpenHistory }) {
  const [state, setState] = useState({ loading: false, error: null, data: null });
  const requestKey = useMemo(() => `${repoPath ?? ""}\u0000${node?.path ?? ""}`, [repoPath, node?.path]);

  useEffect(() => {
    if (!node) {
      setState({ loading: false, error: null, data: null });
      return undefined;
    }

    let cancelled = false;
    setState({ loading: true, error: null, data: null });
    api
      .readRepositoryFile({ repositoryPath: repoPath, path: node.path })
      .then((response) => {
        if (cancelled) return;
        if (!response?.ok) {
          setState({ loading: false, error: response?.error?.message ?? "Failed to read repository file.", data: null });
          return;
        }
        setState({ loading: false, error: null, data: response.data ?? null });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error: error?.message ?? "Failed to read repository file.", data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath, requestKey, node]);

  if (!node) {
    return <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">Select a file to preview its contents.</div>;
  }
  if (state.loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" /> Reading {node.path}…
      </div>
    );
  }
  if (state.error) {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-8 text-center text-sm text-red-400">
        <FileWarning className="size-4 shrink-0" /> {state.error}
      </div>
    );
  }
  if (state.data?.binary) {
    return (
      <div className="flex h-full flex-col">
        <PreviewHeader node={node} data={state.data} onOpenHistory={onOpenHistory} />
        {state.data?.truncated && <PreviewLimitNotice size={state.data.size} />}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
          <ScanLine className="size-6" />
          <p className="font-medium text-foreground">Binary file</p>
          <p className="text-xs">No text preview is available for this file.</p>
          <Badge variant="muted">{formatBytes(state.data.size)}</Badge>
        </div>
      </div>
    );
  }

  const lines = String(state.data?.text ?? "").split("\n");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PreviewHeader node={node} data={state.data} onOpenHistory={onOpenHistory} />
      {state.data?.truncated && <PreviewLimitNotice size={state.data.size} />}
      <div className="min-h-0 flex-1 overflow-auto bg-background/40">
        <pre className="min-w-fit font-mono text-[12px] leading-5">
          {lines.map((line, index) => (
            <div key={index} className="flex min-h-5 hover:bg-accent/40">
              <span
                aria-hidden="true"
                className="sticky left-0 w-14 shrink-0 select-none border-r border-border/50 bg-background/80 px-3 text-right tabular-nums text-muted-foreground/60"
                style={{ minWidth: `calc(${lineNumberWidth(lines.length)} + 3rem)` }}
              >
                {index + 1}
              </span>
              <code className="whitespace-pre px-4 text-foreground/90">{line || " "}</code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

function PreviewLimitNotice({ size }) {
  return (
    <div role="status" className="flex shrink-0 items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-500">
      <FileWarning className="size-3.5 shrink-0" />
      <span>Preview truncated at 1 MB.</span>
      <span className="text-amber-500/70">{formatBytes(size)} total</span>
    </div>
  );
}

function PreviewHeader({ node, data, onOpenHistory }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
      <FilePathLabel path={node.path} className="min-w-0 flex-1 text-xs" />
      {node.status && <FileStatusBadge status={node.status} />}
      {data?.language && <Badge variant="muted">{data.language}</Badge>}
      {data?.size != null && <span className="shrink-0 text-[11px] text-muted-foreground">{formatBytes(data.size)}</span>}
      {onOpenHistory && <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={onOpenHistory}><HistoryIcon /> History</Button>}
      <CopyButton value={node.path} title="Copy path" />
    </div>
  );
}
