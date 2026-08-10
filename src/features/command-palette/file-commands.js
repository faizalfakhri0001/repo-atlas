import { createCommand } from "./command-registry.js";

export function createFileCommands() {
  return [createCommand({
    id: "files.quick-open",
    label: "Quick Open File",
    category: "Files",
    keywords: ["file", "path", "filter", "explorer"],
    shortcut: ["mod", "p"],
    run: ({ quickOpenFile }) => quickOpenFile(),
    enabled: ({ activeRepository, quickOpenFile }) => Boolean(activeRepository && quickOpenFile),
  })];
}
