import test from "node:test";
import assert from "node:assert/strict";
import { buildFileTree, collectDirectoryPaths, flattenVisibleTree } from "../src/lib/file-tree.js";

test("buildFileTree creates sorted directories and aggregates working changes", () => {
  const tree = buildFileTree([
    { path: "src/z.js", extension: "js", tracked: true, status: "M" },
    { path: "README.md", extension: "md", tracked: true },
    { path: "src/lib/a.js", extension: "js", tracked: false, status: "?" },
    { path: "app.jsx", extension: "jsx", tracked: true },
    { path: "src/z.js", extension: "js", tracked: true, status: "M" },
  ]);

  assert.deepEqual(tree.children.map((node) => node.path), ["src", "app.jsx", "README.md"]);
  assert.deepEqual(tree.children[0].children.map((node) => node.path), ["src/lib", "src/z.js"]);
  assert.equal(tree.children[0].changeCount, 2);
  assert.deepEqual(tree.children[0].statusCounts, { M: 1, "?": 1 });
  assert.deepEqual(collectDirectoryPaths(tree), ["src", "src/lib"]);
});

test("flattenVisibleTree only includes children of expanded directories", () => {
  const tree = buildFileTree([
    { path: "src/lib/a.js" },
    { path: "src/app.js" },
    { path: "README.md" },
  ]);

  assert.deepEqual(
    flattenVisibleTree(tree, new Set(["src"])).map(({ node, depth }) => [node.path, depth]),
    [["src", 0], ["src/lib", 1], ["src/app.js", 1], ["README.md", 0]],
  );
  assert.deepEqual(
    flattenVisibleTree(tree, new Set(["src", "src/lib"])).map(({ node }) => node.path),
    ["src", "src/lib", "src/lib/a.js", "src/app.js", "README.md"],
  );
});
