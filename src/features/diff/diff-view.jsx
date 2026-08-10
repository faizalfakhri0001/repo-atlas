import { useEffect, useMemo, useState } from "react";
import { FileWarning, LoaderCircle, ScanLine } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DiffToolbar } from "@/features/diff/diff-toolbar";
import { languageForPath } from "@/features/diff/language-map";
import { countDiffLines, limitDiffHunks, parseUnifiedDiff } from "@/features/diff/diff-parser";
import { loadDiffPreferences, saveDiffPreferences } from "@/features/diff/diff-preferences";
import { SplitDiff } from "@/features/diff/split-diff";
import { UnifiedDiff } from "@/features/diff/unified-diff";

const COLLAPSE_THRESHOLD = 900;
const COLLAPSE_LINES = 500;

export function DiffView({ repoPath, request, className, maxHeight }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [showAll, setShowAll] = useState(false);
  const [preferences, setPreferences] = useState(() => loadDiffPreferences());
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
  }, [repoPath, requestKey]);

  useEffect(() => {
    saveDiffPreferences(preferences);
  }, [preferences]);

  const parsed = useMemo(() => parseUnifiedDiff(state.data?.diff ?? ""), [state.data?.diff]);
  const totalLines = countDiffLines(parsed.hunks);
  const collapse = totalLines > COLLAPSE_THRESHOLD && !showAll;
  const visible = collapse ? limitDiffHunks(parsed.hunks, COLLAPSE_LINES) : { hunks: parsed.hunks, truncated: false };
  const language = languageForPath(request?.path);

  if (state.loading) {
    return <div className={cn("flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground", className)}><LoaderCircle className="size-4 animate-spin" /> Loading diff…</div>;
  }
  if (state.error) {
    return <div className={cn("flex items-center justify-center gap-2 p-10 text-sm text-red-400", className)}><FileWarning className="size-4" /> {state.error}</div>;
  }
  if (state.data?.binary) {
    return <div className={cn("flex flex-col items-center justify-center gap-2 p-10 text-sm text-muted-foreground", className)}><ScanLine className="size-6" /> Binary file — no text diff available.</div>;
  }

  return (
    <div className={cn("flex min-w-0 min-h-0 flex-col", className)} style={maxHeight ? { maxHeight, overflow: "auto" } : undefined}>
      <DiffToolbar
        mode={preferences.mode}
        wrap={preferences.wrap}
        syntaxHighlight={preferences.syntaxHighlight}
        totalLines={totalLines}
        onModeChange={(mode) => setPreferences((current) => ({ ...current, mode }))}
        onWrapChange={(wrap) => setPreferences((current) => ({ ...current, wrap }))}
        onSyntaxHighlightChange={(syntaxHighlight) => setPreferences((current) => ({ ...current, syntaxHighlight }))}
      />
      {state.data?.truncated && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 font-sans text-xs text-amber-500">
          <FileWarning className="size-3.5" /> Diff is very large — output was truncated by the scanner.
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {visible.hunks.length === 0 ? (
          <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">No textual changes in this file.</div>
        ) : preferences.mode === "split" ? (
          <SplitDiff meta={parsed.meta} hunks={visible.hunks} language={language} syntaxHighlight={preferences.syntaxHighlight} wrap={preferences.wrap} />
        ) : (
          <UnifiedDiff meta={parsed.meta} hunks={visible.hunks} language={language} syntaxHighlight={preferences.syntaxHighlight} wrap={preferences.wrap} />
        )}
        {collapse && visible.truncated && (
          <div className="flex items-center justify-center border-t border-border p-3 font-sans">
            <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>Show all {totalLines.toLocaleString()} lines</Button>
          </div>
        )}
      </div>
    </div>
  );
}
