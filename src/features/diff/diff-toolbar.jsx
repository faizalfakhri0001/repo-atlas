import { Columns2, Code2, Rows3, WrapText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function DiffToolbar({ mode, wrap, syntaxHighlight, onModeChange, onWrapChange, onSyntaxHighlightChange, totalLines }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-background/95 px-3 py-1.5 text-xs backdrop-blur" aria-label="Diff toolbar">
      <div role="group" aria-label="Diff mode" className="flex items-center gap-1">
        <Button
          size="sm"
          variant={mode === "unified" ? "secondary" : "outline"}
          aria-pressed={mode === "unified"}
          onClick={() => onModeChange?.("unified")}
          className="h-7 px-2 text-[11px]"
        >
          <Rows3 /> Unified
        </Button>
        <Button
          size="sm"
          variant={mode === "split" ? "secondary" : "outline"}
          aria-pressed={mode === "split"}
          onClick={() => onModeChange?.("split")}
          className="h-7 px-2 text-[11px]"
        >
          <Columns2 /> Split
        </Button>
      </div>
      <Button
        size="sm"
        variant={wrap ? "secondary" : "outline"}
        aria-pressed={wrap}
        onClick={() => onWrapChange?.(!wrap)}
        className="h-7 px-2 text-[11px]"
      >
        <WrapText /> Wrap
      </Button>
      <Button
        size="sm"
        variant={syntaxHighlight ? "secondary" : "outline"}
        aria-pressed={syntaxHighlight}
        onClick={() => onSyntaxHighlightChange?.(!syntaxHighlight)}
        className="h-7 px-2 text-[11px]"
      >
        <Code2 /> Syntax
      </Button>
      {totalLines != null && <span className={cn("ml-auto text-[10px] tabular-nums text-muted-foreground")}>{totalLines.toLocaleString()} lines</span>}
    </div>
  );
}
