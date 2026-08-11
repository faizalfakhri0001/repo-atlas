import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReflogView } from "@/components/reflog-view";

const { listReflog, commitReachability } = vi.hoisted(() => ({
  listReflog: vi.fn(),
  commitReachability: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { listReflog, commitReachability },
}));

const entries = [
  {
    index: 0,
    hash: "a".repeat(40),
    shortHash: "aaaaaaaa",
    selector: "HEAD@{0}",
    refName: "HEAD",
    date: "2026-08-11T09:00:00Z",
    actor: { name: "Ada Lovelace", email: "ada@example.test" },
    rawMessage: "commit: Update checkout",
    action: "commit",
    detail: "Update checkout",
    reachable: null,
  },
  {
    index: 1,
    hash: "b".repeat(40),
    shortHash: "bbbbbbbb",
    selector: "HEAD@{1}",
    refName: "HEAD",
    date: "2026-08-10T09:00:00Z",
    actor: { name: "Grace Hopper", email: "grace@example.test" },
    rawMessage: "checkout: moving from main to feature/payment",
    action: "checkout",
    detail: "moving from main to feature/payment",
    reachable: null,
  },
  {
    index: 2,
    hash: "c".repeat(40),
    shortHash: "cccccccc",
    selector: "HEAD@{2}",
    refName: "HEAD",
    date: "2026-08-08T09:00:00Z",
    actor: { name: "Linus Torvalds", email: "linus@example.test" },
    rawMessage: "reset: moving to HEAD~1",
    action: "reset",
    detail: "moving to HEAD~1",
    reachable: null,
  },
];

function renderView(props = {}) {
  return render(
    <ReflogView
      repoPath="/workspace/repository"
      currentHead={entries[0].hash}
      currentBranch="main"
      branches={[{ name: "main", remote: false }, { name: "feature/payment", remote: false }]}
      now={new Date("2026-08-11T15:00:00Z")}
      onViewCommit={props.onViewCommit ?? vi.fn()}
      onCompare={props.onCompare ?? vi.fn()}
      {...props}
    />,
  );
}

describe("ReflogView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => cleanup());

  it("loads a grouped timeline and applies action and search filters", async () => {
    listReflog.mockResolvedValueOnce({ ok: true, data: { entries, hasMore: false, nextSkip: null } });
    const user = userEvent.setup();
    renderView({ bookmarkedHashes: [entries[0].hash] });

    expect(await screen.findByText("Update checkout")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
    expect(screen.getByText("Aug 8, 2026")).toBeInTheDocument();
    expect(screen.getByTitle("Bookmarked commit")).toBeInTheDocument();
    expect(listReflog).toHaveBeenCalledWith({ repositoryPath: "/workspace/repository", ref: "HEAD", limit: 200, skip: 0 });

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter reflog actions" }), "checkout");
    expect(screen.queryByText("Update checkout")).not.toBeInTheDocument();
    expect(screen.getByText("moving from main to feature/payment")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Search reflog" }), "Grace");
    expect(screen.getByText("moving from main to feature/payment")).toBeInTheDocument();
    expect(screen.getByText("1 matching")).toBeInTheDocument();
  });

  it("loads another page, opens commit actions, and checks reachability", async () => {
    listReflog
      .mockResolvedValueOnce({ ok: true, data: { entries: entries.slice(0, 2), hasMore: true, nextSkip: 2 } })
      .mockResolvedValueOnce({ ok: true, data: { entries: [entries[2]], hasMore: false, nextSkip: null } });
    commitReachability.mockResolvedValueOnce({ ok: true, data: { hash: entries[0].hash, branches: ["main"], tags: ["v1.0.0"], reachableFromAnyKnownRef: true } });
    const onViewCommit = vi.fn();
    const onCompare = vi.fn();
    const user = userEvent.setup();
    renderView({ onViewCommit, onCompare });

    expect(await screen.findByText("Update checkout")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("moving to HEAD~1")).toBeInTheDocument();
    expect(listReflog).toHaveBeenLastCalledWith({ repositoryPath: "/workspace/repository", ref: "HEAD", limit: 200, skip: 2 });

    await user.click(screen.getByRole("button", { name: "Check reachability" }));
    expect(await screen.findByText("Reachable from")).toBeInTheDocument();
    expect(commitReachability).toHaveBeenCalledWith({ repositoryPath: "/workspace/repository", hash: entries[0].hash });

    await user.click(screen.getByRole("button", { name: "View Commit" }));
    expect(onViewCommit).toHaveBeenCalledWith(entries[0].hash);
    await user.click(screen.getByRole("button", { name: "Compare with Previous" }));
    expect(onCompare).toHaveBeenCalledWith(entries[1].hash, entries[0].hash);
    await user.click(screen.getByRole("button", { name: "Copy hash" }));
    expect(screen.getByRole("button", { name: "Copy hash" })).toBeInTheDocument();
  });

  it("reloads the first page when the repository revision changes", async () => {
    const refreshedEntry = { ...entries[0], hash: "d".repeat(40), shortHash: "dddddddd", detail: "Refresh changed HEAD" };
    listReflog
      .mockResolvedValueOnce({ ok: true, data: { entries: entries.slice(0, 1), hasMore: false } })
      .mockResolvedValueOnce({ ok: true, data: { entries: [refreshedEntry], hasMore: false } });
    const view = renderView({ revision: "scan-one" });
    expect(await screen.findByText("Update checkout")).toBeInTheDocument();

    view.rerender(
      <ReflogView
        repoPath="/workspace/repository"
        currentHead={refreshedEntry.hash}
        currentBranch="main"
        branches={[{ name: "main", remote: false }]}
        now={new Date("2026-08-11T15:00:00Z")}
        revision="scan-two"
      />,
    );

    expect(await screen.findByText("Refresh changed HEAD")).toBeInTheDocument();
    await waitFor(() => expect(listReflog).toHaveBeenCalledTimes(2));
  });
});
