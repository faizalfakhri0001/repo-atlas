import test from "node:test";
import assert from "node:assert/strict";
import { createSavedViewCommands } from "../src/features/command-palette/saved-view-commands.js";

test("saved view commands include save, manager, and dynamic open actions", async () => {
  const view = { id: "view-1", name: "Release review", viewType: "commits" };
  const commands = createSavedViewCommands([view]);
  const visited = [];
  const context = {
    activeRepository: { rootPath: "/repo" },
    currentSavedView: { viewType: "commits", config: {} },
    saveCurrentView: () => visited.push("save"),
    manageSavedViews: () => visited.push("manage"),
    openSavedView: (value) => visited.push(value.id),
  };

  await commands.find((command) => command.id === "saved-views.save-current").run(context);
  await commands.find((command) => command.id === "saved-views.manage").run(context);
  await commands.find((command) => command.id === "saved-views.open.view-1").run(context);
  assert.deepEqual(visited, ["save", "manage", "view-1"]);
});
