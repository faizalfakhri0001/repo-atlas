const HEADER_PATTERN = /^([0-9a-f]{7,40})\s+(\d+)\s+(\d+)(?:\s+(\d+))?$/i;

function parseAuthorEmail(value) {
  const email = String(value ?? "").trim();
  return email.startsWith("<") && email.endsWith(">") ? email.slice(1, -1) : email;
}

function parseAuthorTime(value) {
  const timestamp = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(timestamp)) return String(value ?? "").trim() || null;
  return new Date(timestamp * 1000).toISOString();
}

function parsePrevious(value) {
  const match = String(value ?? "").trim().match(/^([0-9a-f]{7,40})\s+(.+)$/i);
  if (!match) return null;
  return { hash: match[1].toLowerCase(), path: match[2] };
}

function createLine(metadata, lineNumber, content) {
  return {
    lineNumber,
    content,
    commitHash: metadata.commitHash,
    shortHash: metadata.commitHash.slice(0, 8),
    author: {
      name: metadata.author.name,
      email: metadata.author.email,
    },
    authorTime: metadata.authorTime,
    summary: metadata.summary,
    ...(metadata.previous ? { previous: { ...metadata.previous } } : {}),
    boundary: metadata.boundary,
  };
}

function aggregateAuthors(lines) {
  const authors = new Map();
  for (const line of lines) {
    const key = `${line.author.email}\u0000${line.author.name}`;
    const current = authors.get(key) ?? {
      key,
      name: line.author.name,
      email: line.author.email,
      lines: 0,
      lineCount: 0,
      commits: new Set(),
      lastAuthorTime: null,
    };
    current.lines += 1;
    current.lineCount += 1;
    current.commits.add(line.commitHash);
    if (!current.lastAuthorTime || String(line.authorTime ?? "") > String(current.lastAuthorTime)) {
      current.lastAuthorTime = line.authorTime;
    }
    authors.set(key, current);
  }

  return [...authors.values()]
    .map((author) => ({ ...author, commits: author.commits.size }))
    .sort((left, right) => right.lines - left.lines || left.name.localeCompare(right.name));
}

function parseBlamePorcelain(raw) {
  const input = String(raw ?? "");
  if (!input) return { lines: [], authors: [] };

  const records = input.split(/\r?\n/);
  const lines = [];
  let index = 0;

  while (index < records.length) {
    const header = records[index].match(HEADER_PATTERN);
    if (!header) {
      index += 1;
      continue;
    }

    const metadata = {
      commitHash: header[1].toLowerCase(),
      finalLine: Number(header[3]),
      lineCount: Number(header[4] ?? 1),
      author: { name: "", email: "" },
      authorTime: null,
      summary: "",
      previous: null,
      boundary: false,
    };
    index += 1;

    while (index < records.length && !records[index].startsWith("\t") && !HEADER_PATTERN.test(records[index])) {
      const record = records[index];
      if (record.startsWith("author ")) metadata.author.name = record.slice("author ".length);
      else if (record.startsWith("author-mail ")) metadata.author.email = parseAuthorEmail(record.slice("author-mail ".length));
      else if (record.startsWith("author-time ")) metadata.authorTime = parseAuthorTime(record.slice("author-time ".length));
      else if (record.startsWith("summary ")) metadata.summary = record.slice("summary ".length);
      else if (record.startsWith("previous ")) metadata.previous = parsePrevious(record.slice("previous ".length));
      else if (record === "boundary") metadata.boundary = true;
      index += 1;
    }

    for (let offset = 0; offset < metadata.lineCount && index < records.length; offset += 1) {
      const record = records[index];
      if (!record.startsWith("\t")) break;
      lines.push(createLine(metadata, metadata.finalLine + offset, record.slice(1)));
      index += 1;
    }
  }

  return { lines, authors: aggregateAuthors(lines) };
}

module.exports = {
  parseBlamePorcelain,
};
