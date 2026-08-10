import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HealthView } from "@/components/health-view";
import { api } from "@/lib/api";

const report = {
  score: 82,
  grade: "attention",
  signals: [
    { id: "stale-local-branches", severity: "medium", category: "branches", title: "3 stale local branches", description: "No commits were recorded recently.", metric: 3, penalty: 3, action: { type: "navigate", payload: { view: "branches", filter: "stale" } } },
    { id: "concentrated-hotspots", severity: "medium", category: "ownership", title: "2 high-churn files have concentrated contribution", description: "Review ownership context.", metric: 2, penalty: 4, action: { type: "navigate", payload: { view: "hotspots", filter: "concentrated" } }, relatedActions: [{ type: "navigate", payload: { view: "ownership" } }] },
    { id: "working-tree-dirty", severity: "info", category: "workingTree", title: "Working tree has uncommitted changes", description: "Review Workspace.", metric: 1, penalty: 0, action: { type: "navigate", payload: { view: "workspace" } } },
  ],
  categories: {
    workingTree: { score: 100, penalty: 0, status: "healthy", signalCount: 1 },
    branches: { score: 97, penalty: 3, status: "attention", signalCount: 1 },
    repository: { score: 100, penalty: 0, status: "healthy", signalCount: 0 },
    activity: { score: 100, penalty: 0, status: "healthy", signalCount: 0 },
    ownership: { score: 96, penalty: 4, status: "attention", signalCount: 1 },
  },
  facts: { processedCommits: 20, totalCommits: 20, localBranchCount: 5, staleBranchCount: 3, behindBranchCount: 0, goneBranchCount: 0, trackedFileCount: 12, largeFileCount: 0, highActivityFileCount: 2, concentratedHotspotCount: 2, conflictedFileCount: 0, dirtyFileCount: 1, currentBranch: "main", defaultBranch: "main", lastCommitAt: "2026-08-10T00:00:00.000Z", ownershipConcentrationThreshold: 0.8 },
  scope: { sourceTruncated: true },
};

describe("HealthView", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows score, raw facts, bounded scope, severity filtering, and signal navigation", async () => {
    vi.spyOn(api, "repositoryHealth").mockResolvedValue({ ok: true, data: report });
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<HealthView repoPath="/workspace/repository" onNavigate={onNavigate} />);

    expect(await screen.findByText("Repository Health")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText(/This report is bounded/)).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter health signals" }), "medium");
    expect(screen.queryByText("Working tree has uncommitted changes")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View Branches" }));
    expect(onNavigate).toHaveBeenCalledWith("branches", { filter: "stale" });
    await user.click(screen.getByRole("button", { name: "Open Ownership" }));
    expect(onNavigate).toHaveBeenCalledWith("ownership", {});
  });
});
