import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";

describe("UI testing setup", () => {
  it("renders an existing UI primitive and handles user input", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Open repository</Button>);

    const button = screen.getByRole("button", { name: "Open repository" });
    expect(button).toBeVisible();
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
