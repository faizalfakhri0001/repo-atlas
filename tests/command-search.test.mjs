import test from "node:test";
import assert from "node:assert/strict";
import { createCommandRegistry } from "../src/features/command-palette/command-registry.js";
import { rankCommands, scoreCommand, scoreText, searchCommands } from "../src/features/command-palette/command-search.js";

const commands = createCommandRegistry([
  { id: "repository.refresh", label: "Refresh Repository", category: "Repository", keywords: ["reload", "rescan"], run: () => {} },
  { id: "navigation.files", label: "Open Files", category: "Navigation", keywords: ["explorer", "tree"], run: () => {} },
  { id: "compare.open", label: "Compare Refs", category: "Git", keywords: ["branches", "diff"], run: () => {} },
]);

test("scoreText prioritizes exact, prefix, word prefix, substring, and fuzzy matches", () => {
  assert.ok(scoreText("refresh repository", "Refresh Repository") > scoreText("refresh", "Refresh Repository"));
  assert.ok(scoreText("repo", "Refresh Repository") > scoreText("repo", "Open Files"));
  assert.ok(scoreText("refs", "Compare Refs") > scoreText("refs", "Open Files"));
  assert.ok(scoreText("rf", "Refresh Repository") != null);
  assert.equal(scoreText("missing", "Refresh Repository"), null);
});

test("scoreCommand searches labels before lower-priority keywords", () => {
  assert.ok(scoreCommand(commands[0], "refresh") > scoreCommand(commands[0], "reload"));
  assert.equal(scoreCommand(commands[1], "unknown"), null);
});

test("searchCommands is capitalization-insensitive and capped", () => {
  assert.equal(searchCommands(commands, "FILES")[0].id, "navigation.files");
  assert.deepEqual(searchCommands(commands, "", 2).map((command) => command.id), ["repository.refresh", "navigation.files"]);
  assert.equal(rankCommands(commands, "", 20).length, 3);
  assert.equal(searchCommands([...commands, ...commands, ...commands], "repo", 2).length, 2);
});
