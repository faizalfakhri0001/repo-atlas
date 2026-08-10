import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OwnershipView } from "@/components/ownership-view";
import { api } from "@/lib/api";

const report = {
  period: "all",
  path: "",
  summary: {
    name: "Repository",
    totalCommits: 20,
    totalChurn: 200,
    primaryContributor: { name: "Ada", email: "ada@example.test", commitShare: 0.62, churnShare: 0.72, ownershipScore: 0.68 },
    top1Share: 0.68,
    concentrationLabel: "Moderately concentrated",
  },
  scope: { totalFiles: 12, processedCommits: 20, truncated: false },
  nodes: [
    {
      path: "src/components",
      name: "components",
      type: "directory",
      fileCount: 4,
      totalCommits: 12,
      totalChurn: 160,
      primaryContributor: { name: "Ada", email: "ada@example.test", commitShare: 0.62, churnShare: 0.72, ownershipScore: 0.68 },
      top1Share: 0.68,
      concentrationLabel: "Moderately concentrated",
      lastChangedAt: "2026-08-10T00:00:00.000Z",
      topContributors: [{ key: "email:ada@example.test", name: "Ada", commitShare: 0.62, churnShare: 0.72, ownershipScore: 0.68, commits: 8, churn: 115 }],
    },
    {
      path: "README.md",
      name: "README.md",
      type: "file",
      fileCount: 1,
      totalCommits: 2,
      totalChurn: 8,
      primaryContributor: { name: "Grace", email: "grace@example.test", commitShare: 1, churnShare: 1, ownershipScore: 1 },
      top1Share: 1,
      concentrationLabel: "Highly concentrated",
      lastChangedAt: "2026-08-09T00:00:00.000Z",
      topContributors: [{ key: "email:grace@example.test", name: "Grace", commitShare: 1, churnShare: 1, ownershipScore: 1, commits: 2, churn: 8 }],
    },
  ],
};

describe("OwnershipView", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows directory ownership, raw shares, and contributor detail", async () => {
    vi.spyOn(api, "ownership").mockResolvedValue({ ok: true, data: report });
    const user = userEvent.setup();
    render(<OwnershipView repoPath="/workspace/repository" />);

    expect(await screen.findByText("Ownership")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "src/components" })).toBeInTheDocument();
    expect(screen.getByText("62%")).toBeInTheDocument();
    expect(screen.getByText("Moderately concentrated · 68%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "README.md" }));
    expect(screen.getByText("Top contributors")).toBeInTheDocument();
    expect(screen.getAllByText("Grace").length).toBeGreaterThan(0);
  });

  it("requests the selected period and directory path", async () => {
    vi.spyOn(api, "ownership").mockResolvedValue({ ok: true, data: report });
    const user = userEvent.setup();
    render(<OwnershipView repoPath="/workspace/repository" />);

    await screen.findByRole("table");
    await user.selectOptions(screen.getByRole("combobox", { name: "Ownership period" }), "12m");
    expect(api.ownership).toHaveBeenLastCalledWith({ repositoryPath: "/workspace/repository", period: "12m", path: "", limit: 100 });

    await user.click(screen.getByRole("button", { name: "src/components" }));
    expect(api.ownership).toHaveBeenLastCalledWith({ repositoryPath: "/workspace/repository", period: "12m", path: "src/components", limit: 100 });
  });
});
