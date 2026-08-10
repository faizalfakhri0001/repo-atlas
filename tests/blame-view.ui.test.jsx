import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlameView } from "@/components/blame-view";

const { fileBlame } = vi.hoisted(() => ({ fileBlame: vi.fn() }));

vi.mock("@/lib/api", () => ({ api: { fileBlame } }));

describe("BlameView commit navigation", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens the commit selected from a blame row", async () => {
    const hash = "a".repeat(40);
    fileBlame.mockResolvedValueOnce({
      ok: true,
      data: {
        path: "src/app.js",
        revision: hash,
        workingTreeDirty: false,
        authors: [{ key: "author", name: "Repo Atlas", email: "repo-atlas@example.test", lines: 1, commits: 1 }],
        lines: [{
          lineNumber: 1,
          content: "export const ready = true;",
          commitHash: hash,
          shortHash: "aaaaaaaa",
          author: { name: "Repo Atlas", email: "repo-atlas@example.test" },
          authorTime: "2026-08-10T00:00:00.000Z",
          summary: "Add ready flag",
          boundary: true,
        }],
        binary: false,
      },
    });
    const onOpenCommit = vi.fn();
    const user = userEvent.setup();
    render(<BlameView repoPath="/workspace/repository" node={{ path: "src/app.js", type: "file" }} onOpenCommit={onOpenCommit} />);

    expect(await screen.findByText("export const ready = true;")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "aaaaaaaa" }));
    expect(onOpenCommit).toHaveBeenCalledWith(hash);
  });

  it("offers the previous revision action only when porcelain provides it", async () => {
    const hash = "b".repeat(40);
    const previousHash = "c".repeat(40);
    fileBlame.mockResolvedValueOnce({
      ok: true,
      data: {
        path: "src/renamed.js",
        revision: hash,
        authors: [],
        lines: [{
          lineNumber: 1,
          content: "export const renamed = true;",
          commitHash: hash,
          shortHash: "bbbbbbbb",
          author: { name: "Repo Atlas", email: "repo-atlas@example.test" },
          authorTime: "2026-08-10T00:00:00.000Z",
          summary: "Rename module",
          previous: { hash: previousHash, path: "src/original.js" },
          boundary: false,
        }],
        binary: false,
      },
    });
    const onOpenPreviousRevision = vi.fn();
    const user = userEvent.setup();
    render(<BlameView repoPath="/workspace/repository" node={{ path: "src/renamed.js", type: "file" }} onOpenPreviousRevision={onOpenPreviousRevision} />);

    const line = await screen.findByText("export const renamed = true;");
    fireEvent.contextMenu(line);
    expect(await screen.findByText("View previous revision")).toBeInTheDocument();
    await user.click(screen.getByText("View previous revision"));
    expect(onOpenPreviousRevision).toHaveBeenCalledWith(previousHash, "src/original.js");
  });
});
