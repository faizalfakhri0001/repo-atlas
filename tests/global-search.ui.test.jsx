import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalSearch } from "@/features/search/GlobalSearch";

const { repositorySearch } = vi.hoisted(() => ({ repositorySearch: vi.fn() }));

vi.mock("@/lib/api", () => ({ api: { repositorySearch } }));

const response = (results) => ({ ok: true, data: { results, durationMs: 4 } });

describe("GlobalSearch", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("debounces, filters by category, and opens a result with Enter", async () => {
    repositorySearch.mockResolvedValueOnce(response([
      { type: "file", path: "src/auth/login.js", name: "login.js", extension: "js", tracked: true, score: 1000 },
      { type: "commit", hash: "a".repeat(40), shortHash: "aaaaaaaa", subject: "Add login flow", author: "Ada", score: 900 },
    ]));
    const onOpenResult = vi.fn();
    const user = userEvent.setup();
    render(<GlobalSearch open onOpenChange={vi.fn()} repositoryPath="/repo" revision={{ head: "a".repeat(40) }} onOpenResult={onOpenResult} />);

    const input = screen.getByRole("textbox", { name: "Search repository" });
    await user.type(input, "login");
    expect(await screen.findByRole("option", { name: /src\/auth\/login\.js/ })).toBeInTheDocument();
    expect(repositorySearch).toHaveBeenCalledWith(expect.objectContaining({ query: "login", limit: 100 }));

    await user.click(screen.getByRole("tab", { name: "Commits" }));
    expect(await screen.findByRole("option", { name: /Add login flow/ })).toBeInTheDocument();
    await user.click(input);
    await user.keyboard("{Enter}");
    expect(onOpenResult).toHaveBeenCalledWith(expect.objectContaining({ type: "commit", subject: "Add login flow" }));
  });

  it("does not let a slow previous request overwrite the newest query", async () => {
    const pending = new Map();
    repositorySearch.mockImplementation(({ query }) => new Promise((resolve) => pending.set(query, resolve)));
    const user = userEvent.setup();
    render(<GlobalSearch open onOpenChange={vi.fn()} repositoryPath="/repo" revision={{ head: "b".repeat(40) }} />);
    const input = screen.getByRole("textbox", { name: "Search repository" });

    await user.type(input, "old");
    await waitFor(() => expect(pending.has("old")).toBe(true), { timeout: 1000 });
    await user.clear(input);
    await user.type(input, "new");
    await waitFor(() => expect(pending.has("new")).toBe(true), { timeout: 1000 });

    pending.get("new")?.(response([{ type: "file", path: "new-result.js", name: "new-result.js", score: 800 }]));
    expect(await screen.findByRole("option", { name: /new-result\.js/ })).toBeInTheDocument();
    pending.get("old")?.(response([{ type: "file", path: "old-result.js", name: "old-result.js", score: 900 }]));
    await waitFor(() => expect(screen.queryByRole("option", { name: /old-result\.js/ })).not.toBeInTheDocument());
  });
});
