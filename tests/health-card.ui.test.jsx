import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HealthSummaryCard } from "@/components/health-card";
import { api } from "@/lib/api";

const report = {
  score: 94,
  grade: "healthy",
  categories: {
    workingTree: { status: "healthy", signalCount: 0 },
    branches: { status: "healthy", signalCount: 0 },
    repository: { status: "healthy", signalCount: 0 },
    activity: { status: "healthy", signalCount: 0 },
    ownership: { status: "healthy", signalCount: 0 },
  },
  scope: { sourceTruncated: false },
};

describe("HealthSummaryCard", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps Overview non-blocking while health is loading and opens details after resolution", async () => {
    let resolve;
    vi.spyOn(api, "repositoryHealth").mockReturnValue(new Promise((done) => { resolve = done; }));
    const onOpenDetails = vi.fn();
    const user = userEvent.setup();
    render(<HealthSummaryCard repoPath="/workspace/repository" revision="scan-1" onOpenDetails={onOpenDetails} />);
    expect(screen.getByText(/Overview remains available/)).toBeInTheDocument();
    resolve({ ok: true, data: report });
    expect(await screen.findByText("94")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /View health details/ }));
    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });
});
