import { useEffect, useMemo, useReducer } from "react";
import {
  createInitialWorkspaceState,
  findRepositorySession,
  workspaceReducer,
} from "./workspace-reducer";
import {
  loadRecentRepositories,
  loadWorkspaceMetadata,
  saveRecentRepositories,
  saveWorkspaceMetadata,
} from "./workspace-persistence";

export {
  DEFAULT_VIEW,
  createInitialWorkspaceState,
  createRepositorySession,
  findRepositorySession,
  getSessionId,
  getRepositoryName,
  MAX_OPEN_SESSIONS,
  mergeRepositorySnapshot,
  workspaceReducer,
} from "./workspace-reducer";
export * from "./workspace-persistence";

function initializeWorkspaceState(storage) {
  const workspace = loadWorkspaceMetadata(storage);
  const recentRepositories = loadRecentRepositories(storage);
  return createInitialWorkspaceState({ ...workspace, recentRepositories });
}

export function useWorkspaceStore({ storage = null } = {}) {
  const [state, dispatch] = useReducer(workspaceReducer, storage, initializeWorkspaceState);
  const activeSession = useMemo(
    () => (state.activeSessionId ? state.sessions.find((session) => session.id === state.activeSessionId) ?? null : null),
    [state],
  );

  useEffect(() => {
    saveWorkspaceMetadata(storage, state);
  }, [storage, state.activeSessionId, state.sessions]);

  useEffect(() => {
    saveRecentRepositories(storage, state.recentRepositories);
  }, [storage, state.recentRepositories]);

  const actions = useMemo(
    () => ({
      openRepository: (repositoryPath, forceReload = false) => dispatch({ type: "SESSION_OPEN_REQUEST", repositoryPath, forceReload }),
      startLoading: (repositoryPath) => dispatch({ type: "session/load-start", repositoryPath }),
      loadSucceeded: (repositoryPath, data) => dispatch({ type: "SESSION_OPEN_SUCCESS", repositoryPath, data }),
      loadFailed: (repositoryPath, error) => dispatch({ type: "SESSION_OPEN_ERROR", repositoryPath, error }),
      refreshRepository: (sessionId) => dispatch({ type: "SESSION_REFRESH_REQUEST", sessionId }),
      refreshSucceeded: (repositoryPath, data) => dispatch({ type: "SESSION_REFRESH_SUCCESS", repositoryPath, data }),
      refreshFailed: (repositoryPath, error) => dispatch({ type: "SESSION_REFRESH_ERROR", repositoryPath, error }),
      activateSession: (sessionId) => dispatch({ type: "session/activate", sessionId }),
      closeRepository: (sessionId) => dispatch({ type: "SESSION_CLOSE", sessionId }),
      pinRecent: (repositoryPath, pinned) => dispatch({ type: "RECENT_PIN", repositoryPath, pinned }),
      removeRecent: (repositoryPath) => dispatch({ type: "RECENT_REMOVE", repositoryPath }),
      upsertRecent: (repository, lastOpenedAt) => dispatch({ type: "RECENT_UPSERT", repository, lastOpenedAt }),
      restoreWorkspace: (metadata) => dispatch({ type: "WORKSPACE_RESTORE", ...metadata }),
      setActiveView: (view, sessionId = null) => dispatch({ type: "session/set-view", view, sessionId }),
      requestNavigation: (view, payload = {}, sessionId = null) => dispatch({ type: "session/request-navigation", view, payload, sessionId, nonce: Date.now() }),
      setGraphRequest: (request) => dispatch({ type: "session/set-graph-request", request }),
      setCompareInit: (initial) => dispatch({ type: "session/set-compare-init", initial }),
      setCherryPick: (value) => dispatch({ type: "session/set-cherry-pick", value }),
      setFileHistory: (value, sessionId = null) => dispatch({ type: "session/set-file-history", value, sessionId }),
      requestFileFilter: (nonce = Date.now()) => dispatch({ type: "session/request-file-filter", nonce }),
      requestFileSelection: (path, nonce = Date.now(), openHistory = false, sessionId = null, revision = null) => dispatch({ type: "session/request-file-selection", path, nonce, openHistory, sessionId, revision }),
      setWatchStatus: (sessionId, status) => dispatch({ type: "session/set-watch-status", sessionId, status }),
      setWatchError: (sessionId, error) => dispatch({ type: "session/set-watch-error", sessionId, error }),
      partialRefreshSucceeded: (sessionId, data, event, parts = null) => dispatch({ type: "session/partial-refresh-success", sessionId, data, event, parts }),
      partialRefreshFailed: (sessionId, error) => dispatch({ type: "session/partial-refresh-failure", sessionId, error }),
    }),
    [],
  );

  return { state, activeSession, actions, findRepository: (repositoryPath) => findRepositorySession(state, repositoryPath) };
}
