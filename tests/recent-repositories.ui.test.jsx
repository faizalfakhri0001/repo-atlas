import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RecentRepositories } from "@/app/RecentRepositories";

describe("RecentRepositories", () => {
  it("opens a repository and exposes metadata actions", async () => {
    const user = userEvent.setup();
    const onOpenRepository = vi.fn();
    const onPin = vi.fn();
    const onRemove = vi.fn();
    const onReveal = vi.fn();
    render(
      <RecentRepositories
        repositories={[{ path: "/workspace/repository", name: "repository", lastKnownBranch: "main", lastOpenedAt: Date.now(), pinned: false }]}
        onOpenRepository={onOpenRepository}
        onPin={onPin}
        onRemove={onRemove}
        onReveal={onReveal}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open repository" }));
    await user.click(screen.getByRole("button", { name: "Pin repository" }));
    await user.click(screen.getByRole("button", { name: "Reveal repository" }));
    await user.click(screen.getByRole("button", { name: "Remove repository from recent repositories" }));

    expect(onOpenRepository).toHaveBeenCalledWith("/workspace/repository");
    expect(onPin).toHaveBeenCalledWith("/workspace/repository", true);
    expect(onReveal).toHaveBeenCalledWith("/workspace/repository");
    expect(onRemove).toHaveBeenCalledWith("/workspace/repository");
  });
});
