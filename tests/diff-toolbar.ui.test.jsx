import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DiffToolbar } from "@/features/diff/diff-toolbar";

describe("DiffToolbar", () => {
  it("switches mode and toggles wrapping and syntax highlighting", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    const onWrapChange = vi.fn();
    const onSyntaxHighlightChange = vi.fn();
    render(
      <DiffToolbar
        mode="unified"
        wrap={false}
        syntaxHighlight={true}
        totalLines={12}
        onModeChange={onModeChange}
        onWrapChange={onWrapChange}
        onSyntaxHighlightChange={onSyntaxHighlightChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Split/ }));
    await user.click(screen.getByRole("button", { name: /Wrap/ }));
    await user.click(screen.getByRole("button", { name: /Syntax/ }));

    expect(onModeChange).toHaveBeenCalledWith("split");
    expect(onWrapChange).toHaveBeenCalledWith(true);
    expect(onSyntaxHighlightChange).toHaveBeenCalledWith(false);
    expect(screen.getByText("12 lines")).toBeInTheDocument();
  });
});
