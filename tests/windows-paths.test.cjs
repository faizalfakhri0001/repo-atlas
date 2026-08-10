const test = require("node:test");
const assert = require("node:assert/strict");
const { assertRelativePath } = require("../electron/git/core.cjs");

test("Windows-style repository paths normalize safely", () => {
  assert.equal(assertRelativePath("src\\components\\app.jsx"), "src/components/app.jsx");
  assert.equal(assertRelativePath("docs\\Release Notes\\README.md"), "docs/Release Notes/README.md");

  for (const input of [
    "C:\\Users\\developer\\outside.txt",
    "C:/Users/developer/outside.txt",
    "\\\\server\\share\\outside.txt",
    "\\server\\share\\outside.txt",
  ]) {
    assert.throws(
      () => assertRelativePath(input),
      (error) => error?.code === "INVALID_PATH",
    );
  }
});
