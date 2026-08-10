import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilePreview } from "@/components/file-preview";

const { readFileAtRevision, readRepositoryFile } = vi.hoisted(() => ({
  readFileAtRevision: vi.fn(),
  readRepositoryFile: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: { readFileAtRevision, readRepositoryFile } }));

describe("FilePreview revision mode", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("reads and labels a file at the selected commit", async () => {
    const hash = "d".repeat(40);
    readFileAtRevision.mockResolvedValueOnce({
      ok: true,
      data: { hash, path: "src/app.js", text: "export const oldValue = true;\n", binary: false, truncated: false, size: 31, language: "JavaScript" },
    });
    render(<FilePreview repoPath="/workspace/repository" node={{ path: "src/app.js", type: "file" }} revision={hash} />);

    expect(await screen.findByText("export const oldValue = true;")).toBeInTheDocument();
    expect(screen.getByText("At dddddddd")).toBeInTheDocument();
    expect(readFileAtRevision).toHaveBeenCalledWith({ repositoryPath: "/workspace/repository", hash, path: "src/app.js" });
    expect(readRepositoryFile).not.toHaveBeenCalled();
  });
});
