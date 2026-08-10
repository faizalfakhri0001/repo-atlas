import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileExplorer } from "@/components/file-explorer";

const { listRepositoryFiles } = vi.hoisted(() => ({ listRepositoryFiles: vi.fn() }));

vi.mock("@/lib/api", () => ({
  api: { listRepositoryFiles },
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
    const user = userEvent.setup();
    render(<FileExplorer repoPath="/workspace/repository" />);

    expect(await screen.findByRole("tree", { name: "Repository files" })).toBeInTheDocument();
    expect(await screen.findByRole("treeitem", { name: "src" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("treeitem", { name: "app.js" })).toBeInTheDocument();

    await user.click(screen.getByRole("treeitem", { name: "src" }));
    expect(screen.queryByRole("treeitem", { name: "app.js" })).not.toBeInTheDocument();
    expect(listRepositoryFiles).toHaveBeenCalledWith({ repositoryPath: "/workspace/repository" });
  });
});
