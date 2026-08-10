import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SplitDiff } from "@/features/diff/split-diff";
import { UnifiedDiff } from "@/features/diff/unified-diff";

describe("diff renderers", () => {
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
});
