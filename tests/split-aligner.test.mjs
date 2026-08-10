import test from "node:test";
import assert from "node:assert/strict";
import { alignSplitHunk } from "../src/features/diff/split-aligner.js";

const line = (type, text, oldLine = null, newLine = null) => ({ type, text, oldLine, newLine });

test("alignSplitHunk pairs context on both sides", () => {
  const context = line("context", "same", 4, 4);

  assert.deepEqual(alignSplitHunk({ lines: [context] }), [{ left: context, right: context }]);
});

test("alignSplitHunk pairs replacement blocks positionally and pads the longer side", () => {
  const deletes = [line("delete", "old A", 1), line("delete", "old B", 2)];
  const adds = [line("add", "new A", null, 1), line("add", "new B", null, 2), line("add", "new C", null, 3)];

  assert.deepEqual(alignSplitHunk({ lines: [...deletes, ...adds] }), [
    { left: deletes[0], right: adds[0] },
    { left: deletes[1], right: adds[1] },
    { left: null, right: adds[2] },
  ]);
});

test("alignSplitHunk keeps separated change blocks and notes in order", () => {
  const firstDelete = line("delete", "old", 1);
  const context = line("context", "same", 2, 2);
  const secondAdd = line("add", "new", null, 3);
  const note = line("note", "\\ No newline at end of file");

  assert.deepEqual(alignSplitHunk({ lines: [firstDelete, context, secondAdd, note] }), [
    { left: firstDelete, right: null },
    { left: context, right: context },
    { left: null, right: secondAdd },
    { left: note, right: note },
  ]);
});
