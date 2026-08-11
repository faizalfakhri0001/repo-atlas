import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorktreesView } from "@/components/worktrees-view";

const { worktreeDetails, revealRepository, chooseWorktreeLocation, worktreeCreatePreview, worktreeCreate, worktreeRemovePreview, worktreeRemove, worktreePrunePreview, worktreePrune } = vi.hoisted(() => ({
  worktreeDetails: vi.fn(),
  revealRepository: vi.fn(),
  chooseWorktreeLocation: vi.fn(),
  worktreeCreatePreview: vi.fn(),
  worktreeCreate: vi.fn(),
  worktreeRemovePreview: vi.fn(),
  worktreeRemove: vi.fn(),
  worktreePrunePreview: vi.fn(),
  worktreePrune: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: { worktreeDetails, revealRepository, chooseWorktreeLocation, worktreeCreatePreview, worktreeCreate, worktreeRemovePreview, worktreeRemove, worktreePrunePreview, worktreePrune } }));

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
    worktreeCreate.mockResolvedValue({ ok: true, data: { transactionId: "session-1:1", operation: { targetPath: "/workspace/repository-new-worktree" } } });
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const onSetOperationMode = vi.fn();
    const onOperationTransaction = vi.fn();
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
        onOperationTransaction={onOperationTransaction}
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
    expect(onOperationTransaction).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "session-1:1" }));
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

  it("previews and confirms removing a clean linked worktree", async () => {
    worktreeDetails.mockImplementation(async ({ path }) => ({
      ok: true,
      data: {
        worktree: path === main.path ? main : linked,
        dirty: false,
        changes: 0,
        status: { branch: path === main.path ? "main" : "fix/timezone", oid: path === main.path ? main.head : linked.head, files: [] },
      },
    }));
    worktreeRemovePreview.mockResolvedValue({
      ok: true,
      data: {
        allowed: true,
        main: false,
        dirty: false,
        changes: 0,
        locked: false,
        operation: { mode: "remove", targetPath: linked.path },
        warnings: [],
        blockingReasons: [],
      },
    });
    worktreeRemove.mockResolvedValue({ ok: true, data: { transactionId: "session-1:2", removedPath: linked.path, worktrees: [main] } });
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const onOperationTransaction = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <WorktreesView
        worktrees={[main, linked]}
        repoPath="/workspace/repository"
        currentWorktreePath={main.path}
        currentBranch="main"
        defaultBranch="main"
        sessionId="session-1"
        operationMode="safe-write"
        onOperationTransaction={onOperationTransaction}
        onRefresh={onRefresh}
      />,
    );

    await user.click(screen.getByRole("button", { name: /repository-hotfix/ }));
    await user.click(await screen.findByRole("button", { name: "Remove worktree" }));
    await waitFor(() => expect(worktreeRemovePreview).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-1",
      repositoryPath: "/workspace/repository",
      path: linked.path,
      currentWorktreePath: main.path,
    })));
    expect(await screen.findByText("Remove worktree preview")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm remove" }));
    await waitFor(() => expect(worktreeRemove).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-1",
      repositoryPath: "/workspace/repository",
      path: linked.path,
      currentWorktreePath: main.path,
    })));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onOperationTransaction).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "session-1:2" }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    confirmSpy.mockRestore();
  });

  it("shows prune preview guards and safe-write action", async () => {
    worktreeDetails.mockResolvedValue({ ok: true, data: { worktree: main, dirty: false, changes: 0, status: null } });
    worktreePrunePreview.mockResolvedValue({
      ok: true,
      data: {
        allowed: false,
        items: [{ path: "worktrees/stale", reason: "missing" }],
        warnings: [],
        blockingReasons: ["READ_ONLY_MODE — Enable Safe Write before pruning stale worktree metadata."],
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
        defaultBranch="main"
        operationMode="read-only"
        onSetOperationMode={onSetOperationMode}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Prune stale" }));
    await waitFor(() => expect(worktreePrunePreview).toHaveBeenCalledWith(expect.objectContaining({ repositoryPath: "/workspace/repository" })));
    expect(await screen.findByText("Prune worktree preview")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Enable Safe Write" }));
    expect(onSetOperationMode).toHaveBeenCalledWith("safe-write");
  });
});
