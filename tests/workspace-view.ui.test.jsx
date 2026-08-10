import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceView } from "@/components/workspace-view";

const status = {
  branch: "main",
  files: [
    { kind: "conflict", index: "U", worktree: "U", path: "conflict.js", conflicted: true },
    { kind: "changed", index: "M", worktree: ".", path: "staged.js", staged: true, unstaged: false },
    { kind: "changed", index: "M", worktree: "M", path: "mixed.js", staged: true, unstaged: true },
    { kind: "changed", index: ".", worktree: "M", path: "unstaged.js", staged: false, unstaged: true },
    { kind: "untracked", index: "?", worktree: "?", path: "notes.md", untracked: true, unstaged: true },
    { kind: "ignored", index: "!", worktree: "!", path: "ignored.log" },
  ],
};

describe("WorkspaceView", () => {
  afterEach(() => cleanup());

  it("keeps read-only operations disabled and labels independent status groups", async () => {
    const user = userEvent.setup();
    const onOperation = vi.fn();
    render(<WorkspaceView status={status} repoPath="/workspace/repository" onOperation={onOperation} />);

    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.getByText("Merge conflicts")).toBeInTheDocument();
    expect(screen.getByText("Staged changes")).toBeInTheDocument();
    expect(screen.getByText("Unstaged changes")).toBeInTheDocument();
    expect(screen.getByText("Untracked files")).toBeInTheDocument();
    expect(screen.queryByText("ignored.log")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Select unstaged.js for staging" }));
    expect(screen.getByText("1 file selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stage", exact: true })).toBeDisabled();
    expect(onOperation).not.toHaveBeenCalled();
  });

  it("stages multiple selected paths with one operation", async () => {
    const user = userEvent.setup();
    const onOperation = vi.fn().mockResolvedValue({ ok: true, data: { changed: true } });
    render(
      <WorkspaceView
        status={status}
        repoPath="/workspace/repository"
        operationMode="safe-write"
        onOperation={onOperation}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Select unstaged.js for staging" }));
    await user.click(screen.getByRole("checkbox", { name: "Select notes.md for staging" }));
    expect(screen.getByText("2 files selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Stage", exact: true }));
    expect(onOperation).toHaveBeenCalledWith("stage", ["unstaged.js", "notes.md"]);
    expect(await screen.findByText("Staged 2 files.")).toBeInTheDocument();
  });

  it("unstages selected files and uses explicit conflict resolution terminology", async () => {
    const user = userEvent.setup();
    const onOperation = vi.fn().mockResolvedValue({ ok: true, data: { changed: true } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <WorkspaceView
        status={status}
        repoPath="/workspace/repository"
        operationMode="safe-write"
        onOperation={onOperation}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Select staged.js for unstaging" }));
    await user.click(screen.getByRole("button", { name: "Unstage", exact: true }));
    expect(onOperation).toHaveBeenCalledWith("unstage", ["staged.js"]);

    await user.click(screen.getByRole("checkbox", { name: "Select staged.js for unstaging" }));
    await user.click(screen.getByRole("checkbox", { name: "Select mixed.js for unstaging" }));
    await user.click(screen.getByRole("button", { name: "Unstage", exact: true }));
    expect(onOperation).toHaveBeenLastCalledWith("unstage", ["staged.js", "mixed.js"]);

    await user.click(screen.getByRole("checkbox", { name: "Select conflict.js for marking resolved" }));
    expect(screen.getByRole("button", { name: "Mark resolved", exact: true })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark resolved", exact: true }));
    expect(confirm).toHaveBeenCalledWith("Mark the selected file as resolved in the Git index?");
    expect(onOperation).toHaveBeenCalledWith("stage", ["conflict.js"]);
  });

  it("lets the user enable Safe Write before running an operation", async () => {
    const user = userEvent.setup();
    const onSetOperationMode = vi.fn().mockResolvedValue({ ok: true, data: { operationMode: "safe-write" } });
    render(
      <WorkspaceView
        status={{ files: [{ kind: "changed", index: ".", worktree: "M", path: "app.js", unstaged: true }] }}
        repoPath="/workspace/repository"
        onSetOperationMode={onSetOperationMode}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Enable Safe Write" }));
    expect(onSetOperationMode).toHaveBeenCalledWith("safe-write");
  });
});
