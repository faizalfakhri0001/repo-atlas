import test from "node:test";
import assert from "node:assert/strict";
import { createCommand } from "../src/features/command-palette/command-registry.js";
import { findShortcutCommand, shortcutMatches } from "../src/features/command-palette/command-shortcuts.js";

const refresh = createCommand({ id: "repository.refresh", label: "Refresh", category: "Repository", shortcut: ["mod", "r"], run: () => {} });

test("shortcutMatches accepts platform modifiers and rejects extra modifiers", () => {
  assert.equal(shortcutMatches(["mod", "r"], { key: "r", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }), true);
  assert.equal(shortcutMatches(["mod", "r"], { key: "R", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }), true);
  assert.equal(shortcutMatches(["mod", "r"], { key: "r", ctrlKey: true, metaKey: false, altKey: true, shiftKey: false }), false);
  assert.equal(shortcutMatches(["mod", "r"], { key: "r", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }), false);
});

test("findShortcutCommand ignores disabled and hidden commands", () => {
  const hidden = createCommand({ id: "hidden", label: "Hidden", category: "Test", shortcut: ["mod", "r"], visible: false, run: () => {} });
  const disabled = createCommand({ id: "disabled", label: "Disabled", category: "Test", shortcut: ["mod", "r"], enabled: false, run: () => {} });
  assert.equal(findShortcutCommand([hidden, disabled, refresh], { key: "r", ctrlKey: true }, {}), refresh);
});
