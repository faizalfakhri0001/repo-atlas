const crypto = require("node:crypto");

const HUNK_HEADER = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(?:\s?(.*))?$/;

function createHunkId(filePath, header, lines) {
  const source = [filePath, header, ...(Array.isArray(lines) ? lines : [])].join("\n");
  return crypto.createHash("sha256").update(source, "utf8").digest("hex");
}

function splitPatchLines(text) {
  const lines = String(text ?? "").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function parseDiffHeader(line) {
  const match = String(line).match(/^diff --git a\/(.+) b\/(.+)$/);
  return match ? { oldPath: match[1], newPath: match[2] } : null;
}

function assertPatchScope(lines, filePath, GitServiceError) {
  const headers = lines.filter((line) => line.startsWith("diff --git "));
  if (headers.length !== 1) {
    throw new GitServiceError("The generated patch must contain exactly one requested file.", "INVALID_PATCH");
  }
  const header = parseDiffHeader(headers[0]);
  if (!header || (header.oldPath !== filePath && header.newPath !== filePath)) {
    throw new GitServiceError("The generated patch does not match the requested file.", "INVALID_PATCH");
  }

  const fileHeaders = lines.filter((line) => line.startsWith("--- ") || line.startsWith("+++ "));
  for (const line of fileHeaders) {
    const value = line.slice(4);
    if (value === "/dev/null") continue;
    const expected = line.startsWith("--- ") ? `a/${header.oldPath}` : `b/${header.newPath}`;
    if (value !== expected) {
      throw new GitServiceError("The generated patch contains an unexpected file path.", "INVALID_PATCH");
    }
  }
}

function parseWorkspacePatch(text, filePath, GitServiceError) {
  const lines = splitPatchLines(text);
  if (lines.length === 0) return { lines, prefix: [], hunks: [] };
  assertPatchScope(lines, filePath, GitServiceError);

  const firstHunkIndex = lines.findIndex((line) => HUNK_HEADER.test(line));
  if (firstHunkIndex < 0) return { lines, prefix: lines, hunks: [] };

  const prefix = lines.slice(0, firstHunkIndex);
  const hunks = [];
  let current = null;
  for (let index = firstHunkIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (HUNK_HEADER.test(line)) {
      if (current) hunks.push(current);
      const match = line.match(HUNK_HEADER);
      current = {
        id: "",
        header: line,
        oldStart: Number(match[1]),
        oldCount: Number(match[2] ?? 1),
        newStart: Number(match[3]),
        newCount: Number(match[4] ?? 1),
        context: match[5]?.trim() ?? "",
        lines: [],
      };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) hunks.push(current);
  for (const hunk of hunks) hunk.id = createHunkId(filePath, hunk.header, hunk.lines);
  return { lines, prefix, hunks };
}

function buildWorkspacePatch(parsed, hunkId) {
  const hunk = parsed?.hunks?.find((candidate) => candidate.id === hunkId);
  if (!hunk) return null;
  return `${[...parsed.prefix, hunk.header, ...hunk.lines].join("\n")}\n`;
}

module.exports = {
  HUNK_HEADER,
  buildWorkspacePatch,
  createHunkId,
  parseDiffHeader,
  parseWorkspacePatch,
  splitPatchLines,
};
