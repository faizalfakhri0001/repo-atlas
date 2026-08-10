const RECORD_MARKER = "\x1e";
const FIELD_SEPARATOR = "\x1f";

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function parsePathChange(rawPath) {
  const filePath = String(rawPath ?? "").trim();
  const arrowIndex = filePath.indexOf(" => ");
  if (arrowIndex < 0) return { path: filePath, oldPath: "" };

  const braceStart = filePath.lastIndexOf("{", arrowIndex);
  const braceEnd = filePath.indexOf("}", arrowIndex + 4);
  if (braceStart >= 0 && braceEnd > arrowIndex) {
    const prefix = filePath.slice(0, braceStart);
    const suffix = filePath.slice(braceEnd + 1);
    return {
      oldPath: `${prefix}${filePath.slice(braceStart + 1, arrowIndex)}${suffix}`,
      path: `${prefix}${filePath.slice(arrowIndex + 4, braceEnd)}${suffix}`,
    };
  }

  return {
    oldPath: filePath.slice(0, arrowIndex).trim(),
    path: filePath.slice(arrowIndex + 4).trim(),
  };
}

function parseNumstatLine(line) {
  const match = String(line ?? "").match(/^([^\t]+)\t([^\t]+)\t(.*)$/);
  if (!match) return null;
  const [additionsRaw, deletionsRaw, rawPath] = match.slice(1);
  const paths = parsePathChange(rawPath);
  if (!paths.path) return null;
  return {
    ...paths,
    additions: additionsRaw === "-" ? 0 : parseNumber(additionsRaw),
    deletions: deletionsRaw === "-" ? 0 : parseNumber(deletionsRaw),
    binary: additionsRaw === "-" || deletionsRaw === "-",
  };
}

function parseCommitLine(line) {
  if (!String(line).startsWith(RECORD_MARKER)) return null;
  const fields = String(line).slice(RECORD_MARKER.length).split(FIELD_SEPARATOR);
  const [hash = "", parentsRaw = "", authorName = "", authorEmail = "", authoredAt = "", ...subjectParts] = fields;
  if (!/^[0-9a-f]{7,40}$/i.test(hash)) return null;
  return {
    hash,
    parents: parentsRaw.split(" ").filter(Boolean),
    author: { name: authorName, email: authorEmail },
    authoredAt,
    subject: subjectParts.join(FIELD_SEPARATOR),
    files: [],
  };
}

class AnalyticsLogParser {
  constructor() {
    this.buffer = "";
    this.current = null;
    this.commits = [];
    this.recordCount = 0;
  }

  consumeLine(line) {
    const normalized = String(line).replace(/\r$/, "");
    if (normalized.startsWith(RECORD_MARKER)) {
      if (this.current) this.commits.push(this.current);
      this.current = parseCommitLine(normalized);
      if (this.current) this.recordCount += 1;
      return;
    }
    if (!this.current) return;
    const file = parseNumstatLine(normalized);
    if (file) this.current.files.push(file);
  }

  push(chunk) {
    this.buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk ?? "");
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      this.consumeLine(this.buffer.slice(0, newlineIndex));
      this.buffer = this.buffer.slice(newlineIndex + 1);
      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  finish() {
    if (this.buffer) this.consumeLine(this.buffer);
    if (this.current) this.commits.push(this.current);
    this.buffer = "";
    this.current = null;
    return {
      commits: this.commits,
      recordCount: this.recordCount,
    };
  }
}

function createAnalyticsParser() {
  return new AnalyticsLogParser();
}

module.exports = {
  FIELD_SEPARATOR,
  RECORD_MARKER,
  AnalyticsLogParser,
  createAnalyticsParser,
  parseCommitLine,
  parseNumstatLine,
  parsePathChange,
};
