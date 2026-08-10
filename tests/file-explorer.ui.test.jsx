import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileExplorer } from "@/components/file-explorer";

const { listRepositoryFiles, readRepositoryFile } = vi.hoisted(() => ({
  listRepositoryFiles: vi.fn(),
  readRepositoryFile: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { listRepositoryFiles, readRepositoryFile },
}));

describe("FileExplorer", () => {
  it("loads a repository tree and expands directories", async () => {
    listRepositoryFiles.mockResolvedValueOnce({
      ok: true,
      data: [
        { path: "src/app.js", name: "app.js", extension: "js", tracked: true },
        { path: "src/lib/api.js", name: "api.js", extension: "js", tracked: true },
        { path: "README.md", name: "README.md", extension: "md", tracked: true },
      ],
    });
    readRepositoryFile.mockResolvedValueOnce({
      ok: true,
      data: { path: "src/app.js", text: "const answer = 42;\n", binary: false, truncated: false, size: 20, language: "javascript" },
    });
    const user = userEvent.setup();
    render(
      <FileExplorer
        repoPath="/workspace/repository"
        status={{ files: [{ kind: "changed", index: ".", worktree: "M", path: "src/app.js" }] }}
      />,
    );

    expect(await screen.findByRole("tree", { name: "Repository files" })).toBeInTheDocument();
    expect(await screen.findByRole("treeitem", { name: "src" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("treeitem", { name: "app.js" })).toBeInTheDocument();
    expect(screen.getByTitle("modified")).toBeInTheDocument();

    await user.click(screen.getByRole("treeitem", { name: "app.js" }));
    expect(await screen.findByText("const answer = 42;")).toBeInTheDocument();
    expect(screen.getByText("javascript")).toBeInTheDocument();
    expect(readRepositoryFile).toHaveBeenCalledWith({ repositoryPath: "/workspace/repository", path: "src/app.js" });

    await user.click(screen.getByRole("treeitem", { name: "src" }));
    expect(screen.queryByRole("treeitem", { name: "app.js" })).not.toBeInTheDocument();
    const filter = screen.getByRole("textbox", { name: "Filter files" });
    await user.type(filter, "README");
    expect(screen.getByRole("treeitem", { name: "README.md" })).toBeInTheDocument();
    expect(screen.queryByRole("treeitem", { name: "src" })).not.toBeInTheDocument();
    expect(listRepositoryFiles).toHaveBeenCalledWith({ repositoryPath: "/workspace/repository" });
  });
});
