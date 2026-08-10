import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileExplorer } from "@/components/file-explorer";

const { listRepositoryFiles, readRepositoryFile } = vi.hoisted(() => ({
  listRepositoryFiles: vi.fn(),
  readRepositoryFile: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: { listRepositoryFiles, readRepositoryFile } }));

describe("keyboard navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listRepositoryFiles.mockResolvedValue({
      ok: true,
      data: [{ path: "src/app.js", name: "app.js", extension: "js", tracked: true }],
    });
    readRepositoryFile.mockResolvedValue({
      ok: true,
      data: { path: "src/app.js", text: "export const ready = true;\n", binary: false, truncated: false, size: 28, language: "JavaScript" },
    });
  });

  afterEach(() => cleanup());

  it("opens a file from the tree using only Tab, arrow, and Enter keys", async () => {
    const user = userEvent.setup();
    render(<FileExplorer repoPath="/workspace/repository" />);

    const filter = await screen.findByRole("textbox", { name: "Filter files" });
    const directory = await screen.findByRole("treeitem", { name: "src" });
    const file = screen.getByRole("treeitem", { name: "app.js" });

    await user.tab();
    expect(filter).toHaveFocus();
    await user.tab();
    expect(directory).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(file).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(await screen.findByText("export const ready = true;")).toBeInTheDocument();
    expect(readRepositoryFile).toHaveBeenCalledWith({ repositoryPath: "/workspace/repository", path: "src/app.js" });
  });
});
