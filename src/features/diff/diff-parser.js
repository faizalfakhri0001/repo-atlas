const HUNK_HEADER = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(?:\s?(.*))?$/;

function parseHunkHeader(line) {
  const match = line.match(HUNK_HEADER);
  if (!match) return null;
  return {
    header: line,
    oldStart: Number(match[1]),
    newStart: Number(match[3]),
    context: match[5]?.trim() ?? "",
    lines: [],
  };
}

function parseDiffLine(line, oldLine, newLine) {
  const marker = line[0];
  if (marker === "+") {
    return { line: { type: "add", oldLine: null, newLine, text: line.slice(1) }, oldLine, newLine: newLine + 1 };
  }
  if (marker === "-") {
    return { line: { type: "delete", oldLine, newLine: null, text: line.slice(1) }, oldLine: oldLine + 1, newLine };
  }
  if (marker === "\\") {
    return { line: { type: "note", oldLine: null, newLine: null, text: line }, oldLine, newLine };
  }
  if (marker === " ") {
    return { line: { type: "context", oldLine, newLine, text: line.slice(1) }, oldLine: oldLine + 1, newLine: newLine + 1 };
  }
  return { line: { type: "note", oldLine: null, newLine: null, text: line }, oldLine, newLine };
}

/**
 * Parse unified Git diff text into a renderer-neutral model.
 * The parser deliberately has no React or DOM dependencies.
 */
export function parseUnifiedDiff(text) {
  const meta = [];
  const hunks = [];
  const lines = String(text ?? "").split("\n");
  if (lines.at(-1) === "") lines.pop();

  let current = null;
  let oldLine = 0;
  let newLine = 0;
  for (const line of lines) {
    const header = parseHunkHeader(line);
    if (header) {
      current = header;
      oldLine = header.oldStart;
      newLine = header.newStart;
      hunks.push(current);
      continue;
    }

    if (!current) {
      if (line) meta.push(line);
      continue;
    }

    const parsed = parseDiffLine(line, oldLine, newLine);
    current.lines.push(parsed.line);
    oldLine = parsed.oldLine;
    newLine = parsed.newLine;
  }

  return { meta, hunks };
}

export function countDiffLines(hunks) {
  return (hunks ?? []).reduce((total, hunk) => total + hunk.lines.length, 0);
}

export function limitDiffHunks(hunks, maxLines = 500) {
  let remaining = Math.max(0, maxLines);
  let truncated = false;
  const visible = [];
  for (const hunk of hunks ?? []) {
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    if (hunk.lines.length <= remaining) {
      visible.push(hunk);
      remaining -= hunk.lines.length;
      continue;
    }
    visible.push({ ...hunk, lines: hunk.lines.slice(0, remaining) });
    truncated = true;
    remaining = 0;
  }
  return { hunks: visible, truncated };
}
