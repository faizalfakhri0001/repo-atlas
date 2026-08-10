export const WORKSPACE_STORAGE_KEY = "repo-atlas-workspace-v1";
export const RECENTS_STORAGE_KEY = "repo-atlas-recents-v1";
export const MAX_RECENT_REPOSITORIES = 20;

function normalizePath(value) {
  if (typeof value !== "string") return null;
  const path = value.trim();
  return path || null;
}

function pathKey(value) {
  const path = normalizePath(value);
  if (!path) return null;
  return /^[A-Za-z]:[\\/]|^\\\\/.test(path) ? path.toLowerCase() : path;
}

function nameFromPath(value) {
  const path = normalizePath(value);
  return path?.split(/[\\/]/).filter(Boolean).at(-1) ?? "Repository";
}

export function sortRecentRepositories(repositories) {
  return repositories.slice().sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.lastOpenedAt !== b.lastOpenedAt) return b.lastOpenedAt - a.lastOpenedAt;
    return a.name.localeCompare(b.name);
  });
}

export function limitRecentRepositories(repositories, max = MAX_RECENT_REPOSITORIES) {
  const sorted = sortRecentRepositories(repositories);
  if (sorted.length <= max) return sorted;
  const pinned = sorted.filter((repository) => repository.pinned);
  if (pinned.length >= max) return pinned;
  return [...pinned, ...sorted.filter((repository) => !repository.pinned).slice(0, max - pinned.length)];
}

export function normalizeRecentRepository(repository, fallbackOpenedAt = 0) {
  const path = normalizePath(repository?.path);
  if (!path) return null;
  return {
    path,
    name: normalizePath(repository?.name) ?? nameFromPath(path),
    lastKnownBranch: normalizePath(repository?.lastKnownBranch) ?? "",
    lastOpenedAt: Number.isFinite(Number(repository?.lastOpenedAt)) ? Number(repository.lastOpenedAt) : fallbackOpenedAt,
    pinned: Boolean(repository?.pinned),
  };
}

export function upsertRecentRepository(repositories, repository, lastOpenedAt = Date.now()) {
  const next = normalizeRecentRepository({ ...repository, lastOpenedAt }, lastOpenedAt);
  if (!next) return repositories;
  const key = pathKey(next.path);
  const merged = repositories
    .map((item) => normalizeRecentRepository(item))
    .filter(Boolean)
    .filter((item) => pathKey(item.path) !== key);
  const existing = repositories.find((item) => pathKey(item?.path) === key);
  return limitRecentRepositories([
    ...merged,
    {
      ...existing,
      ...next,
      pinned: existing?.pinned ?? next.pinned,
    },
  ]);
}

export function setRecentPinned(repositories, repositoryPath, pinned) {
  const key = pathKey(repositoryPath);
  return limitRecentRepositories(
    repositories
      .map((item) => normalizeRecentRepository(item))
      .filter(Boolean)
      .map((item) => (pathKey(item.path) === key ? { ...item, pinned: Boolean(pinned) } : item)),
  );
}

export function removeRecentRepository(repositories, repositoryPath) {
  const key = pathKey(repositoryPath);
  return repositories.filter((item) => pathKey(item?.path) !== key);
}

function readJson(storage, key, fallback) {
  if (!storage?.getItem) return fallback;
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function loadWorkspaceMetadata(storage) {
  const value = readJson(storage, WORKSPACE_STORAGE_KEY, {});
  const openPaths = Array.isArray(value?.openPaths) ? value.openPaths.map(normalizePath).filter(Boolean).slice(0, 10) : [];
  const activePath = normalizePath(value?.activePath);
  return {
    openPaths,
    activePath: activePath && openPaths.some((path) => pathKey(path) === pathKey(activePath)) ? activePath : null,
  };
}

export function loadRecentRepositories(storage) {
  const value = readJson(storage, RECENTS_STORAGE_KEY, []);
  const repositories = Array.isArray(value) ? value : value?.repositories;
  if (!Array.isArray(repositories)) return [];
  return limitRecentRepositories(repositories.map((item) => normalizeRecentRepository(item)).filter(Boolean));
}

export function serializeWorkspaceState(state) {
  const openPaths = state.sessions.map((session) => normalizePath(session.path)).filter(Boolean);
  const activeSession = state.sessions.find((session) => session.id === state.activeSessionId);
  return {
    activePath: normalizePath(activeSession?.path),
    openPaths: [...new Set(openPaths)],
  };
}

export function saveWorkspaceMetadata(storage, state) {
  if (!storage?.setItem) return;
  try {
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(serializeWorkspaceState(state)));
  } catch {
    // Persistence is best effort and must not prevent repository use.
  }
}

export function saveRecentRepositories(storage, repositories) {
  if (!storage?.setItem) return;
  try {
    storage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(limitRecentRepositories(repositories)));
  } catch {
    // Persistence is best effort and must not prevent repository use.
  }
}
