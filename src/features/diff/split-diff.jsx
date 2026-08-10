import { cn } from "@/lib/utils";
import { alignSplitHunk } from "@/features/diff/split-aligner";
import { DiffMeta } from "@/features/diff/unified-diff";

const LINE_STYLE = {
  add: "bg-emerald-500/10",
  delete: "bg-rose-500/10",
  context: "",
  note: "opacity-70",
};

const MARKER_STYLE = {
  add: "text-emerald-500",
  delete: "text-rose-500",
  context: "text-transparent",
  note: "text-muted-foreground",
};

const MARKER_CHAR = { add: "+", delete: "-", context: " ", note: " " };

function SplitCell({ line, side, wrap }) {
  const lineNumber = side === "left" ? line?.oldLine : line?.newLine;
  return (
    <div className={cn("flex min-h-[19px] min-w-0", LINE_STYLE[line?.type ?? "context"])}>
      <span className="w-11 shrink-0 select-none border-r border-border/40 pr-2 text-right tabular-nums text-muted-foreground/60">{lineNumber ?? ""}</span>
      <span className={cn("w-5 shrink-0 select-none text-center font-semibold", line ? MARKER_STYLE[line.type] : "text-transparent")}>{line ? MARKER_CHAR[line.type] : " "}</span>
      <code className={cn("min-w-0 pr-4", wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre")}>{line?.text || " "}</code>
    </div>
  );
}

export function SplitDiff({ meta = [], hunks = [], wrap = false }) {
  return (
    <div role="table" aria-label="Split diff" className="min-w-[760px] font-mono text-[11.5px] leading-[19px]">
      <DiffMeta meta={meta} />
      <div role="row" className="grid grid-cols-2 border-b border-border/60 bg-muted/20 px-3 py-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Old</span>
        <span className="border-l border-border/60 pl-3">New</span>
      </div>
      {hunks.map((hunk, hunkIndex) => (
        <div key={`${hunk.header}-${hunkIndex}`}>
          <div className="sticky top-0 z-[1] border-y border-border/60 bg-sky-500/8 px-3 py-1 font-sans text-[11px] text-sky-500/90 backdrop-blur">
            <span className="font-mono">{hunk.header}</span>
            {hunk.context && <span className="ml-2 text-muted-foreground">{hunk.context}</span>}
          </div>
          {alignSplitHunk(hunk).map((row, rowIndex) => (
            <div role="row" key={`${hunk.header}-${rowIndex}`} className="grid grid-cols-2">
              <SplitCell line={row.left} side="left" wrap={wrap} />
              <div className="border-l border-border/60 pl-3"><SplitCell line={row.right} side="right" wrap={wrap} /></div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
