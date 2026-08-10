import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HotspotsView } from "@/components/hotspots-view";
import { api } from "@/lib/api";

const report = {
  scope: { processedCommits: 24, eligibleFiles: 2, truncated: true, sourceTruncated: true },
  filters: { excludedGeneratedFiles: 3 },
  files: [
    {
      path: "src/app.js",
      hotspotBand: "High",
      hotspotScore: 0.91,
      commitCount: 12,
      churn: 180,
      additions: 120,
      deletions: 60,
      authorCount: 3,
      lastChangedAt: "2026-08-10T00:00:00.000Z",
    },
    {
      path: "docs/readme.md",
      hotspotBand: "Low",
      hotspotScore: 0.2,
      commitCount: 2,
      churn: 8,
      additions: 6,
      deletions: 2,
      authorCount: 1,
      lastChangedAt: "2026-08-01T00:00:00.000Z",
    },
  ],
};

describe("HotspotsView", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows bounded hotspot metrics and opens File History for a file", async () => {
    vi.spyOn(api, "hotspots").mockResolvedValue({ ok: true, data: report });
    const onOpenFileHistory = vi.fn();
    const user = userEvent.setup();

    render(<HotspotsView repoPath="/workspace/repository" onOpenFileHistory={onOpenFileHistory} />);

    expect(await screen.findByText("Hotspots")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("180")).toBeInTheDocument();
    expect(screen.getByText("Bounded analysis · history truncated")).toBeInTheDocument();
    expect(screen.getByText("3 generated excluded")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "src/app.js" }));
    expect(onOpenFileHistory).toHaveBeenCalledWith("src/app.js");

    await user.click(screen.getByRole("checkbox", { name: "Include generated and lock files" }));
    expect(api.hotspots).toHaveBeenLastCalledWith({ repositoryPath: "/workspace/repository", limit: 100, includeGenerated: true, pathPrefix: "" });
  });

  it("applies extension and path filters to the returned rows", async () => {
    vi.spyOn(api, "hotspots").mockResolvedValue({ ok: true, data: report });
    const user = userEvent.setup();
    render(<HotspotsView repoPath="/workspace/repository" />);

    await screen.findByRole("table");
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter hotspots by extension" }), "md");
    expect(screen.queryByRole("button", { name: "src/app.js" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "docs/readme.md" })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Hotspot path prefix" }), "src");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(api.hotspots).toHaveBeenLastCalledWith({ repositoryPath: "/workspace/repository", limit: 100, includeGenerated: false, pathPrefix: "src" });
  });
});
