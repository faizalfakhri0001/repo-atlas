const test = require("node:test");
const assert = require("node:assert/strict");
const { parseBlamePorcelain } = require("../electron/git/blame-parser.cjs");

test("parseBlamePorcelain keeps grouped lines and line content exactly", () => {
  const firstHash = "a".repeat(40);
  const secondHash = "b".repeat(40);
  const raw = [
    `${firstHash} 1 1 3`,
    "author Faizal Fakhri",
    "author-mail <faizal@example.test>",
    "author-time 1704067200",
    "committer Faizal Fakhri",
    "committer-mail <faizal@example.test>",
    "committer-time 1704067200",
    "summary Add loader",
    "boundary",
    "\tfunction loadRepo() {",
    "\t\treturn result;",
    "\t",
    `${secondHash} 4 4 1`,
    "author Sára Kim",
    "author-mail <sara@example.test>",
    "author-time 1711929600",
    "summary Fix tabs",
    `previous ${firstHash} src/old file.js`,
    "filename src/file.js",
    "\t\tconst value = true;",
  ].join("\n");

  const result = parseBlamePorcelain(raw);

  assert.equal(result.lines.length, 4);
  assert.deepEqual(result.lines[0], {
    lineNumber: 1,
    content: "function loadRepo() {",
    commitHash: firstHash,
    shortHash: "aaaaaaaa",
    author: { name: "Faizal Fakhri", email: "faizal@example.test" },
    authorTime: "2024-01-01T00:00:00.000Z",
    summary: "Add loader",
    boundary: true,
  });
  assert.equal(result.lines[2].content, "");
  assert.equal(result.lines[3].author.name, "Sára Kim");
  assert.deepEqual(result.lines[3].previous, { hash: firstHash, path: "src/old file.js" });
  assert.equal(result.authors[0].lines, 3);
  assert.equal(result.authors[1].email, "sara@example.test");
});

test("parseBlamePorcelain supports tabs, empty input, and malformed records safely", () => {
  assert.deepEqual(parseBlamePorcelain(""), { lines: [], authors: [] });
  const hash = "c".repeat(40);
  const result = parseBlamePorcelain([`${hash} 7 7 1`, "author Tab Author", "author-mail <tab@example.test>", "author-time not-a-date", "summary Tabs", "\tvalue\twith\ttabs"].join("\n"));
  assert.equal(result.lines[0].content, "value\twith\ttabs");
  assert.equal(result.lines[0].lineNumber, 7);
  assert.equal(result.lines[0].authorTime, "not-a-date");
});
