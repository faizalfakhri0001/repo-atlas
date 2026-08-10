import { createCommand } from "./command-registry.js";

function repositoryKey(path) {
  const value = String(path ?? "").trim();
  return /^[A-Za-z]:[\\/]|^\\\\/.test(value) ? value.toLowerCase() : value;
}

function repositoryLabel(repository) {
  return repository?.name || String(repository?.path ?? "Repository").split(/[\\/]/).filter(Boolean).at(-1) || "Repository";
}

export function createRepositoryCommands(context = {}) {
  const openSessionKeys = new Set((context.sessions ?? []).map((session) => repositoryKey(session.path)));
  const commands = [
    createCommand({
      id: "repository.open",
      label: "Open Repository",
      category: "Repository",
      keywords: ["folder", "directory", "project"],
      run: ({ openRepository }) => openRepository(),
      enabled: ({ openRepository }) => typeof openRepository === "function",
    }),
    createCommand({
      id: "repository.refresh",
      label: "Refresh Repository",
      category: "Repository",
      keywords: ["rescan", "reload", "update"],
      shortcut: ["mod", "r"],
      run: ({ refreshRepository }) => refreshRepository(),
      enabled: ({ activeRepository, refreshRepository }) => Boolean(activeRepository && refreshRepository),
    }),
    createCommand({
      id: "repository.reveal",
      label: "Reveal Current Repository",
      category: "Repository",
      keywords: ["finder", "explorer", "file manager", "show"],
      run: ({ activeRepository, revealRepository }) => revealRepository(activeRepository.rootPath),
      enabled: ({ activeRepository, revealRepository, isDemo }) => Boolean(!isDemo && activeRepository?.rootPath && revealRepository),
      visible: ({ isDemo }) => !isDemo,
    }),
    createCommand({
      id: "repository.close",
      label: "Close Current Repository",
      category: "Repository",
      keywords: ["remove", "tab"],
      run: ({ activeSession, closeRepository }) => closeRepository(activeSession.id),
      enabled: ({ activeSession, closeRepository }) => Boolean(activeSession?.id && closeRepository),
    }),
  ];

  for (const session of context.sessions ?? []) {
    const label = repositoryLabel(session);
    commands.push(createCommand({
      id: `repository.switch.${session.id}`,
      label: `Switch to ${label}`,
      category: "Repository",
      keywords: ["switch", "tab", label, session.path],
      run: ({ switchRepository }) => switchRepository(session.id),
      enabled: ({ switchRepository }) => Boolean(switchRepository),
      visible: ({ activeSession }) => activeSession?.id !== session.id,
    }));
  }

  for (const repository of context.recentRepositories ?? []) {
    if (!repository?.path || openSessionKeys.has(repositoryKey(repository.path))) continue;
    const label = repositoryLabel(repository);
    commands.push(createCommand({
      id: `repository.recent.${repository.path}`,
      label: `Open ${label}`,
      category: "Recent Repositories",
      keywords: ["recent", "open", label, repository.path],
      run: ({ openRecentRepository }) => openRecentRepository(repository.path),
      enabled: ({ openRecentRepository }) => Boolean(openRecentRepository),
    }));
  }

  return commands;
}
