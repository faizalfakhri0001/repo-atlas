function flushChanges(rows, deletes, adds) {
  const length = Math.max(deletes.length, adds.length);
  for (let index = 0; index < length; index += 1) {
    rows.push({ left: deletes[index] ?? null, right: adds[index] ?? null });
  }
  deletes.length = 0;
  adds.length = 0;
}

/**
 * Align one hunk for a side-by-side renderer.
 * Replacement blocks are paired by position; this is intentionally not a
 * semantic or word-level diff.
 */
export function alignSplitHunk(hunk) {
  const rows = [];
  const deletes = [];
  const adds = [];

  for (const line of hunk?.lines ?? []) {
    if (line.type === "delete") {
      deletes.push(line);
      continue;
    }
    if (line.type === "add") {
      adds.push(line);
      continue;
    }

    flushChanges(rows, deletes, adds);
    rows.push({ left: line, right: line });
  }

  flushChanges(rows, deletes, adds);
  return rows;
}

export function alignSplitDiff(hunks) {
  return (hunks ?? []).map((hunk) => ({ hunk, rows: alignSplitHunk(hunk) }));
}
