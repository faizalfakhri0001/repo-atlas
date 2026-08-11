import assert from "node:assert/strict";
import test from "node:test";
import {
  filterReflogEntries,
  findPreviousReflogEntry,
  groupReflogEntries,
  mergeReflogEntries,
} from "../src/features/reflog/reflog-model.js";

const entries = [
  {
    index: 0,
    hash: "a".repeat(40),
    selector: "HEAD@{0}",
    refName: "HEAD",
    date: "2026-08-11T09:00:00Z",
    action: "commit",
    rawMessage: "commit: Update checkout",
    detail: "Update checkout",
    actor: { name: "Ada Lovelace", email: "ada@example.test" },
  },
  {
    index: 1,
    hash: "b".repeat(40),
    selector: "HEAD@{1}",
    refName: "HEAD",
    date: "2026-08-10T09:00:00Z",
    action: "checkout",
    rawMessage: "checkout: moving from main to feature/payment",
    detail: "moving from main to feature/payment",
    actor: { name: "Grace Hopper", email: "grace@example.test" },
  },
  {
    index: 2,
    hash: "c".repeat(40),
    selector: "HEAD@{2}",
    refName: "HEAD",
    date: "2026-08-08T09:00:00Z",
    action: "reset",
    rawMessage: "reset: moving to HEAD~1",
    detail: "moving to HEAD~1",
    actor: { name: "Linus Torvalds", email: "linus@example.test" },
  },
  {
    index: 3,
    hash: "d".repeat(40),
    selector: "HEAD@{3}",
    refName: "HEAD",
    date: "2026-07-20T09:00:00Z",
    action: "other",
    rawMessage: "custom maintenance event",
    detail: "custom maintenance event",
    actor: { name: "Unknown", email: "unknown@example.test" },
  },
];

test("groups reflog entries into today, yesterday, dates, and older", () => {
  const groups = groupReflogEntries(entries, { now: new Date("2026-08-11T15:00:00Z") });
  assert.deepEqual(groups.map((group) => group.label), ["Today", "Yesterday", "Aug 8, 2026", "Older"]);
  assert.deepEqual(groups.map((group) => group.entries.length), [1, 1, 1, 1]);
});

test("filters reflog entries by action and searchable metadata", () => {
  assert.deepEqual(filterReflogEntries(entries, { action: "checkout" }), [entries[1]]);
  assert.deepEqual(filterReflogEntries(entries, { query: "GRACE@EXAMPLE.TEST" }), [entries[1]]);
  assert.deepEqual(filterReflogEntries(entries, { query: "feature/payment" }), [entries[1]]);
  assert.deepEqual(filterReflogEntries(entries, { action: "reset", query: "head~1" }), [entries[2]]);
});

test("merges pages without duplicating selectors and finds the older entry", () => {
  const merged = mergeReflogEntries(entries.slice(0, 2), [entries[1], entries[2]]);
  assert.deepEqual(merged, entries.slice(0, 3));
  assert.equal(findPreviousReflogEntry(merged, entries[0]), entries[1]);
  assert.equal(findPreviousReflogEntry(merged, entries[2]), null);
});
