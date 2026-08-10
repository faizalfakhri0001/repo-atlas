import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BranchesView } from "@/components/branches-view";
import { api } from "@/lib/api";
import { TooltipProvider } from "@/components/ui/tooltip";

const hash = (letter) => letter.repeat(40);

const report = {
  defaultBranch: "main",
  defaultBranchSource: "remote",
  currentBranch: "main",
  scope: { totalLocal: 5, analyzedLocal: 5, omittedLocal: 0, limit: 500, concurrency: 4, truncated: false },
  branches: [
    {
      ref: "refs/heads/main",
      name: "main",
      hash: hash("a"),
      shortHash: hash("a").slice(0, 8),
      current: true,
      remote: false,
      upstream: "origin/main",
      aheadOfUpstream: 0,
      behindUpstream: 0,
      goneUpstream: false,
      defaultBranch: "main",
      aheadOfDefault: 0,
      behindDefault: 0,
      mergeBase: hash("a"),
      mergedIntoDefault: false,
      lastCommitAt: "2026-08-10T00:00:00.000Z",
      ageDays: 0,
      status: "current",
      analyzed: true,
      author: "Repo Atlas",
      subject: "Main commit",
    },
    {
      ref: "refs/heads/feature/ahead",
      name: "feature/ahead",
      hash: hash("b"),
      shortHash: hash("b").slice(0, 8),
      current: false,
      remote: false,
      upstream: "origin/feature/ahead",
      aheadOfUpstream: 1,
      behindUpstream: 0,
      goneUpstream: false,
      defaultBranch: "main",
      aheadOfDefault: 2,
      behindDefault: 0,
      mergeBase: hash("a"),
      mergedIntoDefault: false,
      lastCommitAt: "2026-08-09T00:00:00.000Z",
      ageDays: 1,
      status: "ahead",
      analyzed: true,
      author: "Repo Atlas",
      subject: "Ahead change",
    },
    {
      ref: "refs/heads/feature/diverged",
      name: "feature/diverged",
      hash: hash("c"),
      shortHash: hash("c").slice(0, 8),
      current: false,
      remote: false,
      upstream: "origin/feature/diverged",
      aheadOfUpstream: 0,
      behindUpstream: 0,
      goneUpstream: false,
      defaultBranch: "main",
      aheadOfDefault: 4,
      behindDefault: 2,
      mergeBase: hash("a"),
      mergedIntoDefault: false,
      lastCommitAt: "2026-08-08T00:00:00.000Z",
      ageDays: 2,
      status: "diverged",
      analyzed: true,
      author: "Repo Atlas",
      subject: "Diverged change",
    },
    {
      ref: "refs/heads/feature/merged",
      name: "feature/merged",
      hash: hash("d"),
      shortHash: hash("d").slice(0, 8),
      current: false,
      remote: false,
      upstream: null,
      aheadOfUpstream: 0,
      behindUpstream: 0,
      goneUpstream: false,
      defaultBranch: "main",
      aheadOfDefault: 0,
      behindDefault: 0,
      mergeBase: hash("d"),
      mergedIntoDefault: true,
      lastCommitAt: "2026-08-07T00:00:00.000Z",
      ageDays: 3,
      status: "merged",
      analyzed: true,
      author: "Repo Atlas",
      subject: "Merged change",
    },
    {
      ref: "refs/remotes/origin/main",
      name: "origin/main",
      hash: hash("a"),
      shortHash: hash("a").slice(0, 8),
      current: false,
      remote: true,
      upstream: null,
      aheadOfUpstream: 0,
      behindUpstream: 0,
      goneUpstream: false,
      defaultBranch: "main",
      aheadOfDefault: null,
      behindDefault: null,
      mergeBase: null,
      mergedIntoDefault: false,
      lastCommitAt: "2026-08-10T00:00:00.000Z",
      ageDays: 0,
      status: "healthy",
      analyzed: false,
      author: "Repo Atlas",
      subject: "Remote main",
    },
  ],
};

describe("BranchesView", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads branch intelligence and filters, sorts, and opens divergence details", async () => {
    vi.spyOn(api, "branchIntelligence").mockResolvedValue({ ok: true, data: report });
    const onCompareWithDefault = vi.fn();
    const onShowInGraph = vi.fn();
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <BranchesView
          repoPath="/workspace/repository"
          branches={[]}
          currentBranch="main"
          defaultBranch="main"
          onCompareWithDefault={onCompareWithDefault}
          onShowInGraph={onShowInGraph}
        />
      </TooltipProvider>,
    );

    expect(await screen.findByText("feature/diverged")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Diverged/ }));
    expect(screen.getByText("feature/diverged")).toBeInTheDocument();
    expect(screen.queryByText("feature/ahead")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /All/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort branches" }), "ahead");
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("feature/diverged");

    await user.click(screen.getByRole("button", { name: "Compare feature/diverged with default main" }));
    expect(onCompareWithDefault).toHaveBeenCalledWith("main", "feature/diverged");
    await user.click(screen.getByRole("button", { name: "Open commits for feature/diverged" }));
    expect(onShowInGraph).toHaveBeenCalledWith("feature/diverged");

    await user.click(screen.getByRole("tab", { name: "Divergence" }));
    expect(screen.getByText(/Divergence from/)).toBeInTheDocument();
    expect(screen.getByTitle(/feature\/diverged: 4 ahead/)).toBeInTheDocument();
  });
});
