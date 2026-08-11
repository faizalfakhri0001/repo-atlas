import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookmarksView } from "@/components/bookmarks-view";

const { commitDetails } = vi.hoisted(() => ({ commitDetails: vi.fn() }));

vi.mock("@/lib/api", () => ({ api: { commitDetails } }));

const hash = "a".repeat(40);
const orphanHash = "b".repeat(40);
const detail = {
  hash,
  shortHash: hash.slice(0, 8),
  subject: "Prepare release notes",
  author: { date: "2026-08-10T00:00:00.000Z" },
};

const data = {
  repository: { rootPath: "/workspace/repository" },
  commits: [detail],
};

describe("BookmarksView", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows bookmark and notes tabs, searches local records, and preserves orphans", async () => {
    commitDetails.mockResolvedValue({ ok: false, error: { message: "Commit not found" } });
    const bookmark = { id: "bookmark-1", commitHash: hash, label: "Release", category: "release", updatedAt: "2026-08-10T00:00:00.000Z" };
    const orphan = { id: "bookmark-2", commitHash: orphanHash, label: "Old release", category: "release", updatedAt: "2026-08-09T00:00:00.000Z" };
    const note = { id: "note-1", targetType: "commit", targetId: hash, title: "Release context", body: "Keep this context locally.", updatedAt: "2026-08-10T00:00:00.000Z" };
    const onDeleteBookmark = vi.fn();
    const onEditNote = vi.fn();
    const user = userEvent.setup();

    render(
      <BookmarksView
        data={data}
        bookmarks={[bookmark, orphan]}
        notes={[note]}
        onDeleteBookmark={onDeleteBookmark}
        onEditNote={onEditNote}
      />,
    );

    expect(screen.getByRole("heading", { name: "Bookmarked Commits" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Bookmarks/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Notes/ })).toBeInTheDocument();
    expect(await screen.findByText("Commit is no longer available in this repository.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep Local Record" })).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "Search bookmarks" }), "release");
    expect(screen.getByText("Release")).toBeInTheDocument();
    expect(screen.getByText("Old release")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete", exact: true }));
    expect(onDeleteBookmark).toHaveBeenCalledWith(orphan);

    await user.click(screen.getByRole("tab", { name: /Notes/ }));
    expect(screen.getByText("Keep this context locally.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: new RegExp(`Edit note ${hash.slice(0, 8)}`) }));
    expect(onEditNote).toHaveBeenCalledWith(hash);
  });

  it("resolves a bookmarked commit with the bounded detail lookup", async () => {
    const missingHash = "c".repeat(40);
    commitDetails.mockResolvedValue({ ok: true, data: { ...detail, hash: missingHash, shortHash: missingHash.slice(0, 8), subject: "Loaded from Git" } });
    render(
      <BookmarksView
        data={{ repository: data.repository, commits: [] }}
        bookmarks={[{ id: "bookmark-3", commitHash: missingHash, label: "Loaded" }]}
      />,
    );

    expect(await screen.findByText("Loaded from Git")).toBeInTheDocument();
    await waitFor(() => expect(commitDetails).toHaveBeenCalledWith({ repositoryPath: data.repository.rootPath, hash: missingHash }));
  });
});
