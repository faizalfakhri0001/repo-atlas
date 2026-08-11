import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  MAX_BOOKMARK_CATEGORY_LENGTH,
  MAX_BOOKMARK_LABEL_LENGTH,
  MAX_NOTE_BODY_LENGTH,
  MAX_NOTE_TITLE_LENGTH,
} from "@/features/local-metadata";

export function BookmarkDialog({ open, onOpenChange, bookmark = null, commitHash, pending = false, onSubmit }) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLabel(bookmark?.label ?? "");
    setCategory(bookmark?.category ?? "");
    setError(null);
  }, [bookmark, open]);

  const submit = (event) => {
    event.preventDefault();
    if (label.length > MAX_BOOKMARK_LABEL_LENGTH || category.length > MAX_BOOKMARK_CATEGORY_LENGTH) {
      setError("Bookmark label or category is too long.");
      return;
    }
    setError(null);
    onSubmit?.({ label: label.trim() || null, category: category.trim() || null });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{bookmark ? "Edit bookmark" : "Add bookmark"}</DialogTitle>
          <DialogDescription>Keep a local label and category for this commit. Git history is not changed.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="bookmark-label" className="text-sm font-medium">Label</label>
            <Input id="bookmark-label" value={label} maxLength={MAX_BOOKMARK_LABEL_LENGTH} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Release candidate" autoFocus />
            <div className="text-right text-[11px] text-muted-foreground">{label.length}/{MAX_BOOKMARK_LABEL_LENGTH}</div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="bookmark-category" className="text-sm font-medium">Category</label>
            <Input id="bookmark-category" value={category} maxLength={MAX_BOOKMARK_CATEGORY_LENGTH} onChange={(event) => setCategory(event.target.value)} placeholder="e.g. release" />
            <div className="text-right text-[11px] text-muted-foreground">{category.length}/{MAX_BOOKMARK_CATEGORY_LENGTH}</div>
          </div>
          {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange?.(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending && <LoaderCircle className="animate-spin" />} {bookmark ? "Update" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LocalNoteEditor({ open, onOpenChange, note = null, pending = false, onSubmit }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setTitle(note?.title ?? "");
    setBody(note?.body ?? "");
    setError(null);
  }, [note, open]);

  const submit = (event) => {
    event.preventDefault();
    if (title.length > MAX_NOTE_TITLE_LENGTH || body.length > MAX_NOTE_BODY_LENGTH) {
      setError("Note title or body is too long.");
      return;
    }
    setError(null);
    onSubmit?.({ title: title.trim() || null, body });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{note ? "Edit local note" : "Add local note"}</DialogTitle>
          <DialogDescription>This note stays in Repo Atlas metadata and is never written to Git or sent remotely.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="local-note-title" className="text-sm font-medium">Title <span className="font-normal text-muted-foreground">(optional)</span></label>
            <Input id="local-note-title" value={title} maxLength={MAX_NOTE_TITLE_LENGTH} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Follow up before release" autoFocus />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="local-note-body" className="text-sm font-medium">Note</label>
            <textarea id="local-note-body" value={body} maxLength={MAX_NOTE_BODY_LENGTH} onChange={(event) => setBody(event.target.value)} rows={9} className="flex min-h-36 w-full resize-y rounded-md border border-input bg-background/70 px-3 py-2 text-sm leading-5 shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50" placeholder="Write local context for this commit…" />
            <div className="text-right text-[11px] text-muted-foreground">{body.length.toLocaleString()}/{MAX_NOTE_BODY_LENGTH.toLocaleString()}</div>
          </div>
          {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange?.(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending && <LoaderCircle className="animate-spin" />} {note ? "Update" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
