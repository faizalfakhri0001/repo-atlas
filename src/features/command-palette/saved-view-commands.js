import { createCommand } from "./command-registry.js";

export function createSavedViewCommands(savedViews = []) {
  const commands = [
    createCommand({
      id: "saved-views.save-current",
      label: "Save Current View",
      category: "Saved Views",
      keywords: ["save", "view", "filter", "perspective"],
      enabled: ({ activeRepository, currentSavedView, saveCurrentView }) => Boolean(activeRepository && currentSavedView && saveCurrentView),
      run: ({ saveCurrentView }) => saveCurrentView(),
    }),
    createCommand({
      id: "saved-views.manage",
      label: "Manage Saved Views",
      category: "Saved Views",
      keywords: ["saved", "views", "filters", "manager"],
      enabled: ({ activeRepository, manageSavedViews }) => Boolean(activeRepository && manageSavedViews),
      run: ({ manageSavedViews }) => manageSavedViews(),
    }),
  ];

  for (const view of Array.isArray(savedViews) ? savedViews : []) {
    if (!view?.id || !view.name) continue;
    commands.push(createCommand({
      id: `saved-views.open.${view.id}`,
      label: `Open Saved View: ${view.name}`,
      category: "Saved Views",
      keywords: ["open", "saved", "view", view.name, view.viewType].filter(Boolean),
      enabled: ({ activeRepository, openSavedView }) => Boolean(activeRepository && openSavedView),
      run: ({ openSavedView }) => openSavedView(view),
    }));
  }
  return commands;
}
