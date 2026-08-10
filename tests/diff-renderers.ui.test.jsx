import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiffView } from "@/features/diff/diff-view";
import { SplitDiff } from "@/features/diff/split-diff";
import { UnifiedDiff } from "@/features/diff/unified-diff";

const { fileDiff } = vi.hoisted(() => ({ fileDiff: vi.fn() }));

vi.mock("@/lib/api", () => ({ api: { fileDiff } }));

describe("diff renderers", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it("renders normalized metadata, hunk headers, line numbers, and markers", () => {
    render(
      <UnifiedDiff
        meta={["diff --git a/app.js b/app.js"]}
        hunks={[{
          header: "@@ -1,2 +1,2 @@",
          context: "",
          oldStart: 1,
          newStart: 1,
          lines: [
            { type: "context", oldLine: 1, newLine: 1, text: "const value = 1;" },
            { type: "delete", oldLine: 2, newLine: null, text: "return old;" },
            { type: "add", oldLine: null, newLine: 2, text: "return new;" },
          ],
        }]}
      />,
    );

    expect(screen.getByText("diff --git a/app.js b/app.js")).toBeInTheDocument();
    expect(screen.getByText("@@ -1,2 +1,2 @@")).toBeInTheDocument();
    expect(screen.getByText("return old;")).toBeInTheDocument();
    expect(screen.getByText("return new;")).toBeInTheDocument();
    expect(screen.getAllByText("2")).toHaveLength(2);
  });

  it("renders replacement rows side by side with padding", () => {
    render(
      <SplitDiff
        hunks={[{
          header: "@@ -1,2 +1,3 @@",
          context: "",
          oldStart: 1,
          newStart: 1,
          lines: [
            { type: "delete", oldLine: 1, newLine: null, text: "old A" },
            { type: "delete", oldLine: 2, newLine: null, text: "old B" },
            { type: "add", oldLine: null, newLine: 1, text: "new A" },
            { type: "add", oldLine: null, newLine: 2, text: "new B" },
            { type: "add", oldLine: null, newLine: 3, text: "new C" },
          ],
        }]}
      />,
    );

    expect(screen.getByRole("table", { name: "Split diff" })).toBeInTheDocument();
    expect(screen.getByText("old A")).toBeInTheDocument();
    expect(screen.getByText("old B")).toBeInTheDocument();
    expect(screen.getByText("new A")).toBeInTheDocument();
    expect(screen.getByText("new B")).toBeInTheDocument();
    expect(screen.getByText("new C")).toBeInTheDocument();
  });

  it("loads a diff and applies the selected display preferences", async () => {
    fileDiff.mockResolvedValue({
      ok: true,
      data: {
        diff: "diff --git a/app.js b/app.js\n@@ -1 +1 @@\n-return old;\n+return new;\n",
        binary: false,
        truncated: false,
      },
    });
    const user = userEvent.setup();
    render(<DiffView repoPath="/workspace/repository" request={{ type: "commit", path: "app.js", from: "a".repeat(40), to: "b".repeat(40) }} />);

    expect(await screen.findByText("new")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Split/ }));
    await user.click(screen.getByRole("button", { name: /Wrap/ }));
    await user.click(screen.getByRole("button", { name: /Syntax/ }));

    expect(screen.getByRole("table", { name: "Split diff" })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("repo-atlas-diff-preferences-v1"))).toEqual({ mode: "split", wrap: true, syntaxHighlight: false });
    expect(fileDiff).toHaveBeenCalledWith({ repositoryPath: "/workspace/repository", type: "commit", path: "app.js", from: "a".repeat(40), to: "b".repeat(40) });
  });
});
