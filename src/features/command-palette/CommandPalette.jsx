import { AlertCircle, ArrowDown, ArrowUp, Check, Command, CornerDownLeft, LoaderCircle, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SHORTCUT_LABELS = {
  alt: "Alt",
  ctrl: "Ctrl",
  enter: "Enter",
  escape: "Esc",
  mod: "⌘/Ctrl",
  shift: "Shift",
};

export function formatCommandShortcut(shortcut = []) {
  return shortcut.map((part) => SHORTCUT_LABELS[part] ?? part.toUpperCase()).join(" ");
}

function CommandItem({ command, index, selected, enabled, executing, onExecute, onSelect }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-disabled={!enabled}
      disabled={!enabled || executing}
      onMouseMove={() => onSelect(index)}
      onClick={() => onExecute(command)}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        selected ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent/60",
        !enabled && "cursor-not-allowed opacity-45",
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {executing ? <LoaderCircle className="size-4 animate-spin" /> : selected ? <Check className="size-4" /> : <Command className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{command.label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{command.category}</span>
      </span>
      {command.shortcut?.length > 0 && (
        <kbd className="shrink-0 rounded border border-border bg-background/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {formatCommandShortcut(command.shortcut)}
        </kbd>
      )}
    </button>
  );
}

export function CommandPalette({
  open,
  onOpenChange,
  query = "",
  onQueryChange,
  commands = [],
  selectedIndex = 0,
  onSelectedIndexChange,
  onExecute,
  isCommandEnabled = () => true,
  executingId = null,
  error = null,
}) {
  const selected = Math.min(Math.max(selectedIndex, 0), Math.max(commands.length - 1, 0));

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onSelectedIndexChange?.(commands.length ? (selected + 1) % commands.length : 0);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onSelectedIndexChange?.(commands.length ? (selected - 1 + commands.length) % commands.length : 0);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      onSelectedIndexChange?.(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      onSelectedIndexChange?.(Math.max(commands.length - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const command = commands[selected];
      if (command && isCommandEnabled(command)) onExecute?.(command);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onOpenChange?.(false);
    }
  };

  let previousCategory = null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0" hideClose>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">Search and run an application command.</DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => onQueryChange?.(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search…"
            aria-label="Command palette input"
            className="h-12 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          />
          <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Esc</kbd>
        </div>

        {error && (
          <div role="alert" className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-400">
            <AlertCircle className="size-3.5" /> {error}
          </div>
        )}

        <div role="listbox" aria-label="Available commands" className="max-h-[min(60vh,30rem)] overflow-auto py-2">
          {commands.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">No commands found.</div>
          ) : commands.map((command, index) => {
            const showCategory = command.category !== previousCategory;
            previousCategory = command.category;
            return (
              <div key={command.id}>
                {showCategory && <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{command.category}</div>}
                <CommandItem
                  command={command}
                  index={index}
                  selected={selected === index}
                  enabled={isCommandEnabled(command)}
                  executing={executingId === command.id}
                  onExecute={onExecute}
                  onSelect={onSelectedIndexChange}
                />
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><ArrowDown className="size-3" /><ArrowUp className="size-3" /> Navigate</span>
          <span className="inline-flex items-center gap-1"><CornerDownLeft className="size-3" /> Run</span>
          <span className="ml-auto">Commands stay offline</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
