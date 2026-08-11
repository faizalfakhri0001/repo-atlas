const assert = require("node:assert/strict");
const test = require("node:test");
const {
  parseReflogAction,
  parseReflogEntries,
} = require("../electron/git/reflog.cjs");

const hash = "a".repeat(40);

test("parseReflogAction classifies supported Git subjects without over-inference", () => {
  assert.deepEqual(parseReflogAction("commit: Add feature"), { action: "commit", detail: "Add feature" });
  assert.deepEqual(parseReflogAction("commit (amend): Fix typo"), { action: "amend", detail: "Fix typo" });
  assert.deepEqual(parseReflogAction("checkout: moving from main to develop"), {
    action: "checkout",
    detail: "moving from main to develop",
  });
  assert.deepEqual(parseReflogAction("rebase (pick): apply change"), { action: "rebase", detail: "apply change" });
  assert.deepEqual(parseReflogAction("merge feature/payment: Merge made by the 'ort' strategy."), {
    action: "merge",
    detail: "Merge made by the 'ort' strategy.",
  });
  assert.deepEqual(parseReflogAction("custom action without a known prefix"), {
    action: "other",
    detail: "custom action without a known prefix",
  });
});

test("parseReflogEntries parses structured records and preserves pagination indexes", () => {
  const raw = [
    [hash, "HEAD@{3}", "HEAD@{3}", "Ada Lovelace", "ada@example.test", "2026-08-11T10:00:00+00:00", "reset: moving to HEAD~1"].join("\x1f"),
    [hash.replaceAll("a", "b"), "HEAD@{4}", "HEAD@{4}", "Grace Hopper", "grace@example.test", "2026-08-10T10:00:00+00:00", "checkout: moving from main to feature/payment"].join("\x1f"),
  ].join("\x1e");

  assert.deepEqual(parseReflogEntries(raw, { refName: "HEAD", offset: 3 }), [
    {
      index: 3,
      hash,
      shortHash: "aaaaaaaa",
      selector: "HEAD@{3}",
      refName: "HEAD",
      date: "2026-08-11T10:00:00+00:00",
      actor: { name: "Ada Lovelace", email: "ada@example.test" },
      rawMessage: "reset: moving to HEAD~1",
      action: "reset",
      detail: "moving to HEAD~1",
      reachable: null,
    },
    {
      index: 4,
      hash: "b".repeat(40),
      shortHash: "bbbbbbbb",
      selector: "HEAD@{4}",
      refName: "HEAD",
      date: "2026-08-10T10:00:00+00:00",
      actor: { name: "Grace Hopper", email: "grace@example.test" },
      rawMessage: "checkout: moving from main to feature/payment",
      action: "checkout",
      detail: "moving from main to feature/payment",
      reachable: null,
    },
  ]);
});

test("parseReflogEntries safely ignores empty and incomplete records", () => {
  const raw = `${[hash, "HEAD@{0}", "HEAD@{0}", "Ada", "ada@example.test", "2026-08-11T10:00:00+00:00", "commit: ok"].join("\x1f")}\x1e${hash}`;
  const entries = parseReflogEntries(raw);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].action, "commit");
});
