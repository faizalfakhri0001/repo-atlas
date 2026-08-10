const test = require("node:test");
const assert = require("node:assert/strict");
const { runGitStream } = require("../electron/git/analytics/runner.cjs");

test("analytics runner streams Git output without returning the full payload", async () => {
  let chunks = 0;
  let bytes = 0;
  const result = await runGitStream(process.cwd(), ["log", "--format=%H", "--max-count=3"], {
    onChunk: (chunk) => {
      chunks += 1;
      bytes += chunk.byteLength;
    },
  });

  assert.ok(chunks > 0);
  assert.equal(result.code, 0);
  assert.equal(result.bytes, bytes);
  assert.ok(bytes > 0);
  assert.equal(Object.hasOwn(result, "stdout"), false);
});

test("analytics runner stops when the bounded output limit is reached", async () => {
  await assert.rejects(
    () => runGitStream(process.cwd(), ["log", "--format=%H", "--max-count=3"], { maxOutputBytes: 1 }),
    (error) => error?.code === "ANALYTICS_LIMIT_REACHED",
  );
});
