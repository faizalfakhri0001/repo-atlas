import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorktreesView } from "@/components/worktrees-view";

const { worktreeDetails, revealRepository, chooseWorktreeLocation, worktreeCreatePreview, worktreeCreate } = vi.hoisted(() => ({
  worktreeDetails: vi.fn(),
  revealRepository: vi.fn(),
  chooseWorktreeLocation: vi.fn(),
  worktreeCreatePreview: vi.fn(),
  worktreeCreate: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: { worktreeDetails, revealRepository, chooseWorktreeLocation, worktreeCreatePreview, worktreeCreate } }));

const main = {
  path: "/workspace/repository",
  head: "a".repeat(40),
  shortHead: "aaaaaaaa",
  branch: "main",
  main: true,
  exists: true,
  bare: false,
  detached: false,
  locked: false,
  prunable: false,
  dirty: true,
  changes: 2,
};

const linked = {
  path: "/workspace/repository-hotfix",
  head: "b".repeat(40),
  shortHead: "bbbbbbbb",
  branch: "fix/timezone",
  main: false,
  exists: true,
  bare: false,
  detached: false,
  locked: true,
  prunable: false,
  dirty: false,
  changes: 0,
};

describe("WorktreesView", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("groups worktrees and loads selected dirty status on demand", async () => {
    worktreeDetails.mockImplementation(async ({ path }) => ({
      ok: true,
      data: {
        worktree: path === main.path ? main : linked,
        dirty: path === main.path,
        changes: path === main.path ? 2 : 0,
        status: {
          branch: path === main.path ? "main" : "fix/timezone",
          oid: path === main.path ? main.head : linked.head,
          upstream: path === main.path ? "origin/main" : "",
          files: path === main.path ? [{ path: "src/app.js", kind: "changed" }, { path: "notes.txt", kind: "untracked" }] : [],
        },
      },
    }));
    const user = userEvent.setup();
    const onOpenWorktree = vi.fn();
    const onCompare = vi.fn();
    render(
      <WorktreesView
        worktrees={[main, linked]}
        repoPath="/workspace/repository"
        currentWorktreePath={main.path}
        currentBranch="main"
        defaultBranch="main"
        onOpenWorktree={onOpenWorktree}
        onCompare={onCompare}
      />,
    );

    expect(screen.getByText("Main worktree")).toBeInTheDocument();
    expect(screen.getByText("Additional worktrees")).toBeInTheDocument();
    expect(await screen.findByText("2 changes")).toBeInTheDocument();
    expect(screen.getByText("Changed files")).toBeInTheDocument();
    await waitFor(() => expect(worktreeDetails).toHaveBeenCalledWith({ repositoryPath: "/workspace/repository", path: main.path }));

    await user.click(screen.getByRole("button", { name: /repository-hotfix/ }));
    expect((await screen.findAllByText("Clean")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("fix/timezone").length).toBeGreaterThan(0);
    await waitFor(() => expect(worktreeDetails).toHaveBeenCalledWith({ repositoryPath: "/workspace/repository", path: linked.path }));

    await user.click(screen.getByRole("button", { name: /Reveal in file manager/ }));
    expect(revealRepository).toHaveBeenCalledWith(linked.path);
    await user.click(screen.getByRole("button", { name: "Open in Repo Atlas" }));
    expect(onOpenWorktree).toHaveBeenCalledWith(linked.path);
    await user.click(screen.getByRole("button", { name: "Compare with current" }));
    await user.click(screen.getByRole("button", { name: "Compare with default" }));
    expect(onCompare).toHaveBeenNthCalledWith(1, "main", "fix/timezone");
    expect(onCompare).toHaveBeenNthCalledWith(2, "main", "fix/timezone");
  });

  it("previews and confirms a new worktree through the explicit create flow", async () => {
    worktreeDetails.mockResolvedValue({
      ok: true,
      data: { worktree: main, dirty: true, changes: 2, status: { branch: "main", oid: main.head, files: [] } },
    });
    chooseWorktreeLocation.mockResolvedValue({ ok: true, data: "/workspace" });
    worktreeCreatePreview.mockResolvedValue({
      ok: true,
      data: {
        allowed: true,
        operation: { mode: "new-branch", newBranch: "feature/new-worktree", startPoint: "main", targetPath: "/workspace/repository-new-worktree" },
        warnings: [],
        blockingReasons: [],
      },
    });
    worktreeCreate.mockResolvedValue({ ok: true, data: { operation: { targetPath: "/workspace/repository-new-worktree" } } });
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const onSetOperationMode = vi.fn();
    render(
      <WorktreesView
        worktrees={[main]}
        repoPath="/workspace/repository"
        currentWorktreePath={main.path}
        currentBranch="main"
        currentHead={main.head}
        defaultBranch="main"
        branches={[{ name: "main", remote: false, current: true }, { name: "feature/demo", remote: false }]}
        sessionId="session-1"
        operationMode="safe-write"
        onSetOperationMode={onSetOperationMode}
        onRefresh={onRefresh}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create Worktree" }));
    await user.click(screen.getByRole("button", { name: "Choose parent folder" }));
    expect(chooseWorktreeLocation).toHaveBeenCalledWith({ repositoryPath: "/workspace/repository" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Create mode" }), "new-branch");
    await user.clear(screen.getByRole("textbox", { name: "New branch name" }));
    await user.type(screen.getByRole("textbox", { name: "New branch name" }), "feature/new-worktree");
    await user.click(screen.getByRole("button", { name: "Preview creation" }));
    await waitFor(() => expect(worktreeCreatePreview).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-1",
      repositoryPath: "/workspace/repository",
      mode: "new-branch",
      targetPath: "/workspace/repository-new-worktree",
      newBranch: "feature/new-worktree",
      startPoint: "main",
    })));
    expect(await screen.findByText("Creation preview")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create worktree" }));
    await waitFor(() => expect(worktreeCreate).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-1",
      mode: "new-branch",
      targetPath: "/workspace/repository-new-worktree",
    })));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    expect(onSetOperationMode).not.toHaveBeenCalled();
  });

  it("explains safe-write requirement before creating a worktree", async () => {
    worktreeDetails.mockResolvedValue({ ok: true, data: { worktree: main, dirty: false, changes: 0, status: null } });
    worktreeCreatePreview.mockResolvedValue({
      ok: true,
      data: {
        allowed: false,
        operation: { mode: "existing-branch", branch: "feature/demo", targetPath: "/workspace/repository-feature" },
        warnings: [],
        blockingReasons: ["Enable Safe Write before creating a worktree."],
      },
    });
    const user = userEvent.setup();
    const onSetOperationMode = vi.fn();
    render(
      <WorktreesView
        worktrees={[main]}
        repoPath="/workspace/repository"
        currentWorktreePath={main.path}
        currentBranch="main"
        currentHead={main.head}
        defaultBranch="main"
        branches={[{ name: "main", remote: false, current: true }]}
        operationMode="read-only"
        onSetOperationMode={onSetOperationMode}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create Worktree" }));
    await user.click(screen.getByRole("button", { name: "Enable Safe Write" }));
    expect(onSetOperationMode).toHaveBeenCalledWith("safe-write");
  });
});
