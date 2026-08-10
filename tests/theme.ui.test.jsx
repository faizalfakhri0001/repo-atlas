import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "@/App";

describe("application theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
  });

  afterEach(() => cleanup());

  it("switches between dark and light themes and persists the choice", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText("Demo data")).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    const toggle = screen.getByRole("button", { name: "Toggle theme" });

    await user.click(toggle);
    await waitFor(() => expect(document.documentElement).not.toHaveClass("dark"));
    expect(window.localStorage.getItem("repo-atlas-theme")).toBe("light");

    await user.click(toggle);
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(window.localStorage.getItem("repo-atlas-theme")).toBe("dark");
  });
});
