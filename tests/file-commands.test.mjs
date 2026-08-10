import test from "node:test";
import assert from "node:assert/strict";
import { createFileCommands } from "../src/features/command-palette/file-commands.js";
import { isCommandEnabled } from "../src/features/command-palette/command-registry.js";

test("quick open file command routes to the supplied file action", () => {
  const command = createFileCommands()[0];
  let opened = false;
  const context = { activeRepository: { rootPath: "/workspace/repo" }, quickOpenFile: () => { opened = true; } };

  assert.equal(command.id, "files.quick-open");
  assert.deepEqual(command.shortcut, ["mod", "p"]);
  assert.equal(isCommandEnabled(command, context), true);
  command.run(context);
  assert.equal(opened, true);
});

test("quick open file is disabled without an active repository", () => {
  assert.equal(isCommandEnabled(createFileCommands()[0], { quickOpenFile: () => {} }), false);
});
