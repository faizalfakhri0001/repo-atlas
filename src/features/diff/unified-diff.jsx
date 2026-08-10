import { cn } from "@/lib/utils";

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

export function DiffMeta({ meta }) {
  if (!meta?.length) return null;
  return (
    <div className="border-b border-border/50 bg-muted/20 font-mono text-[11.5px] leading-[19px] text-muted-foreground">
      {meta.map((line, index) => <div key={`${line}-${index}`} className="whitespace-pre px-3">{line}</div>)}
    </div>
  );
}

function DiffLine({ line, wrap }) {
  return (
    <div className={cn("flex min-h-[19px]", LINE_STYLE[line.type])}>
      <span className="w-11 shrink-0 select-none border-r border-border/40 pr-2 text-right tabular-nums text-muted-foreground/60">{line.oldLine ?? ""}</span>
      <span className="w-11 shrink-0 select-none border-r border-border/40 pr-2 text-right tabular-nums text-muted-foreground/60">{line.newLine ?? ""}</span>
      <span className={cn("w-5 shrink-0 select-none text-center font-semibold", MARKER_STYLE[line.type])}>{MARKER_CHAR[line.type]}</span>
      <code className={cn("pr-6", wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre")}>{line.text || " "}</code>
    </div>
  );
}

export function UnifiedDiff({ meta = [], hunks = [], wrap = false }) {
  return (
    <div className="min-w-fit font-mono text-[11.5px] leading-[19px]">
      <DiffMeta meta={meta} />
      {hunks.map((hunk, hunkIndex) => (
        <div key={`${hunk.header}-${hunkIndex}`}>
          <div className="sticky top-0 z-[1] flex items-center gap-2 border-y border-border/60 bg-sky-500/8 px-3 py-1 font-sans text-[11px] text-sky-500/90 backdrop-blur first:border-t-0">
            <span className="font-mono">{hunk.header}</span>
            {hunk.context && <span className="truncate text-muted-foreground">{hunk.context}</span>}
          </div>
          {hunk.lines.map((line, lineIndex) => <DiffLine key={`${line.type}-${lineIndex}`} line={line} wrap={wrap} />)}
        </div>
      ))}
    </div>
  );
}
