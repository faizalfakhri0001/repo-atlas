import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiffView } from "@/features/diff/diff-view";

const { fileDiff } = vi.hoisted(() => ({ fileDiff: vi.fn() }));

vi.mock("@/lib/api", () => ({ api: { fileDiff } }));

const diff = [
  "diff --git a/app.js b/app.js",
  "index 1111111..2222222 100644",
  "--- a/app.js",
  "+++ b/app.js",
  "@@ -1 +1 @@",
  "-old",
  "+new",
].join("\n");

describe("workspace hunk controls", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("uses backend hunk IDs for stage and unstage actions", async () => {
    const hunkId = "a".repeat(64);
    fileDiff.mockResolvedValue({
      ok: true,
      data: {
        diff,
        truncated: false,
        binary: false,
        hunks: [{ id: hunkId, header: "@@ -1 +1 @@", lineCount: 2 }],
      },
    });
    const onHunkAction = vi.fn();
    const user = userEvent.setup();
    render(
      <DiffView
        repoPath="/workspace/repository"
        request={{ type: "workspace", path: "app.js", staged: false }}
        onHunkAction={onHunkAction}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Stage Hunk" }));
    expect(onHunkAction).toHaveBeenCalledWith(hunkId);
    expect(fileDiff).toHaveBeenCalledWith({ repositoryPath: "/workspace/repository", type: "workspace", path: "app.js", staged: false });
  });

  it("labels staged diffs for unstage and hides controls for truncated output", async () => {
    const hunkId = "b".repeat(64);
    fileDiff.mockResolvedValueOnce({
      ok: true,
      data: { diff, truncated: false, binary: false, hunks: [{ id: hunkId, header: "@@ -1 +1 @@", lineCount: 2 }] },
    });
    const onHunkAction = vi.fn();
    render(
      <DiffView
        repoPath="/workspace/repository"
        request={{ type: "workspace", path: "app.js", staged: true }}
        onHunkAction={onHunkAction}
      />,
    );
    expect(await screen.findByRole("button", { name: "Unstage Hunk" })).toBeInTheDocument();

    cleanup();
    fileDiff.mockResolvedValueOnce({
      ok: true,
      data: { diff, truncated: true, binary: false, hunks: [{ id: hunkId, header: "@@ -1 +1 @@", lineCount: 2 }] },
    });
    render(
      <DiffView
        repoPath="/workspace/repository"
        request={{ type: "workspace", path: "app.js", staged: false }}
        onHunkAction={onHunkAction}
      />,
    );
    await screen.findByText("Diff is very large — output was truncated by the scanner.");
    expect(screen.queryByRole("button", { name: "Stage Hunk" })).not.toBeInTheDocument();
  });
});
