import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { api } from "@/lib/api";

const report = {
  range: "all",
  metric: "commits",
  timeZone: "UTC",
  timezonePolicy: "user-local calendar day",
  authors: [{ key: "email:ada@example.test", name: "Ada", email: "ada@example.test", commits: 1 }],
  scope: { processedCommits: 3, sourceTruncated: true, rangeTruncated: false },
  stats: {
    activeDays: 2,
    totalCommits: 2,
    totalAdditions: 8,
    totalDeletions: 2,
    totalChurn: 10,
    avgCommitsPerActiveDay: 1,
    peakDay: { date: "2026-08-02", value: 1 },
    currentActiveStreak: 1,
    longestInactiveStreak: 1,
  },
  buckets: [
    { date: "2026-08-01", commits: 0, additions: 0, deletions: 0, churn: 0, authors: 0, level: 0, entries: [] },
    { date: "2026-08-02", commits: 1, additions: 5, deletions: 1, churn: 6, authors: 1, level: 3, entries: [{ hash: "a".repeat(40), shortHash: "aaaaaaaa", subject: "Add payments", author: { name: "Ada", email: "ada@example.test" } }] },
    { date: "2026-08-03", commits: 0, additions: 0, deletions: 0, churn: 0, authors: 0, level: 0, entries: [] },
    { date: "2026-08-04", commits: 1, additions: 3, deletions: 1, churn: 4, authors: 1, level: 2, entries: [{ hash: "b".repeat(40), shortHash: "bbbbbbbb", subject: "Add orders", author: { name: "Ada", email: "ada@example.test" } }] },
  ],
};

describe("ActivityHeatmap", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders quantized activity, bounded scope, filters, and day commit details", async () => {
    vi.spyOn(api, "activity").mockResolvedValue({ ok: true, data: report });
    const onOpenCommit = vi.fn();
    const onConfigChange = vi.fn();
    const user = userEvent.setup();

    render(<ActivityHeatmap repoPath="/workspace/repository" revision="scan-1" initialConfig={{ range: "all", metric: "commits" }} onOpenCommit={onOpenCommit} onConfigChange={onConfigChange} />);

    expect(await screen.findByText("Repository activity")).toBeInTheDocument();
    expect(screen.getByText(/This repository activity report is bounded/)).toBeInTheDocument();
    const activeDay = screen.getByRole("button", { name: /1 commit · 5 additions · 1 deletion/ });
    expect(activeDay).toHaveAttribute("title", expect.stringContaining("contributor"));

    await user.click(activeDay);
    expect(screen.getByText("Add payments")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Commit" }));
    expect(onOpenCommit).toHaveBeenCalledWith("a".repeat(40));

    await user.selectOptions(screen.getByRole("combobox", { name: "Activity metric" }), "churn");
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ metric: "churn" }));
    expect(api.activity).toHaveBeenLastCalledWith(expect.objectContaining({ metric: "churn", repositoryPath: "/workspace/repository" }));

    await user.type(screen.getByRole("textbox", { name: "Activity path prefix" }), "src/api");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(onConfigChange).toHaveBeenLastCalledWith(expect.objectContaining({ pathPrefix: "src/api" }));
  });
});
