import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileHistory } from "@/components/file-history";

const { fileHistory, fileDiff } = vi.hoisted(() => ({
  fileHistory: vi.fn(),
  fileDiff: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { fileHistory, fileDiff },
}));

const entries = [
  {
    hash: "a".repeat(40),
    shortHash: "aaaaaaaa",
    parentHash: "b".repeat(40),
    subject: "Update account",
    author: { name: "Ada Lovelace", email: "ada@example.com" },
    date: "2026-08-10T10:00:00+07:00",
    status: "M",
    path: "src/domain/account.js",
  },
  {
    hash: "b".repeat(40),
    shortHash: "bbbbbbbb",
    parentHash: "c".repeat(40),
    subject: "Rename user module",
    author: { name: "Grace Hopper", email: "grace@example.com" },
    date: "2026-08-09T10:00:00+07:00",
    status: "R",
    path: "src/domain/account.js",
    oldPath: "src/user.js",
  },
];

function HistoryHarness() {
  const [state, setState] = useState({
    selectedPath: "src/domain/account.js",
    selectedHash: null,
    entries: [],
    hasMore: true,
    loaded: false,
    scrollTop: 0,
  });
  return (
    <FileHistory
      repoPath="/workspace/repository"
      node={{ path: "src/domain/account.js", name: "account.js", type: "file" }}
      state={state}
      onStateChange={setState}
      onClose={vi.fn()}
    />
  );
}

describe("FileHistory", () => {
  afterEach(() => cleanup());

  it("loads history, filters locally, and opens the selected commit diff", async () => {
    fileHistory.mockResolvedValueOnce({ ok: true, data: { currentPath: "src/domain/account.js", entries, hasMore: false } });
    fileDiff.mockResolvedValue({ ok: true, data: { diff: "@@ -1 +1 @@\n-old\n+new\n", binary: false, truncated: false } });
    const user = userEvent.setup();
    render(<HistoryHarness />);

    expect(await screen.findByText("Update account")).toBeInTheDocument();
    expect(fileHistory).toHaveBeenCalledWith({ repositoryPath: "/workspace/repository", path: "src/domain/account.js", limit: 200, skip: 0 });

    const authorFilter = screen.getByRole("combobox", { name: "Filter history by author" });
    await user.selectOptions(authorFilter, "Grace Hopper");
    expect(screen.queryByText("Update account")).not.toBeInTheDocument();
    expect(screen.getByText("Rename user module")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Rename user module/ }));
    expect(await screen.findByText("new")).toBeInTheDocument();
    expect(fileDiff).toHaveBeenCalledWith({
      repositoryPath: "/workspace/repository",
      from: "c".repeat(40),
      to: "b".repeat(40),
      path: "src/domain/account.js",
      oldPath: "src/user.js",
    });
  });
});
