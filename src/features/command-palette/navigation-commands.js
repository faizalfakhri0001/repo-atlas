import { createCommand } from "./command-registry.js";

const NAVIGATION_COMMANDS = [
  ["overview", "Open Overview", "summary dashboard home", ["mod", "1"]],
  ["commits", "Open Commits", "history log graph", ["mod", "2"]],
  ["files", "Open Files", "explorer tree browser", ["mod", "3"]],
  ["workspace", "Open Workspace", "changes working tree status", ["mod", "4"]],
  ["branches", "Open Branches", "refs heads", []],
  ["compare", "Open Compare", "pull request diff refs", []],
  ["worktrees", "Open Worktrees", "checkout linked trees", []],
  ["submodules", "Open Submodules", "dependencies modules", []],
  ["refs", "Open Refs & Metadata", "tags remotes stashes", []],
  ["hotspots", "Open Hotspots", "activity churn change frequency", []],
  ["ownership", "Open Ownership", "contributors authors directory concentration", []],
  ["health", "Open Repository Health", "health score signals repository status", []],
];

export function createNavigationCommands() {
  return NAVIGATION_COMMANDS.map(([view, label, keywords, shortcut]) => createCommand({
    id: `navigation.${view}`,
    label,
    category: "Navigation",
    keywords: keywords.split(" "),
    shortcut,
    enabled: ({ activeRepository, navigate }) => Boolean(activeRepository && navigate),
    run: ({ navigate }) => navigate(view),
  }));
}
