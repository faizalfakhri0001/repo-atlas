import { useEffect, useMemo, useState } from "react";
import { Bookmark, Copy, LoaderCircle, Pencil, Pin, PinOff, Plus, Save, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  getSavedViewConfigSummary,
  getSavedViewTypeLabel,
  getMissingSavedViewReferences,
  validateSavedViewName,
} from "@/features/saved-views";
import { cn, formatRelativeDate } from "@/lib/utils";

export function SaveViewDialog({
  open,
  onOpenChange,
  mode = "create",
  viewType,
  initialName = "",
  initialPinned = false,
  pending = false,
  onSubmit,
}) {
  const [name, setName] = useState(initialName);
  const [pinned, setPinned] = useState(initialPinned);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setPinned(initialPinned);
    setError(null);
  }, [initialName, initialPinned, open]);

  const submit = (event) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const validationError = validateSavedViewName(normalizedName);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    onSubmit?.({ name: normalizedName, pinned });
  };

  const isRename = mode === "rename";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isRename ? "Rename saved view" : mode === "saveAs" ? "Save view as" : "Save current view"}</DialogTitle>
          <DialogDescription>
            {isRename ? "Choose a new name for this saved view." : `Keep the semantic filters for the current ${getSavedViewTypeLabel(viewType)} view.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="saved-view-name" className="text-sm font-medium">Name</label>
            <Input
              id="saved-view-name"
              aria-label="Saved view name"
              value={name}
              maxLength={80}
              autoFocus
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Release review"
            />
            <div className="flex justify-between gap-3 text-[11px] text-muted-foreground">
              <span>{error ?? "Names can be reused across different views."}</span>
              <span>{name.length}/80</span>
            </div>
          </div>
          {!isRename && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} aria-label="Pin to sidebar" />
              Pin to sidebar
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange?.(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending && <LoaderCircle className="animate-spin" />}
              {isRename ? "Rename" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SavedViewToolbar({ currentView, activeSavedView, modified, onSave, onSaveAs, onRevert, disabled = false }) {
  if (!currentView) return null;
  const label = activeSavedView?.name ?? "Unsaved view";
  return (
    <div role="toolbar" aria-label="Saved view actions" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card/35 px-5 py-2">
      <Bookmark className="size-4 text-primary" />
      <span className="min-w-0 max-w-56 truncate text-xs font-medium" title={label}>
        {label}{modified ? " *" : ""}
      </span>
      <Badge variant="muted">{getSavedViewTypeLabel(currentView.viewType)}</Badge>
      <span className="flex-1" />
      <Button variant="outline" size="sm" onClick={onSave} disabled={disabled || (Boolean(activeSavedView) && !modified)}>
        <Save /> {activeSavedView ? "Save Changes" : "Save View"}
      </Button>
      <Button variant="outline" size="sm" onClick={onSaveAs} disabled={disabled}>
        <Plus /> Save As New
      </Button>
      <Button variant="ghost" size="sm" onClick={onRevert} disabled={disabled || !activeSavedView || !modified}>
        Revert
      </Button>
    </div>
  );
}

function SavedViewCard({ view, missingReferences, onOpen, onRename, onDuplicate, onTogglePin, onDelete }) {
  return (
    <Card className={cn("bg-card/65", view.pinned && "border-primary/35")}>
      <CardHeader className="gap-2 pb-3">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {view.pinned ? <Star className="size-4 fill-current" /> : <Bookmark className="size-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-sm" title={view.name}>{view.name}</CardTitle>
            <CardDescription className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              <Badge variant="secondary">{getSavedViewTypeLabel(view.viewType)}</Badge>
              <span>{formatRelativeDate(view.updatedAt)}</span>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="min-h-5 truncate text-xs text-muted-foreground" title={getSavedViewConfigSummary(view)}>
          {getSavedViewConfigSummary(view)}
        </p>
        {missingReferences.length > 0 && (
          <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-400">
            Needs attention: unavailable reference{missingReferences.length === 1 ? "" : "s"} {missingReferences.join(", ")}.
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => onOpen?.(view)}>Open</Button>
          <Button variant="outline" size="sm" onClick={() => onRename?.(view)} aria-label={`Rename ${view.name}`}><Pencil /> Rename</Button>
          <Button variant="ghost" size="sm" onClick={() => onTogglePin?.(view)} aria-label={`${view.pinned ? "Unpin" : "Pin"} ${view.name}`}>
            {view.pinned ? <PinOff /> : <Pin />} {view.pinned ? "Unpin" : "Pin"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDuplicate?.(view)} aria-label={`Duplicate ${view.name}`}><Copy /> Duplicate</Button>
          <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={() => onDelete?.(view)} aria-label={`Delete ${view.name}`}><Trash2 /> Delete</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function SavedViewsView({
  savedViews = [],
  loading = false,
  error = null,
  warning = null,
  data,
  onReload,
  onOpen,
  onRename,
  onDuplicate,
  onTogglePin,
  onDelete,
  onCreate,
  canCreate = true,
}) {
  const missingById = useMemo(
    () => new Map(savedViews.map((view) => [view.id, getMissingSavedViewReferences(view, data)])),
    [data, savedViews],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary"><Bookmark className="size-5" /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">Saved Views</h1>
              <Badge variant="muted">{savedViews.length.toLocaleString()}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Save semantic filters and reopen the same repository perspective later.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onReload} disabled={loading}><LoaderCircle className={cn("size-3.5", loading && "animate-spin")} /> Refresh</Button>
          <Button size="sm" onClick={onCreate} disabled={!canCreate} title={!canCreate ? "Open a filterable view to create a saved view" : undefined}><Plus /> New Saved View</Button>
        </div>
      </div>
      {warning && <div className="border-b border-amber-500/25 bg-amber-500/10 px-5 py-2 text-xs text-amber-400">{warning}</div>}
      {error && <div className="border-b border-red-500/25 bg-red-500/10 px-5 py-2 text-xs text-red-400">{error}</div>}
      <div className="min-h-0 flex-1 p-5">
        {loading && savedViews.length === 0 ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="animate-spin" /> Loading saved views…</div>
        ) : savedViews.length === 0 ? (
          <div className="flex h-full min-h-64 items-center justify-center rounded-xl border border-dashed border-border p-8 text-center">
            <div><Bookmark className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">No saved views yet</p><p className="mt-1 text-xs text-muted-foreground">Use Save View from a filterable screen to keep a reusable perspective.</p></div>
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {savedViews.map((view) => (
              <SavedViewCard
                key={view.id}
                view={view}
                missingReferences={missingById.get(view.id) ?? []}
                onOpen={onOpen}
                onRename={onRename}
                onDuplicate={onDuplicate}
                onTogglePin={onTogglePin}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SavedViewNotice({ title, description = "This saved configuration is retained and can be opened when its view is available." }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md rounded-xl border border-border bg-card/60 p-6 text-center">
        <Bookmark className="mx-auto size-8 text-primary" />
        <h1 className="mt-3 text-base font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
