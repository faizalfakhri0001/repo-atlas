const test = require("node:test");
const assert = require("node:assert/strict");
const { assertRelativePath } = require("../electron/git/core.cjs");

test("Linux-style repository paths stay within the repository", () => {
  assert.equal(assertRelativePath("./src//main.c"), "src/main.c");
  assert.equal(assertRelativePath("config/../README.md"), "README.md");
  assert.equal(assertRelativePath(".github/workflows/ci.yml"), ".github/workflows/ci.yml");

  for (const input of [
    "/etc/passwd",
    "../outside.txt",
    "src/../../outside.txt",
    "./../../outside.txt",
    ".",
  ]) {
    assert.throws(
      () => assertRelativePath(input),
      (error) => ["INVALID_PATH", "PATH_OUTSIDE_REPOSITORY"].includes(error?.code),
    );
  }
});
