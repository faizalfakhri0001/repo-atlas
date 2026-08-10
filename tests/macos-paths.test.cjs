const test = require("node:test");
const assert = require("node:assert/strict");
const { assertRelativePath } = require("../electron/git/core.cjs");

test("macOS-style repository paths preserve valid Unicode and spaced names", () => {
  assert.equal(
    assertRelativePath("src/../docs/Release Notes/README – 日本語.md"),
    "docs/Release Notes/README – 日本語.md",
  );
  assert.equal(assertRelativePath("packages/app:resources/icon.png"), "packages/app:resources/icon.png");

  for (const input of [
    "/Users/developer/outside.txt",
    "/Volumes/External/outside.txt",
    "/private/tmp/outside.txt",
  ]) {
    assert.throws(
      () => assertRelativePath(input),
      (error) => error?.code === "INVALID_PATH",
    );
  }
});
