import { createCommand } from "./command-registry.js";

export function createSearchCommands() {
  return [createCommand({
    id: "search.repository",
    label: "Search Repository",
    category: "Search",
    keywords: ["files", "commits", "branches", "tags", "authors", "hash", "global"],
    shortcut: ["mod", "shift", "f"],
    enabled: ({ activeRepository, openGlobalSearch }) => Boolean(activeRepository && openGlobalSearch),
    run: ({ openGlobalSearch }) => openGlobalSearch(),
  })];
}
