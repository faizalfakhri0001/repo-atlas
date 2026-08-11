import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  Calendar,
  Copy,
  FileWarning,
  LoaderCircle,
  MessageSquare,
  Pencil,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, copyText, formatDate, formatRelativeDate } from "@/lib/utils";
import { filterBookmarkRecords, filterNoteRecords, getLocalCommitStatus } from "@/features/local-metadata/bookmarks-model";
import { normalizeCommitHash } from "@/features/local-metadata";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const DETAIL_WORKERS = 8;

function useCommitDetails({ repoPath, bookmarks, notes, data }) {
  const knownDetails = useMemo(() => {
    const details = new Map();
    for (const commit of Array.isArray(data?.commits) ? data.commits : []) {
      if (commit?.hash) details.set(normalizeCommitHash(commit.hash), commit);
    }
    return details;
  }, [data?.commits]);
  const requestedHashKey = [
    ...bookmarks.map((bookmark) => normalizeCommitHash(bookmark.commitHash)),
    ...notes.map((note) => normalizeCommitHash(note.targetId)),
  ].filter(Boolean).join("\0");
  const requestedHashes = useMemo(
    () => [...new Set(requestedHashKey ? requestedHashKey.split("\0") : [])],
    [requestedHashKey],
  );
  const [state, setState] = useState({ loading: false, details: new Map(), unavailable: new Set() });

  useEffect(() => {
    let active = true;
    const details = new Map(knownDetails);
    const unavailable = new Set();
    const missing = requestedHashes.filter((hash) => !details.has(hash));
    if (!repoPath || missing.length === 0 || typeof api.commitDetails !== "function") {
      setState({ loading: false, details, unavailable: new Set(missing) });
      return undefined;
    }

    setState({ loading: true, details, unavailable });
    let cursor = 0;
    const worker = async () => {
      while (cursor < missing.length) {
        const hash = missing[cursor++];
        try {
          const response = await api.commitDetails({ repositoryPath: repoPath, hash });
          if (!active) return;
          if (response?.ok && response.data) details.set(hash, response.data);
          else unavailable.add(hash);
        } catch {
          if (!active) return;
          unavailable.add(hash);
        }
      }
    };
    const workers = Array.from({ length: Math.min(DETAIL_WORKERS, missing.length) }, () => worker());
    Promise.all(workers).then(() => {
      if (active) setState({ loading: false, details: new Map(details), unavailable: new Set(unavailable) });
    });
    return () => {
      active = false;
    };
  }, [knownDetails, requestedHashes, repoPath]);

  return state;
}

function commitDate(detail, record) {
  return detail?.author?.date ?? detail?.date ?? record.updatedAt;
}

function CommitReference({ detail, hash, onOpen }) {
  if (!detail) return <code className="font-mono text-[11px] text-muted-foreground">{hash.slice(0, 10)}</code>;
  return (
    <button type="button" onClick={() => onOpen?.(hash)} className="font-mono text-[11px] text-primary hover:underline" title="Open commit details">
      {detail.shortHash ?? hash.slice(0, 10)}
    </button>
  );
}

function OrphanNotice({ hash, onDelete, onCopy }) {
  return (
    <div className="space-y-2 rounded-md border border-amber-500/25 bg-amber-500/10 p-2.5 text-xs text-amber-300">
      <div className="flex items-start gap-2">
        <FileWarning className="mt-0.5 size-3.5 shrink-0" />
        <span>Commit is no longer available in this repository.</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" className="h-7 border-amber-500/30 px-2 text-[11px]" disabled title="The local record is already being kept">
          Keep Local Record
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => onCopy?.(hash)}><Copy /> Copy Hash</Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-red-400 hover:text-red-300" onClick={onDelete}><Trash2 /> Delete</Button>
      </div>
    </div>
  );
}

function BookmarkCard({ bookmark, detail, orphan, onOpen, onEdit, onDelete }) {
  const hash = normalizeCommitHash(bookmark.commitHash);
  return (
    <Card className={cn("bg-card/65", orphan && "border-amber-500/25")}>
      <CardHeader className="gap-2 pb-3">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/12 text-amber-400"><Star className="size-4 fill-current" /></div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-sm" title={bookmark.label ?? detail?.subject ?? hash}>
              {bookmark.label || detail?.subject || "Bookmarked commit"}
            </CardTitle>
            <CardDescription className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              <CommitReference detail={detail} hash={hash} onOpen={onOpen} />
              {bookmark.category && <Badge variant="secondary">{bookmark.category}</Badge>}
              {!bookmark.category && <Badge variant="muted">Uncategorized</Badge>}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {detail ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">{detail.subject || "Untitled commit"}</span>
            <span className="flex shrink-0 items-center gap-1" title={formatDate(commitDate(detail, bookmark))}><Calendar className="size-3" />{formatRelativeDate(commitDate(detail, bookmark))}</span>
          </div>
        ) : orphan ? (
          <OrphanNotice hash={hash} onDelete={() => onDelete?.(bookmark)} onCopy={copyText} />
        ) : (
          <div className="rounded-md bg-muted/35 p-2.5 text-xs text-muted-foreground">Resolving commit details…</div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {detail && <Button size="sm" onClick={() => onOpen?.(hash)}><Bookmark /> Open Commit</Button>}
          <Button variant="outline" size="sm" onClick={() => onEdit?.(hash)} aria-label={`Edit bookmark ${hash.slice(0, 8)}`}><Pencil /> Edit</Button>
          <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={() => onDelete?.(bookmark)} aria-label={`Delete bookmark ${hash.slice(0, 8)}`}><Trash2 /> Delete</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NoteCard({ note, detail, orphan, onOpen, onEdit, onDelete }) {
  const hash = normalizeCommitHash(note.targetId);
  return (
    <Card className={cn("bg-card/65", !detail && "border-amber-500/25")}>
      <CardHeader className="gap-2 pb-3">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><MessageSquare className="size-4" /></div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-sm" title={note.title || "Local note"}>{note.title || "Local note"}</CardTitle>
            <CardDescription className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              <CommitReference detail={detail} hash={hash} onOpen={onOpen} />
              {detail?.subject && <span className="truncate">{detail.subject}</span>}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2.5 font-sans text-xs leading-5 text-muted-foreground">{note.body}</pre>
        {orphan && <OrphanNotice hash={hash} onDelete={() => onDelete?.(note)} onCopy={copyText} />}
        {!detail && !orphan && <div className="rounded-md bg-muted/35 p-2.5 text-xs text-muted-foreground">Resolving commit details…</div>}
        {detail && <div className="text-[11px] text-muted-foreground" title={formatDate(note.updatedAt)}>Updated {formatRelativeDate(note.updatedAt)}</div>}
        <div className="flex flex-wrap gap-1.5">
          {detail && <Button size="sm" onClick={() => onOpen?.(hash)}><Bookmark /> Open Commit</Button>}
          <Button variant="outline" size="sm" onClick={() => onEdit?.(hash)} aria-label={`Edit note ${hash.slice(0, 8)}`}><Pencil /> Edit</Button>
          <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={() => onDelete?.(note)} aria-label={`Delete note ${hash.slice(0, 8)}`}><Trash2 /> Delete</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function BookmarksView({
  data,
  bookmarks = [],
  notes = [],
  loading = false,
  error = null,
  warning = null,
  onReload,
  onOpenCommit,
  onEditBookmark,
  onDeleteBookmark,
  onEditNote,
  onDeleteNote,
}) {
  const [tab, setTab] = useState("bookmarks");
  const [query, setQuery] = useState("");
  const detailState = useCommitDetails({ repoPath: data?.repository?.rootPath, bookmarks, notes, data });
  const filteredBookmarks = useMemo(() => filterBookmarkRecords(bookmarks, query, detailState.details), [bookmarks, detailState.details, query]);
  const filteredNotes = useMemo(() => filterNoteRecords(notes, query, detailState.details), [detailState.details, notes, query]);
  const orphanCount = useMemo(
    () => [...bookmarks, ...notes].filter((record) => !detailState.details.has(normalizeCommitHash(record.commitHash ?? record.targetId))).length,
    [bookmarks, detailState.details, notes],
  );
  const visibleCount = tab === "bookmarks" ? filteredBookmarks.length : filteredNotes.length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary"><Bookmark className="size-5" /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-lg font-semibold tracking-tight">Bookmarked Commits</h1><Badge variant="muted">{(bookmarks.length + notes.length).toLocaleString()}</Badge></div>
            <p className="mt-1 text-xs text-muted-foreground">Keep local context for important commits without changing Git history.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onReload} disabled={loading}><LoaderCircle className={cn("size-3.5", loading && "animate-spin")} /> Refresh</Button>
      </div>
      {warning && <div className="border-b border-amber-500/25 bg-amber-500/10 px-5 py-2 text-xs text-amber-400">{warning}</div>}
      {error && <div role="alert" className="border-b border-red-500/25 bg-red-500/10 px-5 py-2 text-xs text-red-400">{error}</div>}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-2.5">
        <div role="tablist" aria-label="Bookmarks and notes" className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
          <button type="button" role="tab" aria-selected={tab === "bookmarks"} onClick={() => setTab("bookmarks")} className={cn("rounded-md px-3 py-1.5 text-xs", tab === "bookmarks" ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Bookmarks <span className="ml-1 tabular-nums">{bookmarks.length}</span></button>
          <button type="button" role="tab" aria-selected={tab === "notes"} onClick={() => setTab("notes")} className={cn("rounded-md px-3 py-1.5 text-xs", tab === "notes" ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Notes <span className="ml-1 tabular-nums">{notes.length}</span></button>
        </div>
        <div className="relative min-w-52 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} aria-label={`Search ${tab}`} placeholder={tab === "bookmarks" ? "Search hash, label, category, subject…" : "Search title, note, hash, subject…"} className="h-8 pl-8 text-xs" />
        </div>
        <span className="text-[11px] text-muted-foreground">{visibleCount.toLocaleString()} shown</span>
        {orphanCount > 0 && <Badge variant="warning">{orphanCount} unavailable</Badge>}
      </div>
      <div className="min-h-0 flex-1 p-5">
        {loading && bookmarks.length === 0 && notes.length === 0 ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="animate-spin" /> Loading local metadata…</div>
        ) : tab === "bookmarks" ? (
          filteredBookmarks.length === 0 ? (
            <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-border p-8 text-center"><div><Star className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">{query ? "No matching bookmarks" : "No bookmarks yet"}</p><p className="mt-1 text-xs text-muted-foreground">{query ? "Try a different hash, label, or category." : "Use Bookmark from a commit to keep it here."}</p></div></div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">{filteredBookmarks.map((bookmark) => { const status = getLocalCommitStatus(bookmark, detailState.details, detailState.unavailable); return <BookmarkCard key={bookmark.id} bookmark={bookmark} detail={status.detail} orphan={status.orphan} onOpen={onOpenCommit} onEdit={onEditBookmark} onDelete={onDeleteBookmark} />; })}</div>
          )
        ) : filteredNotes.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-border p-8 text-center"><div><MessageSquare className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">{query ? "No matching notes" : "No notes yet"}</p><p className="mt-1 text-xs text-muted-foreground">{query ? "Try a different title, body, or hash." : "Add a local note from a commit detail panel."}</p></div></div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">{filteredNotes.map((note) => { const status = getLocalCommitStatus(note, detailState.details, detailState.unavailable); return <NoteCard key={note.id} note={note} detail={status.detail} orphan={status.orphan} onOpen={onOpenCommit} onEdit={onEditNote} onDelete={onDeleteNote} />; })}</div>
        )}
        {detailState.loading && (bookmarks.length > 0 || notes.length > 0) && <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" /> Resolving bookmarked commits…</div>}
      </div>
    </div>
  );
}
