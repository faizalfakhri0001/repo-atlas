import { cleanup, render, screen } from "@testing-library/react";
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
});
