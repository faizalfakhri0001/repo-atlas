import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommitDetails } from "@/components/commit-details";
import { BookmarkDialog, LocalNoteEditor } from "@/components/local-metadata-dialogs";

const { commitDetails } = vi.hoisted(() => ({ commitDetails: vi.fn() }));

vi.mock("@/lib/api", () => ({ api: { commitDetails } }));

const hash = "a".repeat(40);
const detail = {
  hash,
  shortHash: hash.slice(0, 8),
  parents: [],
  refs: [],
  author: { name: "Ada Lovelace", email: "ada@example.test", date: "2026-08-11T00:00:00Z" },
  committer: { name: "Ada Lovelace", email: "ada@example.test", date: "2026-08-11T00:00:00Z" },
  signature: "",
  subject: "Document release context",
  body: "",
  isMerge: false,
  files: [],
  additions: 0,
  deletions: 0,
};

describe("local metadata UI", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("offers bookmark and note actions in commit details", async () => {
    commitDetails.mockResolvedValue({ ok: true, data: detail });
    const onOpenBookmarkEditor = vi.fn();
    const onOpenNoteEditor = vi.fn();
    const user = userEvent.setup();
    render(
      <CommitDetails
        repoPath="/workspace/repository"
        hash={hash}
        headHash={"b".repeat(40)}
        onOpenBookmarkEditor={onOpenBookmarkEditor}
        onOpenNoteEditor={onOpenNoteEditor}
      />,
    );

    expect(await screen.findByText("Document release context")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add bookmark" }));
    await user.click(screen.getByRole("button", { name: "Add note" }));
    expect(onOpenBookmarkEditor).toHaveBeenCalledWith(hash);
    expect(onOpenNoteEditor).toHaveBeenCalledWith(hash);
  });

  it("shows existing bookmark and note controls", async () => {
    commitDetails.mockResolvedValue({ ok: true, data: detail });
    const onOpenBookmarkEditor = vi.fn();
    const onRemoveBookmark = vi.fn();
    const onOpenNoteEditor = vi.fn();
    const onRemoveNote = vi.fn();
    const bookmark = { id: "bookmark-1", commitHash: hash, label: "Release", category: "release" };
    const note = { id: "note-1", targetType: "commit", targetId: hash, title: "Context", body: "Keep this local." };
    const user = userEvent.setup();
    render(
      <CommitDetails
        repoPath="/workspace/repository"
        hash={hash}
        bookmark={bookmark}
        note={note}
        onOpenBookmarkEditor={onOpenBookmarkEditor}
        onRemoveBookmark={onRemoveBookmark}
        onOpenNoteEditor={onOpenNoteEditor}
        onRemoveNote={onRemoveNote}
      />,
    );

    expect(await screen.findByText("Keep this local.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove bookmark" }));
    await user.click(screen.getByRole("button", { name: "Edit bookmark" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Remove local note" }));
    expect(onRemoveBookmark).toHaveBeenCalledWith(bookmark);
    expect(onOpenBookmarkEditor).toHaveBeenCalledWith(hash);
    expect(onOpenNoteEditor).toHaveBeenCalledWith(hash);
    expect(onRemoveNote).toHaveBeenCalledWith(note);
  });

  it("edits bounded bookmark fields and plain-text notes", async () => {
    const onBookmarkSubmit = vi.fn();
    const onNoteSubmit = vi.fn();
    const user = userEvent.setup();
    const view = render(<BookmarkDialog open onOpenChange={vi.fn()} onSubmit={onBookmarkSubmit} />);

    await user.type(screen.getByLabelText("Label"), "Release");
    await user.type(screen.getByLabelText("Category"), "release");
    await user.click(screen.getAllByRole("button", { name: "Save", exact: true })[0]);
    view.unmount();
    render(<LocalNoteEditor open onOpenChange={vi.fn()} onSubmit={onNoteSubmit} />);
    await user.type(screen.getByLabelText("Note"), "Plain text context");
    await user.click(screen.getByRole("button", { name: "Save", exact: true }));
    expect(onBookmarkSubmit).toHaveBeenCalledWith({ label: "Release", category: "release" });
    expect(onNoteSubmit).toHaveBeenCalledWith({ title: null, body: "Plain text context" });
    cleanup();
  });
});
