import test from "node:test";
import assert from "node:assert/strict";
import history from "../electron/git/history.cjs";

test("parseFileHistory keeps commit metadata and follows rename paths", () => {
  const raw = [
    ["a".repeat(40), "b".repeat(40), "Ada Lovelace", "ada@example.com", "2026-08-10T10:00:00+07:00", "Update account"].join("\x1f") + "\nM\tsrc/domain/account.js",
    ["b".repeat(40), "c".repeat(40), "Grace Hopper", "grace@example.com", "2026-08-09T10:00:00+07:00", "Rename user module"].join("\x1f") + "\nR100\tsrc/user.js\tsrc/domain/account.js",
    ["c".repeat(40), "", "Grace Hopper", "grace@example.com", "2026-08-08T10:00:00+07:00", "Add user module"].join("\x1f") + "\nA\tsrc/user.js",
  ].join("\x1e");

  const entries = history.parseFileHistory(raw, "src/domain/account.js");
  assert.equal(entries.length, 3);
  assert.deepEqual(entries[0], {
    hash: "a".repeat(40),
    shortHash: "aaaaaaaa",
    parentHash: "b".repeat(40),
    subject: "Update account",
    author: { name: "Ada Lovelace", email: "ada@example.com" },
    date: "2026-08-10T10:00:00+07:00",
    status: "M",
    path: "src/domain/account.js",
  });
  assert.equal(entries[1].status, "R");
  assert.equal(entries[1].oldPath, "src/user.js");
  assert.equal(entries[1].path, "src/domain/account.js");
  assert.equal(entries[2].parentHash, null);
  assert.equal(entries[2].status, "A");
});

test("parseFileHistory accepts copy entries and ignores malformed records", () => {
  const raw = [
    ["d".repeat(40), "", "Author", "author@example.com", "2026-08-01T10:00:00+07:00", "Copy file"].join("\x1f") + "\nC087\told.js\tcopy.js",
    "not-a-commit\nM\tignored.js",
  ].join("\x1e");

  const entries = history.parseFileHistory(raw, "copy.js");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, "C");
  assert.equal(entries[0].score, 87);
  assert.equal(entries[0].oldPath, "old.js");
  assert.equal(entries[0].path, "copy.js");
});
