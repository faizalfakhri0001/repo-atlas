const test = require("node:test");
const assert = require("node:assert/strict");
const { runGitStream } = require("../electron/git/analytics/runner.cjs");
const { createCancellationSource, throwIfCancelled } = require("../electron/git/analytics/cancellation.cjs");
const { buildAnalyticsIndex, cancelAnalyticsBuild } = require("../electron/git/analytics/index.cjs");

test("cancellation source marks work cancelled and exposes a stable error", () => {
  const source = createCancellationSource();
  assert.equal(source.cancelled, false);
  source.cancel();
  assert.equal(source.cancelled, true);
  assert.throws(() => throwIfCancelled(source.signal), (error) => error?.code === "ANALYTICS_CANCELLED");
});

test("streaming Git runner terminates when its cancellation signal is aborted", async () => {
  const source = createCancellationSource();
  await assert.rejects(
    () => runGitStream(process.cwd(), ["log", "--all", "--format=%H"], {
      signal: source.signal,
      onChunk: () => source.cancel(),
    }),
    (error) => error?.code === "ANALYTICS_CANCELLED",
  );
});

test("analytics index rejects an already-cancelled build and idle cancellation is harmless", async () => {
  const source = createCancellationSource();
  source.cancel();
  await assert.rejects(
    () => buildAnalyticsIndex(process.cwd(), { signal: source.signal }),
    (error) => error?.code === "ANALYTICS_CANCELLED",
  );
  assert.equal(cancelAnalyticsBuild(process.cwd()), false);
});
