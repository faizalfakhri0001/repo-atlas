import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "@/features/command-palette/CommandPalette";
import { createCommandRegistry } from "@/features/command-palette/command-registry";
import { useCommandPalette } from "@/features/command-palette/use-command-palette";
import { useCommandPaletteShortcuts } from "@/features/command-palette/command-shortcuts";

const commands = createCommandRegistry([
  {
    id: "navigation.files",
    label: "Open Files",
    category: "Navigation",
    keywords: ["explorer"],
    shortcut: ["mod", "1"],
    run: ({ navigate }) => navigate("files"),
  },
  {
    id: "repository.refresh",
    label: "Refresh Repository",
    category: "Repository",
    shortcut: ["mod", "r"],
    run: ({ refresh }) => refresh(),
  },
  {
    id: "disabled.action",
    label: "Disabled Action",
    category: "Repository",
    enabled: ({ enabled }) => enabled,
    run: ({ refresh }) => refresh(),
  },
]);

function PaletteHarness({ enabled = true, onNavigate = vi.fn(), onRefresh = vi.fn() }) {
  const context = useMemo(
    () => ({ enabled, navigate: onNavigate, refresh: onRefresh }),
    [enabled, onNavigate, onRefresh],
  );
  const palette = useCommandPalette({ commands, context });
  useCommandPaletteShortcuts({
    commands,
    context,
    onOpenPalette: palette.openPalette,
    onExecute: palette.executeCommand,
    open: palette.open,
  });

  return (
    <>
      <button type="button" onClick={palette.openPalette}>Launch palette</button>
      <CommandPalette
        open={palette.open}
        onOpenChange={palette.handleOpenChange}
        query={palette.query}
        onQueryChange={palette.updateQuery}
        commands={palette.results}
        selectedIndex={palette.selectedIndex}
        onSelectedIndexChange={palette.setSelectedIndex}
        onExecute={palette.executeCommand}
        isCommandEnabled={palette.isCommandEnabled}
        executingId={palette.executingId}
        error={palette.error}
      />
    </>
  );
}

describe("CommandPalette", () => {
  afterEach(() => cleanup());

  it("opens with focus, searches, executes a command, and restores focus", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<PaletteHarness onNavigate={onNavigate} />);
    const trigger = screen.getByRole("button", { name: "Launch palette" });

    await user.click(trigger);
    const input = await screen.findByRole("textbox", { name: "Command palette input" });
    await waitFor(() => expect(input).toHaveFocus());
    await user.type(input, "files");
    expect(screen.getByRole("option", { name: /Open Files/ })).toBeInTheDocument();

    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onNavigate).toHaveBeenCalledWith("files");
    expect(trigger).toHaveFocus();
  });

  it("keeps disabled commands visible but not executable", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(<PaletteHarness enabled={false} onRefresh={onRefresh} />);
    await user.click(screen.getByRole("button", { name: "Launch palette" }));

    const disabled = await screen.findByRole("option", { name: /Disabled Action/ });
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveAttribute("aria-disabled", "true");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("opens from Cmd/Ctrl+K and executes registered shortcuts", async () => {
    const onNavigate = vi.fn();
    render(<PaletteHarness onNavigate={onNavigate} />);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    const input = await screen.findByRole("textbox", { name: "Command palette input" });
    expect(input).toHaveFocus();
    await userEvent.setup().keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", metaKey: true, bubbles: true }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("files"));
  });
});
