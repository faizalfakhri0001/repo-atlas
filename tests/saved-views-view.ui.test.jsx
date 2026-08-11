import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SavedViewToolbar, SavedViewsView } from "@/components/saved-views-view";

const view = {
  id: "view-release",
  name: "Release review",
  viewType: "compare",
  configVersion: 1,
  config: { base: "missing-base", head: "main" },
  pinned: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
  lastOpenedAt: null,
};

describe("Saved Views UI", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("lists saved views, reports unavailable refs, and manages a view", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onRename = vi.fn();
    const onDuplicate = vi.fn();
    const onTogglePin = vi.fn();
    const onDelete = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <SavedViewsView
        savedViews={[view]}
        data={{ repository: { currentBranch: "main" }, branches: [{ name: "main" }], tags: [] }}
        onOpen={onOpen}
        onRename={onRename}
        onDuplicate={onDuplicate}
        onTogglePin={onTogglePin}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByRole("heading", { name: "Saved Views" })).toBeInTheDocument();
    expect(screen.getByText(/Needs attention: unavailable reference/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpen).toHaveBeenCalledWith(view);
    await user.click(screen.getByRole("button", { name: "Rename Release review" }));
    expect(onRename).toHaveBeenCalledWith(view);
    await user.click(screen.getByRole("button", { name: "Duplicate Release review" }));
    expect(onDuplicate).toHaveBeenCalledWith(view);
    await user.click(screen.getByRole("button", { name: "Unpin Release review" }));
    expect(onTogglePin).toHaveBeenCalledWith(view);
    await user.click(screen.getByRole("button", { name: "Delete Release review" }));
    expect(onDelete).toHaveBeenCalledWith(view);
  });

  it("exposes save, save-as, and revert actions for a modified view", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onSaveAs = vi.fn();
    const onRevert = vi.fn();
    render(
      <SavedViewToolbar
        currentView={{ viewType: "commits", config: { search: "release" } }}
        activeSavedView={view}
        modified
        onSave={onSave}
        onSaveAs={onSaveAs}
        onRevert={onRevert}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Save Changes/ }));
    await user.click(screen.getByRole("button", { name: /Save As New/ }));
    await user.click(screen.getByRole("button", { name: /Revert/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSaveAs).toHaveBeenCalledTimes(1);
    expect(onRevert).toHaveBeenCalledTimes(1);
  });
});
