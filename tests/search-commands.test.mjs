import assert from "node:assert/strict";
import test from "node:test";
import { createSearchCommands } from "../src/features/command-palette/search-commands.js";
import { findShortcutCommand } from "../src/features/command-palette/command-shortcuts.js";

test("repository search is available from the command palette and its shortcut", async () => {
  const openGlobalSearch = () => "opened";
  const command = createSearchCommands()[0];
  const context = { activeRepository: { rootPath: "/repo" }, openGlobalSearch };
  assert.equal(command.label, "Search Repository");
  assert.equal(await command.run(context), "opened");
  assert.equal(
    findShortcutCommand([command], { key: "f", ctrlKey: true, shiftKey: true }, context),
    command,
  );
});
