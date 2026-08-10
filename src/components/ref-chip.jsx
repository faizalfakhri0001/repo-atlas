import { Cloud, GitBranch, Tag, Unplug } from "lucide-react";
import { classifyRef, cn } from "@/lib/utils";

/**
 * Pill badge for a single `%D` decoration label (branch / remote / tag / HEAD).
 * `color` tints local branch chips with the branch's graph lane color.
 */
export function RefChip({ label, remotes = [], color, onClick, className }) {
  const ref = classifyRef(label, remotes);
  const clickable = Boolean(onClick);

  const base =
    "inline-flex h-[18px] max-w-44 items-center gap-1 truncate rounded-full border px-1.5 text-[10.5px] font-medium leading-none transition-colors";
  const interactive = clickable ? "cursor-pointer" : "";

  if (ref.type === "head") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!clickable}
        title={`HEAD points at ${ref.name}`}
        className={cn(base, interactive, "border-transparent bg-primary text-primary-foreground shadow-sm", clickable && "hover:bg-primary/85", className)}
      >
        <GitBranch className="size-2.5 shrink-0" />
        <span className="truncate">{ref.name}</span>
      </button>
    );
  }

  if (ref.type === "detached") {
    return (
      <span title="Detached HEAD" className={cn(base, "border-amber-500/30 bg-amber-500/10 text-amber-500", className)}>
        <Unplug className="size-2.5 shrink-0" />
        <span>HEAD</span>
      </span>
    );
  }

  if (ref.type === "tag") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!clickable}
        title={`Tag ${ref.name}`}
        className={cn(base, interactive, "border-amber-500/25 bg-amber-500/10 text-amber-500", clickable && "hover:bg-amber-500/20", className)}
      >
        <Tag className="size-2.5 shrink-0" />
        <span className="truncate">{ref.name}</span>
      </button>
    );
  }

  if (ref.type === "remote") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!clickable}
        title={`Remote branch ${ref.name}`}
        className={cn(
          base,
          interactive,
          "border-border bg-muted/70 text-muted-foreground",
          clickable && "hover:bg-accent hover:text-foreground",
          className,
        )}
      >
        <Cloud className="size-2.5 shrink-0" />
        <span className="truncate">{ref.name}</span>
      </button>
    );
  }

  const tint = color ?? "var(--primary)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      title={`Branch ${ref.name}`}
      style={{
        borderColor: `color-mix(in oklab, ${tint} 45%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${tint} 14%, transparent)`,
        color: tint,
      }}
      className={cn(base, interactive, clickable && "hover:brightness-110", className)}
    >
      <GitBranch className="size-2.5 shrink-0" />
      <span className="truncate">{ref.name}</span>
    </button>
  );
}

export function RefChipList({ refs = [], remotes = [], colorFor, onRefClick, max = 4, className }) {
  if (refs.length === 0) return null;
  const visible = refs.slice(0, max);
  const hidden = refs.length - visible.length;
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {visible.map((label) => (
        <RefChip
          key={label}
          label={label}
          remotes={remotes}
          color={colorFor?.(label)}
          onClick={onRefClick ? () => onRefClick(label) : undefined}
        />
      ))}
      {hidden > 0 && (
        <span
          title={refs.slice(max).join("\n")}
          className="inline-flex h-[18px] items-center rounded-full border border-border bg-muted/60 px-1.5 text-[10.5px] font-medium text-muted-foreground"
        >
          +{hidden}
        </span>
      )}
    </span>
  );
}
