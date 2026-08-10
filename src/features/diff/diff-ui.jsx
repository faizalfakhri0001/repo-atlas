import { useState } from "react";
import { Copy } from "lucide-react";
import { cn, copyText } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

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
    <span title={label} className={cn("inline-flex size-[18px] shrink-0 items-center justify-center rounded border text-[10px] font-bold", classes)}>
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
      className={cn("inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground", size, className)}
    >
      {copied ? <span className="text-[10px] font-semibold text-emerald-500">✓</span> : <Copy className="size-3.5" />}
    </button>
  );
}
