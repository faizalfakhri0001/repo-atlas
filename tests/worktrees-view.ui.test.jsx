import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorktreesView } from "@/components/worktrees-view";

const { worktreeDetails, revealRepository } = vi.hoisted(() => ({
  worktreeDetails: vi.fn(),
  revealRepository: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: { worktreeDetails, revealRepository } }));

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
    render(<WorktreesView worktrees={[main, linked]} repoPath="/workspace/repository" currentWorktreePath={main.path} />);

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
  });
});
