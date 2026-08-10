import test from "node:test";
import assert from "node:assert/strict";
import {
  createCommand,
  createCommandRegistry,
  isCommandEnabled,
  isCommandVisible,
  normalizeShortcut,
} from "../src/features/command-palette/command-registry.js";

test("normalizeShortcut canonicalizes modifiers and preserves key order", () => {
  assert.deepEqual(normalizeShortcut("Command+Shift+P"), ["mod", "shift", "p"]);
  assert.deepEqual(normalizeShortcut(["return", "cmd", "cmd"]), ["mod", "enter"]);
});

test("createCommand applies safe defaults and evaluates context predicates", () => {
  const command = createCommand({
    id: "files.open",
    label: "Open Files",
    category: "Navigation",
    keywords: [" explorer ", "explorer", ""],
    shortcut: ["cmd", "3"],
    enabled: (context) => Boolean(context.repository),
    visible: (context) => context.mode !== "hidden",
    run: () => "opened",
  });

  assert.deepEqual(command.keywords, ["explorer"]);
  assert.deepEqual(command.shortcut, ["mod", "3"]);
  assert.equal(isCommandEnabled(command, { repository: {} }), true);
  assert.equal(isCommandEnabled(command, {}), false);
  assert.equal(isCommandVisible(command, { mode: "normal" }), true);
  assert.equal(isCommandVisible(command, { mode: "hidden" }), false);
});

test("createCommandRegistry rejects missing and duplicate command definitions", () => {
  assert.throws(() => createCommand({ id: "invalid", label: "Invalid", category: "Test" }), /requires a run function/);
  assert.throws(
    () => createCommandRegistry([
      { id: "same", label: "One", category: "Test", run: () => {} },
      { id: "same", label: "Two", category: "Test", run: () => {} },
    ]),
    /Duplicate command id/,
  );
});
