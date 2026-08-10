import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RepositoryTabs } from "@/app/RepositoryTabs";

describe("RepositoryTabs", () => {
  it("activates an unopened session and identifies it as not loaded", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(
      <RepositoryTabs
        sessions={[
          {
            id: "/workspace/ready",
            name: "ready",
            path: "/workspace/ready",
            status: "ready",
            loading: false,
            snapshot: { repository: { dirty: false, currentBranch: "main" } },
          },
          { id: "/workspace/queued", name: "queued", path: "/workspace/queued", status: "created", loading: false, snapshot: null },
        ]}
        activeSessionId="/workspace/ready"
        onActivate={onActivate}
        onClose={vi.fn()}
        onOpen={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /queued/i }));

    expect(onActivate).toHaveBeenCalledWith("/workspace/queued");
    expect(screen.getByRole("tab", { name: /queued/i })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByLabelText("Not loaded")).toBeInTheDocument();
  });
});
