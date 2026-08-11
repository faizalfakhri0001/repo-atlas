import test from "node:test";
import assert from "node:assert/strict";
import { createNavigationCommands } from "../src/features/command-palette/navigation-commands.js";
import { isCommandEnabled } from "../src/features/command-palette/command-registry.js";

test("navigation commands expose the application views and shortcuts", () => {
  const commands = createNavigationCommands();
  assert.deepEqual(commands.slice(0, 5).map((command) => command.id), [
    "navigation.overview",
    "navigation.commits",
    "navigation.reflog",
    "navigation.saved-views",
    "navigation.files",
  ]);
  assert.deepEqual(commands.find((command) => command.id === "navigation.files").shortcut, ["mod", "3"]);
  assert.deepEqual(commands.slice(-3).map((command) => command.id), ["navigation.ownership", "navigation.health", "navigation.activity"]);
  assert.equal(commands.length, 15);
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
