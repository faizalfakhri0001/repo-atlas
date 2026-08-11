import assert from "node:assert/strict";
import test from "node:test";
import { createBookmarkCommands } from "../src/features/command-palette/bookmark-commands.js";
import { isCommandEnabled } from "../src/features/command-palette/command-registry.js";

test("bookmark commands open the explorer and edit the current commit metadata", async () => {
  const commands = createBookmarkCommands();
  const visited = [];
  const context = {
    activeRepository: { rootPath: "/repo" },
    currentCommitHash: "a".repeat(40),
    navigate: (view) => visited.push(view),
    openBookmarkEditor: (hash) => visited.push(`bookmark:${hash}`),
    openNoteEditor: (hash) => visited.push(`note:${hash}`),
  };

  assert.equal(isCommandEnabled(commands[0], context), true);
  assert.equal(isCommandEnabled(commands[1], context), true);
  assert.equal(isCommandEnabled(commands[1], { ...context, currentCommitHash: null }), false);
  await commands[0].run(context);
  await commands[1].run(context);
  await commands[2].run(context);
  assert.deepEqual(visited, ["bookmarks", `bookmark:${context.currentCommitHash}`, `note:${context.currentCommitHash}`]);
});
