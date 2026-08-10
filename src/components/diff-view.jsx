import { useEffect, useMemo, useState } from "react";
import { Copy, FileWarning, LoaderCircle, ScanLine } from "lucide-react";
import { api } from "@/lib/api";
import { cn, copyText } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parseUnifiedDiff } from "@/features/diff/diff-parser";

export { parseUnifiedDiff } from "@/features/diff/diff-parser";

const LINE_STYLE = {
  add: "bg-emerald-500/10",
  delete: "bg-rose-500/10",
  context: "",
  note: "opacity-60",
};
const MARKER_STYLE = {
  add: "text-emerald-500",
  delete: "text-rose-500",
  context: "text-transparent",
  note: "text-muted-foreground",
};
const MARKER_CHAR = { add: "+", delete: "-", context: " ", note: " " };

/**
 * Fetches and renders one file's unified diff.
 * `request` mirrors the diff:file IPC payload (minus repositoryPath).
 */
export function DiffView({ repoPath, request, className, maxHeight }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [showAll, setShowAll] = useState(false);

  const requestKey = JSON.stringify(request);
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });
    setShowAll(false);
    api
      .fileDiff({ repositoryPath: repoPath, ...request })
      .then((response) => {
        if (cancelled) return;
        if (!response?.ok) setState({ loading: false, error: response?.error?.message ?? "Failed to load diff.", data: null });
        else setState({ loading: false, error: null, data: response.data });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error: error?.message ?? "Failed to load diff.", data: null });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath, requestKey]);

  const parsed = useMemo(() => parseUnifiedDiff(state.data?.diff ?? ""), [state.data]);

  if (state.loading) {
    return (
      <div className={cn("flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground", className)}>
        <LoaderCircle className="size-4 animate-spin" /> Loading diff…
      </div>
    );
  }
  if (state.error) {
    return (
      <div className={cn("flex items-center justify-center gap-2 p-10 text-sm text-red-400", className)}>
        <FileWarning className="size-4" /> {state.error}
      </div>
    );
  }
  if (state.data?.binary) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 p-10 text-sm text-muted-foreground", className)}>
        <ScanLine className="size-6" />
        Binary file — no text diff available.
      </div>
    );
  }
  if (parsed.hunks.length === 0) {
    return (
      <div className={cn("flex items-center justify-center p-10 text-sm text-muted-foreground", className)}>
        No textual changes in this file.
      </div>
    );
  }

  const totalLines = parsed.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
  const collapse = totalLines > 900 && !showAll;
  let budget = 500;

  return (
    <div className={cn("min-w-0 font-mono text-[11.5px] leading-[19px]", className)} style={maxHeight ? { maxHeight, overflow: "auto" } : undefined}>
      {state.data?.truncated && (
        <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 font-sans text-xs text-amber-500">
          <FileWarning className="size-3.5" /> Diff is very large — output was truncated by the scanner.
        </div>
      )}
      <div className="min-w-fit">
        {parsed.hunks.map((hunk, hunkIndex) => {
          if (collapse && budget <= 0) return null;
          const lines = collapse ? hunk.lines.slice(0, Math.max(0, budget)) : hunk.lines;
          if (collapse) budget -= hunk.lines.length;
          return (
            <div key={`${hunk.header}-${hunkIndex}`}>
              <div className="sticky top-0 z-[1] flex items-center gap-2 border-y border-border/60 bg-sky-500/8 px-3 py-1 font-sans text-[11px] text-sky-500/90 backdrop-blur first:border-t-0">
                <span className="font-mono">{hunk.header.match(/^@@+ [^@]+ @@+/)?.[0] ?? hunk.header}</span>
                {hunk.context && <span className="truncate text-muted-foreground">{hunk.context}</span>}
              </div>
              {lines.map((line, lineIndex) => (
                <div key={lineIndex} className={cn("flex", LINE_STYLE[line.type])}>
                  <span className="w-11 shrink-0 select-none border-r border-border/40 pr-2 text-right tabular-nums text-muted-foreground/60">
                    {line.oldLine ?? ""}
                  </span>
                  <span className="w-11 shrink-0 select-none border-r border-border/40 pr-2 text-right tabular-nums text-muted-foreground/60">
                    {line.newLine ?? ""}
                  </span>
                  <span className={cn("w-5 shrink-0 select-none text-center font-semibold", MARKER_STYLE[line.type])}>
                    {MARKER_CHAR[line.type]}
                  </span>
                  <span className="whitespace-pre pr-6">{line.text}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {collapse && (
        <div className="flex items-center justify-center border-t border-border p-3 font-sans">
          <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
            Show all {totalLines.toLocaleString()} lines
          </Button>
        </div>
      )}
    </div>
  );
}

const STATUS_META = {
  "?": ["untracked", "border-sky-500/25 bg-sky-500/10 text-sky-500"],
  A: ["added", "border-emerald-500/25 bg-emerald-500/10 text-emerald-500"],
  M: ["modified", "border-amber-500/25 bg-amber-500/10 text-amber-500"],
  D: ["deleted", "border-rose-500/25 bg-rose-500/10 text-rose-500"],
  R: ["renamed", "border-sky-500/25 bg-sky-500/10 text-sky-500"],
  C: ["copied", "border-sky-500/25 bg-sky-500/10 text-sky-500"],
  T: ["type", "border-violet-500/25 bg-violet-500/10 text-violet-500"],
  U: ["conflict", "border-rose-500/25 bg-rose-500/10 text-rose-500"],
};

export function FileStatusBadge({ status }) {
  const [label, classes] = STATUS_META[status] ?? ["changed", "border-border bg-muted text-muted-foreground"];
  return (
    <span
      title={label}
      className={cn("inline-flex size-[18px] shrink-0 items-center justify-center rounded border text-[10px] font-bold", classes)}
    >
      {status}
    </span>
  );
}

export function FilePathLabel({ path, oldPath, className }) {
  const separator = path.lastIndexOf("/");
  const dir = separator >= 0 ? path.slice(0, separator + 1) : "";
  const name = separator >= 0 ? path.slice(separator + 1) : path;
  return (
    <span className={cn("inline-flex min-w-0 items-baseline", className)} title={oldPath ? `${oldPath} → ${path}` : path}>
      {oldPath && <span className="mr-1 truncate text-muted-foreground/70 line-through">{oldPath.split("/").pop()}</span>}
      {oldPath && <span className="mr-1 text-muted-foreground/70">→</span>}
      <span className="truncate text-muted-foreground/80">{dir}</span>
      <span className="shrink-0 font-medium text-foreground">{name}</span>
    </span>
  );
}

export function DiffStat({ additions, deletions, binary, className }) {
  if (binary) return <Badge variant="muted" className={className}>binary</Badge>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums", className)}>
      <span className="text-emerald-500">+{additions ?? 0}</span>
      <span className="text-rose-500">−{deletions ?? 0}</span>
    </span>
  );
}

export function CopyButton({ value, title = "Copy", className, size = "size-6" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={async (event) => {
        event.stopPropagation();
        if (await copyText(value)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        size,
        className,
      )}
    >
      {copied ? <span className="text-[10px] font-semibold text-emerald-500">✓</span> : <Copy className="size-3.5" />}
    </button>
  );
}
