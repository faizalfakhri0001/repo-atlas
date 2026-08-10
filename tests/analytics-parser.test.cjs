const test = require("node:test");
const assert = require("node:assert/strict");
const {
  FIELD_SEPARATOR,
  RECORD_MARKER,
  createAnalyticsParser,
  parsePathChange,
} = require("../electron/git/analytics/parser.cjs");

test("analytics parser reconstructs records split across streamed chunks", () => {
  const firstHash = "a".repeat(40);
  const secondHash = "b".repeat(40);
  const raw = [
    `${RECORD_MARKER}${firstHash}${FIELD_SEPARATOR}parent${FIELD_SEPARATOR}Ada${FIELD_SEPARATOR}ADA@EXAMPLE.TEST${FIELD_SEPARATOR}2026-08-10T10:00:00Z${FIELD_SEPARATOR}Add app\n`,
    "4\t1\tsrc/app.js\n",
    "-\t-\tassets/logo.bin\n",
    `${RECORD_MARKER}${secondHash}${FIELD_SEPARATOR}${firstHash}${FIELD_SEPARATOR}Grace${FIELD_SEPARATOR}grace@example.test${FIELD_SEPARATOR}2026-08-09T10:00:00Z${FIELD_SEPARATOR}Rename app\n`,
    "0\t0\tsrc/{app.js => main.js}\n",
  ].join("");
  const parser = createAnalyticsParser();
  for (let index = 0; index < raw.length; index += 7) parser.push(raw.slice(index, index + 7));

  const result = parser.finish();
  assert.equal(result.recordCount, 2);
  assert.equal(result.commits.length, 2);
  assert.equal(result.commits[0].author.name, "Ada");
  assert.equal(result.commits[0].files[0].additions, 4);
  assert.equal(result.commits[0].files[0].deletions, 1);
  assert.equal(result.commits[0].files[1].binary, true);
  assert.deepEqual(result.commits[1].files[0], {
    oldPath: "src/app.js",
    path: "src/main.js",
    additions: 0,
    deletions: 0,
    binary: false,
  });
});

test("analytics parser handles simple rename paths and ignores malformed lines", () => {
  assert.deepEqual(parsePathChange("old/name.js => new/name.js"), {
    oldPath: "old/name.js",
    path: "new/name.js",
  });
  const parser = createAnalyticsParser();
  parser.push(`${RECORD_MARKER}${"c".repeat(40)}${FIELD_SEPARATOR}${FIELD_SEPARATOR}Author${FIELD_SEPARATOR}author@example.test${FIELD_SEPARATOR}2026-08-10${FIELD_SEPARATOR}Commit\nnot numstat\n`);
  assert.equal(parser.finish().commits[0].files.length, 0);
});
