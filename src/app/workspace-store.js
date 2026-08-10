import { useMemo, useReducer } from "react";
import {
  createInitialWorkspaceState,
  workspaceReducer,
} from "./workspace-reducer";

export {
  DEFAULT_VIEW,
  createInitialWorkspaceState,
  createRepositorySession,
  getSessionId,
  workspaceReducer,
} from "./workspace-reducer";

export function useWorkspaceStore() {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, createInitialWorkspaceState);
  const activeSession = useMemo(
    () => (state.activeSessionId ? state.sessions.find((session) => session.id === state.activeSessionId) ?? null : null),
    [state],
  );

  const actions = useMemo(
    () => ({
      startLoading: (repositoryPath) => dispatch({ type: "session/load-start", repositoryPath }),
      loadSucceeded: (repositoryPath, data) => dispatch({ type: "session/load-success", repositoryPath, data }),
      loadFailed: (repositoryPath, error) => dispatch({ type: "session/load-failure", repositoryPath, error }),
      activateSession: (sessionId) => dispatch({ type: "session/activate", sessionId }),
      setActiveView: (view) => dispatch({ type: "session/set-view", view }),
      setGraphRequest: (request) => dispatch({ type: "session/set-graph-request", request }),
      setCompareInit: (initial) => dispatch({ type: "session/set-compare-init", initial }),
      setCherryPick: (value) => dispatch({ type: "session/set-cherry-pick", value }),
    }),
    [],
  );

  return { state, activeSession, actions };
}
