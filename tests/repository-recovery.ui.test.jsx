import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RepositoryRecovery } from "@/app/RepositoryRecovery";

describe("RepositoryRecovery", () => {
  it("offers locate and remove actions for a missing repository", async () => {
    const user = userEvent.setup();
    const onLocate = vi.fn();
    const onRemove = vi.fn();
    render(<RepositoryRecovery repositoryPath="/workspace/missing" onLocate={onLocate} onRemove={onRemove} />);

    expect(screen.getByRole("heading", { name: "Repository not found" })).toBeInTheDocument();
    expect(screen.getByText("/workspace/missing")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Locate repository" }));
    await user.click(screen.getByRole("button", { name: "Remove from Recent" }));

    expect(onLocate).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
