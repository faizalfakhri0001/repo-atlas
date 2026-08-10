import test from "node:test";
import assert from "node:assert/strict";
import { createNavigationCommands } from "../src/features/command-palette/navigation-commands.js";
import { isCommandEnabled } from "../src/features/command-palette/command-registry.js";

test("navigation commands expose the application views and shortcuts", () => {
  const commands = createNavigationCommands();
  assert.deepEqual(commands.slice(0, 4).map((command) => command.id), [
    "navigation.overview",
    "navigation.commits",
    "navigation.files",
    "navigation.workspace",
  ]);
  assert.deepEqual(commands[2].shortcut, ["mod", "3"]);
  assert.equal(commands.length, 9);
});

test("navigation commands require an active repository and route through context", () => {
  const commands = createNavigationCommands();
  const visited = [];
  const context = { activeRepository: { name: "repo" }, navigate: (view) => visited.push(view) };

  assert.equal(isCommandEnabled(commands[0], context), true);
  assert.equal(isCommandEnabled(commands[0], { navigate: context.navigate }), false);
  commands.find((command) => command.id === "navigation.files").run(context);
  assert.deepEqual(visited, ["files"]);
});
