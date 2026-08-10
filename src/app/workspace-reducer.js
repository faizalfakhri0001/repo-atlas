export const DEFAULT_VIEW = "overview";

function normalizeRepositoryPath(repositoryPath) {
  if (typeof repositoryPath !== "string") return null;
  const normalized = repositoryPath.trim();
  return normalized || null;
}

export function getSessionId(repositoryPath) {
  return normalizeRepositoryPath(repositoryPath) ?? "demo";
}

function repositoryName(repositoryPath) {
  const normalized = normalizeRepositoryPath(repositoryPath);
  if (!normalized) return "Demo repository";
  return normalized.split(/[\\/]/).filter(Boolean).at(-1) ?? "Repository";
}

export function createRepositorySession(repositoryPath, lastActivatedAt = Date.now()) {
  const path = normalizeRepositoryPath(repositoryPath);
  return {
    id: getSessionId(path),
    path,
    name: repositoryName(path),
    snapshot: null,
    loading: false,
    error: null,
    activeView: DEFAULT_VIEW,
    ui: {
      graphRequest: null,
      compareInit: null,
      cherryPick: null,
    },
    lastActivatedAt,
  };
}

export function createInitialWorkspaceState() {
  return {
    activeSessionId: null,
    sessions: [],
    recentRepositories: [],
  };
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
  const sessionId = getSessionId(repositoryPath);
  if (findSession(state, sessionId)) return { state, sessionId };

  return {
    state: {
      ...state,
      sessions: [...state.sessions, createRepositorySession(repositoryPath, lastActivatedAt)],
    },
    sessionId,
  };
}

export function workspaceReducer(state, action) {
  switch (action.type) {
    case "session/load-start": {
      const lastActivatedAt = action.lastActivatedAt ?? Date.now();
      const ensured = ensureSession(state, action.repositoryPath, lastActivatedAt);
      const nextState = updateSession(ensured.state, ensured.sessionId, (session) => ({
        ...session,
        path: normalizeRepositoryPath(action.repositoryPath) ?? session.path,
        loading: true,
        error: null,
        lastActivatedAt,
      }));
      return { ...nextState, activeSessionId: ensured.sessionId };
    }

    case "session/load-success": {
      const repositoryPath = action.repositoryPath ?? action.data?.repository?.rootPath;
      const ensured = ensureSession(state, repositoryPath, action.lastActivatedAt ?? Date.now());
      const repository = action.data?.repository ?? {};
      const nextState = updateSession(ensured.state, ensured.sessionId, (session) => ({
        ...session,
        path: repository.rootPath ?? session.path,
        name: repository.name ?? session.name,
        snapshot: action.data ?? null,
        loading: false,
        error: null,
        lastActivatedAt: action.lastActivatedAt ?? session.lastActivatedAt,
      }));
      return { ...nextState, activeSessionId: ensured.sessionId };
    }

    case "session/load-failure": {
      const ensured = ensureSession(state, action.repositoryPath, action.lastActivatedAt ?? Date.now());
      const nextState = updateSession(ensured.state, ensured.sessionId, (session) => ({
        ...session,
        loading: false,
        error: action.error ?? { message: "Repository scan failed.", code: "SCAN_FAILED" },
        lastActivatedAt: action.lastActivatedAt ?? session.lastActivatedAt,
      }));
      return { ...nextState, activeSessionId: ensured.sessionId };
    }

    case "session/activate": {
      if (!findSession(state, action.sessionId)) return state;
      const lastActivatedAt = action.lastActivatedAt ?? Date.now();
      return {
        ...updateSession(state, action.sessionId, (session) => ({ ...session, lastActivatedAt })),
        activeSessionId: action.sessionId,
      };
    }

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

    case "workspace/reset":
      return createInitialWorkspaceState();

    default:
      return state;
  }
}
