export const DEFAULT_VIEW = "overview";
export const MAX_OPEN_SESSIONS = 10;
import {
  removeRecentRepository,
  setRecentPinned,
  upsertRecentRepository,
} from "./workspace-persistence.js";

function normalizeRepositoryPath(repositoryPath) {
  if (typeof repositoryPath !== "string") return null;
  const normalized = repositoryPath.trim();
  return normalized || null;
}

export function getSessionId(repositoryPath) {
  const normalized = normalizeRepositoryPath(repositoryPath);
  if (!normalized) return "demo";
  return /^[A-Za-z]:[\\/]|^\\\\/.test(normalized) ? normalized.toLowerCase() : normalized;
}

export function getRepositoryName(repositoryPath) {
  const normalized = normalizeRepositoryPath(repositoryPath);
  if (!normalized) return "Demo repository";
  return normalized.split(/[\\/]/).filter(Boolean).at(-1) ?? "Repository";
}

export function createRepositorySession(repositoryPath, lastActivatedAt = Date.now()) {
  const path = normalizeRepositoryPath(repositoryPath);
  return {
    id: getSessionId(path),
    path,
    name: getRepositoryName(path),
    snapshot: null,
    status: "created",
    loading: false,
    error: null,
    activeView: DEFAULT_VIEW,
    ui: {
      graphRequest: null,
      compareInit: null,
      cherryPick: null,
      fileHistory: null,
      fileFilterRequest: null,
      fileSelectionRequest: null,
    },
    lastActivatedAt,
  };
}

export function createInitialWorkspaceState({ openPaths = [], activePath = null, recentRepositories = [], lastActivatedAt = Date.now() } = {}) {
  const sessions = [];
  const seen = new Set();
  for (const path of openPaths) {
    const session = createRepositorySession(path, lastActivatedAt);
    if (seen.has(session.id)) continue;
    seen.add(session.id);
    sessions.push(session);
  }

  const activeSessionId = activePath && seen.has(getSessionId(activePath)) ? getSessionId(activePath) : null;
  return {
    activeSessionId,
    sessions,
    recentRepositories: Array.isArray(recentRepositories) ? recentRepositories : [],
  };
}

export function findRepositorySession(state, repositoryPath) {
  const sessionId = getSessionId(repositoryPath);
  return state.sessions.find((session) => session.id === sessionId || getSessionId(session.path) === sessionId) ?? null;
}

function findSession(state, sessionId) {
  return state.sessions.find((session) => session.id === sessionId) ?? null;
}

function updateSession(state, sessionId, update) {
  const index = state.sessions.findIndex((session) => session.id === sessionId);
  if (index < 0) return state;

  const session = state.sessions[index];
  const nextSession = update(session);
  if (nextSession === session) return state;

  const sessions = state.sessions.slice();
  sessions[index] = nextSession;
  return { ...state, sessions };
}

function ensureSession(state, repositoryPath, lastActivatedAt) {
  const existing = findRepositorySession(state, repositoryPath);
  if (existing) return { state, sessionId: existing.id };

  const session = createRepositorySession(repositoryPath, lastActivatedAt);
  return {
    state: { ...state, sessions: [...state.sessions, session] },
    sessionId: session.id,
  };
}

function startSession(state, sessionId, lastActivatedAt) {
  return updateSession(state, sessionId, (session) => ({
    ...session,
    status: "loading",
    loading: true,
    error: null,
    lastActivatedAt,
  }));
}

function replaceSession(sessions, sessionId, nextSession) {
  const index = sessions.findIndex((session) => session.id === sessionId);
  if (index < 0) return [...sessions, nextSession];
  const nextSessions = sessions.slice();
  nextSessions[index] = nextSession;
  return nextSessions;
}

function applyLoadSuccess(state, action) {
  const timestamp = action.lastActivatedAt ?? Date.now();
  const requestedPath = action.repositoryPath ?? action.data?.repository?.rootPath;
  const ensured = ensureSession(state, requestedPath, timestamp);
  const requestedSession = findSession(ensured.state, ensured.sessionId);
  const repository = action.data?.repository ?? {};
  const canonicalPath = normalizeRepositoryPath(repository.rootPath) ?? requestedSession?.path ?? requestedPath;
  const canonicalId = getSessionId(canonicalPath);
  const existingCanonical = findSession(ensured.state, canonicalId);
  const baseSession = existingCanonical && existingCanonical.id !== ensured.sessionId ? existingCanonical : requestedSession;
  const sessionsWithoutRequested =
    existingCanonical && existingCanonical.id !== ensured.sessionId
      ? ensured.state.sessions.filter((session) => session.id !== ensured.sessionId)
      : ensured.state.sessions;

  const nextSession = {
    ...(baseSession ?? createRepositorySession(canonicalPath, timestamp)),
    id: canonicalId,
    path: canonicalPath,
    name: repository.name ?? baseSession?.name ?? getRepositoryName(canonicalPath),
    snapshot: action.data ?? null,
    status: "ready",
    loading: false,
    error: null,
    lastActivatedAt: timestamp,
  };

  const sessions = replaceSession(
    sessionsWithoutRequested.map((session) => (session.id === ensured.sessionId ? { ...session, id: canonicalId } : session)),
    canonicalId,
    nextSession,
  );
  return {
    ...ensured.state,
    activeSessionId: canonicalId,
    sessions,
    recentRepositories: upsertRecentRepository(
      ensured.state.recentRepositories,
      {
        path: canonicalPath,
        name: repository.name,
        lastKnownBranch: repository.currentBranch,
      },
      timestamp,
    ),
  };
}

function applyLoadError(state, action) {
  const timestamp = action.lastActivatedAt ?? Date.now();
  const ensured = ensureSession(state, action.repositoryPath, timestamp);
  const nextState = updateSession(ensured.state, ensured.sessionId, (session) => ({
    ...session,
    status: session.snapshot ? "stale" : "error",
    loading: false,
    error: action.error ?? { message: "Repository scan failed.", code: "SCAN_FAILED" },
    lastActivatedAt: timestamp,
  }));
  return { ...nextState, activeSessionId: ensured.sessionId };
}

export function workspaceReducer(state, action) {
  switch (action.type) {
    case "SESSION_OPEN_REQUEST":
    case "session/load-start": {
      const timestamp = action.lastActivatedAt ?? Date.now();
      const ensured = ensureSession(state, action.repositoryPath, timestamp);
      const existing = findSession(ensured.state, ensured.sessionId);
      if (existing?.status === "ready" && !action.forceReload) {
        return workspaceReducer(ensured.state, { type: "SESSION_ACTIVATE", sessionId: ensured.sessionId, lastActivatedAt: timestamp });
      }
      const nextState = startSession(ensured.state, ensured.sessionId, timestamp);
      return { ...nextState, activeSessionId: ensured.sessionId };
    }

    case "SESSION_OPEN_SUCCESS":
    case "SESSION_REFRESH_SUCCESS":
    case "session/load-success":
      return applyLoadSuccess(state, action);

    case "SESSION_OPEN_ERROR":
    case "SESSION_REFRESH_ERROR":
    case "session/load-failure":
      return applyLoadError(state, action);

    case "SESSION_REFRESH_REQUEST": {
      const session = findSession(state, action.sessionId);
      if (!session) return state;
      const timestamp = action.lastActivatedAt ?? Date.now();
      const nextState = startSession(state, session.id, timestamp);
      return { ...nextState, activeSessionId: session.id };
    }

    case "SESSION_ACTIVATE":
    case "session/activate": {
      const session = findSession(state, action.sessionId);
      if (!session) return state;
      const timestamp = action.lastActivatedAt ?? Date.now();
      let nextState = state;
      if (state.activeSessionId && state.activeSessionId !== session.id) {
        nextState = updateSession(nextState, state.activeSessionId, (current) => ({
          ...current,
          ui: { ...current.ui, cherryPick: null },
        }));
      }
      nextState = updateSession(nextState, session.id, (current) => ({ ...current, lastActivatedAt: timestamp }));
      const activatedSession = findSession(nextState, session.id);
      const repository = activatedSession?.snapshot?.repository;
      return {
        ...nextState,
        activeSessionId: session.id,
        recentRepositories: repository
          ? upsertRecentRepository(
              nextState.recentRepositories,
              {
                path: repository.rootPath ?? activatedSession.path,
                name: repository.name ?? activatedSession.name,
                lastKnownBranch: repository.currentBranch,
              },
              timestamp,
            )
          : nextState.recentRepositories,
      };
    }

    case "SESSION_CLOSE": {
      if (!findSession(state, action.sessionId)) return state;
      const sessions = state.sessions.filter((session) => session.id !== action.sessionId);
      if (state.activeSessionId !== action.sessionId) return { ...state, sessions };
      const nextActive = sessions.slice().sort((a, b) => b.lastActivatedAt - a.lastActivatedAt)[0] ?? null;
      return { ...state, sessions, activeSessionId: nextActive?.id ?? null };
    }

    case "SESSION_MARK_STALE":
      return updateSession(state, action.sessionId, (session) => ({ ...session, status: "stale" }));

    case "RECENT_UPSERT":
      return {
        ...state,
        recentRepositories: upsertRecentRepository(state.recentRepositories, action.repository, action.lastOpenedAt),
      };

    case "RECENT_PIN":
      return {
        ...state,
        recentRepositories: setRecentPinned(state.recentRepositories, action.repositoryPath, action.pinned),
      };

    case "RECENT_REMOVE":
      return {
        ...state,
        recentRepositories: removeRecentRepository(state.recentRepositories, action.repositoryPath),
      };

    case "WORKSPACE_RESTORE":
      return createInitialWorkspaceState(action);

    case "session/set-view": {
      const sessionId = action.sessionId ?? state.activeSessionId;
      if (!sessionId) return state;
      return updateSession(state, sessionId, (session) => ({ ...session, activeView: action.view }));
    }

    case "session/set-graph-request": {
      const sessionId = action.sessionId ?? state.activeSessionId;
      if (!sessionId) return state;
      return updateSession(state, sessionId, (session) => ({
        ...session,
        ui: { ...session.ui, graphRequest: action.request },
      }));
    }

    case "session/set-compare-init": {
      const sessionId = action.sessionId ?? state.activeSessionId;
      if (!sessionId) return state;
      return updateSession(state, sessionId, (session) => ({
        ...session,
        ui: { ...session.ui, compareInit: action.initial },
      }));
    }

    case "session/set-cherry-pick": {
      const sessionId = action.sessionId ?? state.activeSessionId;
      if (!sessionId) return state;
      return updateSession(state, sessionId, (session) => ({
        ...session,
        ui: { ...session.ui, cherryPick: action.value },
      }));
    }

    case "session/set-file-history": {
      const sessionId = action.sessionId ?? state.activeSessionId;
      if (!sessionId) return state;
      return updateSession(state, sessionId, (session) => ({
        ...session,
        ui: { ...session.ui, fileHistory: action.value },
      }));
    }

    case "session/request-file-filter": {
      const sessionId = action.sessionId ?? state.activeSessionId;
      if (!sessionId) return state;
      return updateSession(state, sessionId, (session) => ({
        ...session,
        ui: { ...session.ui, fileFilterRequest: action.nonce ?? Date.now() },
      }));
    }

    case "session/request-file-selection": {
      const sessionId = action.sessionId ?? state.activeSessionId;
      if (!sessionId || !action.path) return state;
      return updateSession(state, sessionId, (session) => ({
        ...session,
        ui: {
          ...session.ui,
          fileSelectionRequest: { path: action.path, nonce: action.nonce ?? Date.now() },
        },
      }));
    }

    case "workspace/reset":
      return createInitialWorkspaceState();

    default:
      return state;
  }
}
