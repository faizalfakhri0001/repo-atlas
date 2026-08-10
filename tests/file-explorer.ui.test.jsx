import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileExplorer } from "@/components/file-explorer";

const { listRepositoryFiles, readRepositoryFile, fileHistory } = vi.hoisted(() => ({
  listRepositoryFiles: vi.fn(),
  readRepositoryFile: vi.fn(),
  fileHistory: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { listRepositoryFiles, readRepositoryFile, fileHistory },
}));

function ExplorerHarness(props) {
  const [historyState, setHistoryState] = useState(null);
  return <FileExplorer {...props} historyState={historyState} onHistoryStateChange={setHistoryState} />;
}

describe("FileExplorer", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

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
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("treeitem", { name: "app.js" })).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(screen.queryByRole("treeitem", { name: "app.js" })).not.toBeInTheDocument();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", ctrlKey: true }));
    expect(filter).toHaveFocus();
    await user.type(filter, "README");
    expect(screen.getByRole("treeitem", { name: "README.md" })).toBeInTheDocument();
    expect(screen.queryByRole("treeitem", { name: "src" })).not.toBeInTheDocument();
    expect(listRepositoryFiles).toHaveBeenCalledWith({ repositoryPath: "/workspace/repository" });
  });

  it("shows a clear state for binary files", async () => {
    listRepositoryFiles.mockResolvedValueOnce({
      ok: true,
      data: [{ path: "assets/logo.bin", name: "logo.bin", extension: "bin", tracked: true }],
    });
    readRepositoryFile.mockResolvedValueOnce({
      ok: true,
      data: { path: "assets/logo.bin", text: null, binary: true, truncated: false, size: 2048, language: null },
    });
    const user = userEvent.setup();
    render(<ExplorerHarness repoPath="/workspace/repository" />);

    await user.click(await screen.findByRole("treeitem", { name: "logo.bin" }));
    expect(await screen.findByText("Binary file")).toBeInTheDocument();
    expect(screen.getAllByText("2.0 KB")).toHaveLength(2);
  });

  it("focuses the filter when a quick-open request arrives", async () => {
    listRepositoryFiles.mockResolvedValueOnce({ ok: true, data: [] });
    render(<FileExplorer repoPath="/workspace/repository" focusFilterRequest={1} />);

    const filter = await screen.findByRole("textbox", { name: "Filter files" });
    await vi.waitFor(() => expect(filter).toHaveFocus());
  });

  it("labels a large file preview as truncated", async () => {
    listRepositoryFiles.mockResolvedValueOnce({
      ok: true,
      data: [{ path: "logs/output.txt", name: "output.txt", extension: "txt", tracked: true }],
    });
    readRepositoryFile.mockResolvedValueOnce({
      ok: true,
      data: {
        path: "logs/output.txt",
        text: "first chunk",
        binary: false,
        truncated: true,
        size: 2 * 1024 * 1024,
        language: null,
      },
    });
    const user = userEvent.setup();
    render(<FileExplorer repoPath="/workspace/repository" />);

    await user.click(await screen.findByRole("treeitem", { name: "output.txt" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Preview truncated at 1 MB.");
    expect(screen.getByText("first chunk")).toBeInTheDocument();
  });

  it("opens file history from the selected file preview", async () => {
    listRepositoryFiles.mockResolvedValueOnce({
      ok: true,
      data: [{ path: "src/app.js", name: "app.js", extension: "js", tracked: true }],
    });
    readRepositoryFile.mockResolvedValueOnce({
      ok: true,
      data: { path: "src/app.js", text: "const answer = 42;\n", binary: false, truncated: false, size: 20, language: "JavaScript" },
    });
    fileHistory.mockResolvedValue({
      ok: true,
      data: {
        currentPath: "src/app.js",
        entries: [{
          hash: "a".repeat(40),
          shortHash: "aaaaaaaa",
          parentHash: null,
          subject: "Add app",
          author: { name: "Repo Atlas Test", email: "repo-atlas@example.test" },
          date: "2026-08-10T10:00:00+07:00",
          status: "A",
          path: "src/app.js",
        }],
        hasMore: false,
      },
    });
    const user = userEvent.setup();
    render(<ExplorerHarness repoPath="/workspace/repository" />);

    await user.click(await screen.findByRole("treeitem", { name: "app.js" }));
    await screen.findByText("const answer = 42;");
    await user.click(screen.getByRole("button", { name: "History" }));

    expect(await screen.findByText("Add app")).toBeInTheDocument();
    expect(fileHistory).toHaveBeenCalledWith({ repositoryPath: "/workspace/repository", path: "src/app.js", limit: 200, skip: 0 });
  });
});
