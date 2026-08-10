import { useCallback, useEffect, useRef, useState } from "react";
import { api, isDemo } from "@/lib/api";
import { AppShell } from "@/app/AppShell";
import { MAX_OPEN_SESSIONS, useWorkspaceStore } from "@/app/workspace-store";
import { getRepositoryRefreshPlan, mergeRepositoryRefreshPlans } from "@/app/repository-refresh-plan";

function App() {
  const workspaceStorage = !isDemo && typeof window !== "undefined" ? window.localStorage : null;
  const { state, activeSession, actions, findRepository } = useWorkspaceStore({ storage: workspaceStorage });
  const data = activeSession?.snapshot ?? null;
  const [theme, setTheme] = useState(() => localStorage.getItem("repo-atlas-theme") || "dark");
  const initialized = useRef(false);
  const quickFileRequest = useRef(0);
  const sessionsRef = useRef(state.sessions);
  const watchedSessionIdsRef = useRef(new Set());
  const refreshQueuesRef = useRef(new Map());
  const completedOperationIdsRef = useRef(new Set());
  const [operationMode, setOperationMode] = useState(() => (isDemo ? "read-only" : null));
  sessionsRef.current = state.sessions;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("repo-atlas-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (typeof api.getOperationMode !== "function") return undefined;
    let mounted = true;
    void api.getOperationMode().then((response) => {
      if (!mounted || response?.ok === false) return;
      const value = response?.data?.operationMode ?? response?.data?.mode ?? response?.data;
      if (value === "read-only" || value === "safe-write") setOperationMode(value);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const loadRepository = useCallback(
    async (repositoryPath, { forceReload = false, refresh = false, sessionId = null } = {}) => {
      const existing = sessionId ? state.sessions.find((session) => session.id === sessionId) : findRepository(repositoryPath);
      if (existing?.status === "ready" && !forceReload && !refresh) {
        actions.activateSession(existing.id);
        return;
      }

      if (refresh && sessionId) actions.refreshRepository(sessionId);
      else actions.openRepository(repositoryPath, forceReload);
      try {
        const response = await api.scanRepository(repositoryPath);
        if (!response?.ok) {
          if (refresh) actions.refreshFailed(repositoryPath, response?.error || { message: "Repository scan failed.", code: "SCAN_FAILED" });
          else actions.loadFailed(repositoryPath, response?.error || { message: "Repository scan failed.", code: "SCAN_FAILED" });
          return;
        }
        if (refresh) actions.refreshSucceeded(repositoryPath, response.data);
        else actions.loadSucceeded(repositoryPath, response.data);
      } catch (scanError) {
        const error = {
          message: scanError?.message || "Repository scan failed.",
          code: "SCAN_FAILED",
        };
        if (refresh) actions.refreshFailed(repositoryPath, error);
        else actions.loadFailed(repositoryPath, error);
      }
    },
    [actions, findRepository, state.sessions],
  );

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (isDemo) loadRepository(undefined);
    else if (activeSession?.status === "created" && activeSession.path) loadRepository(activeSession.path);
  }, [activeSession, isDemo, loadRepository]);

  const handleOpen = async () => {
    if (state.sessions.length >= MAX_OPEN_SESSIONS && !window.confirm("Opening more than 10 repositories may increase memory usage. Continue?")) {
      return;
    }
    const repositoryPath = await api.openRepository();
    if (repositoryPath) await loadRepository(repositoryPath);
  };

  const handleRefresh = useCallback(() => {
    if (activeSession?.path) loadRepository(activeSession.path, { refresh: true, sessionId: activeSession.id });
  }, [activeSession, loadRepository]);

  const enqueueRepositoryChange = useCallback(
    (event) => {
      if (!event?.kind || typeof api.refreshRepositoryPartial !== "function") return;
      if (event.transactionId && completedOperationIdsRef.current.has(event.transactionId)) {
        completedOperationIdsRef.current.delete(event.transactionId);
        return;
      }
      const session = sessionsRef.current.find(
        (candidate) => candidate.id === event.sessionId || candidate.path === event.repositoryPath,
      );
      if (!session?.snapshot || !session.path) return;
      const eventPlans = (Array.isArray(event.kinds) && event.kinds.length > 0 ? event.kinds : [event.kind])
        .map((kind) => getRepositoryRefreshPlan(kind))
        .filter(Boolean);
      const plan = mergeRepositoryRefreshPlans(eventPlans);
      if (!plan) return;

      let queue = refreshQueuesRef.current.get(session.id);
      if (!queue) {
        queue = {
          sessionId: session.id,
          repositoryPath: session.path,
          parts: new Set(),
          events: [],
          running: false,
        };
        refreshQueuesRef.current.set(session.id, queue);
      }
      for (const part of plan.parts) queue.parts.add(part);
      queue.events.push(event);
      if (queue.running) return;

      queue.running = true;
      void (async () => {
        try {
          while (queue.parts.size > 0) {
            const parts = [...queue.parts];
            queue.parts.clear();
            const events = queue.events.splice(0);
            const response = await api.refreshRepositoryPartial({ repositoryPath: queue.repositoryPath, parts });
            if (response?.ok === false) {
              actions.partialRefreshFailed(queue.sessionId, response.error ?? { message: "Automatic refresh failed.", code: "REFRESH_FAILED" });
              break;
            }
            const payload = response?.data ?? response;
            actions.partialRefreshSucceeded(
              queue.sessionId,
              payload?.data ?? payload,
              events.at(-1) ?? event,
              payload?.parts ?? parts,
            );
          }
        } catch (refreshError) {
          actions.partialRefreshFailed(queue.sessionId, {
            message: refreshError?.message || "Automatic refresh failed.",
            code: "REFRESH_FAILED",
          });
        } finally {
          if (refreshQueuesRef.current.get(queue.sessionId) === queue) refreshQueuesRef.current.delete(queue.sessionId);
        }
      })();
    },
    [actions],
  );

  const changeOperationMode = useCallback(async (mode) => {
    if (isDemo || typeof api.setOperationMode !== "function") return { ok: false, error: { message: "Demo mode is read-only.", code: "DEMO_MODE" } };
    try {
      const response = await api.setOperationMode({ mode });
      if (response?.ok !== false) {
        const nextMode = response?.data?.operationMode ?? response?.data?.mode ?? mode;
        if (nextMode === "read-only" || nextMode === "safe-write") setOperationMode(nextMode);
      }
      return response;
    } catch (error) {
      return {
        ok: false,
        error: { message: error?.message || "Operation policy could not be changed.", code: "POLICY_FAILED" },
      };
    }
  }, []);

  const runWorkspaceOperation = useCallback(
    async (sessionId, operation, paths) => {
      const session = state.sessions.find((candidate) => candidate.id === sessionId);
      const isHunkOperation = operation === "stage-hunk" || operation === "unstage-hunk";
      const isUnstageOperation = operation === "unstage" || operation === "unstage-hunk";
      const method = isHunkOperation
        ? isUnstageOperation
          ? api.unstageHunk
          : api.stageHunk
        : isUnstageOperation
          ? api.unstageFiles
          : api.stageFiles;
      if (!session?.path || typeof method !== "function") {
        const error = { message: "Workspace operation is unavailable.", code: "OPERATION_UNAVAILABLE" };
        actions.workspaceOperationFailed(sessionId, error);
        return { ok: false, error };
      }
      try {
        const request = isHunkOperation
          ? {
              sessionId,
              repositoryPath: session.path,
              path: paths?.path,
              hunkId: paths?.hunkId,
              source: paths?.source,
            }
          : { sessionId, repositoryPath: session.path, paths };
        const response = await method(request);
        if (response?.ok === false) {
          actions.workspaceOperationFailed(sessionId, response.error ?? { message: "Workspace operation failed.", code: "OPERATION_FAILED" });
          return response;
        }
        const payload = response?.data ?? response;
        if (payload?.transactionId) {
          completedOperationIdsRef.current.add(payload.transactionId);
          setTimeout(() => completedOperationIdsRef.current.delete(payload.transactionId), 5_000);
        }
        actions.workspaceOperationSucceeded(sessionId, payload);
        return response;
      } catch (operationError) {
        const error = { message: operationError?.message || "Workspace operation failed.", code: "OPERATION_FAILED" };
        actions.workspaceOperationFailed(sessionId, error);
        return { ok: false, error };
      }
    },
    [actions, state.sessions],
  );

  useEffect(() => {
    if (typeof api.startRepositoryWatch !== "function") return undefined;
    const readySessions = state.sessions.filter((candidate) => candidate.path && candidate.snapshot);
    const readyIds = new Set(readySessions.map((candidate) => candidate.id));

    for (const session of readySessions) {
      if (watchedSessionIdsRef.current.has(session.id)) continue;
      watchedSessionIdsRef.current.add(session.id);
      void api
        .startRepositoryWatch({ sessionId: session.id, repositoryPath: session.path, mode: "smart" })
        .then((response) => {
          if (response?.ok === false) {
            actions.setWatchError(session.id, response.error ?? { message: "Automatic refresh could not start.", code: "WATCH_START_FAILED" });
            return;
          }
          if (response?.data) actions.setWatchStatus(session.id, response.data);
        })
        .catch((watchError) => {
          actions.setWatchError(session.id, {
            message: watchError?.message || "Automatic refresh could not start.",
            code: "WATCH_START_FAILED",
          });
        });
    }

    for (const sessionId of watchedSessionIdsRef.current) {
      if (readyIds.has(sessionId)) continue;
      watchedSessionIdsRef.current.delete(sessionId);
      void api.stopRepositoryWatch?.(sessionId);
      refreshQueuesRef.current.delete(sessionId);
    }
    return undefined;
  }, [actions, state.sessions]);

  useEffect(() => {
    if (typeof api.stopRepositoryWatch !== "function") return undefined;
    return () => {
      const sessionIds = [...watchedSessionIdsRef.current];
      watchedSessionIdsRef.current.clear();
      for (const sessionId of sessionIds) void api.stopRepositoryWatch(sessionId);
      refreshQueuesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const unsubscribeChanged = api.onRepositoryChanged?.(enqueueRepositoryChange);
    const unsubscribeStatus = api.onRepositoryWatchStatus?.((status) => {
      if (status?.sessionId) actions.setWatchStatus(status.sessionId, status);
    });
    const unsubscribeError = api.onRepositoryWatchError?.((watchError) => {
      if (watchError?.sessionId) actions.setWatchError(watchError.sessionId, watchError);
    });
    return () => {
      unsubscribeChanged?.();
      unsubscribeStatus?.();
      unsubscribeError?.();
    };
  }, [actions, enqueueRepositoryChange]);

  const watchedSessions = state.sessions.filter((candidate) => candidate.path && candidate.snapshot);
  const watchedSessionKey = watchedSessions.map((candidate) => candidate.id).join("\0");
  useEffect(() => {
    if (typeof api.setRepositoryWatchActivity !== "function") return;
    for (const watchedSession of watchedSessions) {
      void api.setRepositoryWatchActivity({
        sessionId: watchedSession.id,
        active: watchedSession.id === state.activeSessionId,
      });
    }
  }, [state.activeSessionId, watchedSessionKey]);

  const activateRepository = useCallback(
    (sessionId) => {
      const target = state.sessions.find((session) => session.id === sessionId);
      if (!target) return;
      actions.activateSession(sessionId);
      if (target.path && ["created", "error", "stale"].includes(target.status)) {
        void loadRepository(target.path, { sessionId: target.id });
      }
    },
    [actions, loadRepository, state.sessions],
  );

  const openCompare = useCallback(
    (base, head) => {
      actions.setCompareInit({ base, head, nonce: Date.now() });
      actions.setActiveView("compare");
    },
    [actions],
  );

  const openCherryPick = useCallback(
    (hashes) => {
      if (hashes?.length > 0) actions.setCherryPick({ hashes, nonce: Date.now() });
    },
    [actions],
  );

  const showBranchInGraph = useCallback(
    (branchName) => {
      actions.setGraphRequest({ refs: [branchName], nonce: Date.now() });
      actions.setActiveView("commits");
    },
    [actions],
  );

  const focusCommitInGraph = useCallback(
    (hash) => {
      actions.setGraphRequest({ refs: null, focusHash: hash, nonce: Date.now() });
      actions.setActiveView("commits");
    },
    [actions],
  );

  const focusAuthorInGraph = useCallback(
    (author) => {
      actions.setGraphRequest({ refs: null, query: author, nonce: Date.now() });
      actions.setActiveView("commits");
    },
    [actions],
  );

  const showWorkspace = useCallback(() => actions.setActiveView("workspace"), [actions]);

  const quickOpenFile = useCallback(() => {
    if (!activeSession?.snapshot) return;
    quickFileRequest.current += 1;
    actions.setActiveView("files");
    actions.requestFileFilter(quickFileRequest.current);
  }, [actions, activeSession?.snapshot]);

  const openFile = useCallback(
    (filePath) => {
      if (!activeSession?.snapshot || !filePath) return;
      actions.setActiveView("files");
      actions.requestFileSelection(filePath, Date.now());
    },
    [actions, activeSession?.snapshot],
  );

  const openFileHistory = useCallback(
    (filePath, sessionId = null) => {
      const targetSession = sessionId ? state.sessions.find((candidate) => candidate.id === sessionId) : activeSession;
      if (!targetSession?.snapshot || !filePath) return;
      actions.setActiveView("files", sessionId);
      actions.requestFileSelection(filePath, Date.now(), true, sessionId);
    },
    [actions, activeSession, state.sessions],
  );

  const openFileAtRevision = useCallback(
    (revision, filePath, sessionId = null) => {
      const targetSession = sessionId ? state.sessions.find((candidate) => candidate.id === sessionId) : activeSession;
      if (!targetSession?.snapshot || !revision || !filePath) return;
      actions.setActiveView("files", sessionId);
      actions.requestFileSelection(filePath, Date.now(), false, sessionId, revision);
    },
    [actions, activeSession, state.sessions],
  );

  const openRecentRepository = useCallback(
    (repositoryPath) => (repositoryPath ? loadRepository(repositoryPath) : handleOpen()),
    [handleOpen, loadRepository],
  );

  const revealRecentRepository = useCallback((repositoryPath) => api.revealRepository(repositoryPath), []);

  const locateMissingRepository = useCallback(
    async (sessionId) => {
      const repositoryPath = await api.openRepository();
      if (!repositoryPath) return;
      actions.closeRepository(sessionId);
      await loadRepository(repositoryPath);
    },
    [actions, loadRepository],
  );

  const removeMissingRepository = useCallback(
    (sessionId, repositoryPath) => {
      actions.removeRecent(repositoryPath);
      actions.closeRepository(sessionId);
    },
    [actions],
  );

  return (
    <AppShell
      session={activeSession}
      sessions={state.sessions}
      activeSessionId={state.activeSessionId}
      recentRepositories={state.recentRepositories}
      operationMode={operationMode}
      theme={theme}
      onThemeChange={setTheme}
      onOpen={handleOpen}
      onRefresh={handleRefresh}
      onNavigate={actions.setActiveView}
      onRequestNavigation={actions.requestNavigation}
      onCompare={openCompare}
      onCherryPick={openCherryPick}
      onShowBranchInGraph={showBranchInGraph}
      onFocusCommit={focusCommitInGraph}
      onFocusAuthor={focusAuthorInGraph}
      onShowWorkspace={showWorkspace}
      onQuickOpenFile={quickOpenFile}
      onOpenFile={openFile}
      onOpenFileHistory={openFileHistory}
      onOpenFileAtRevision={openFileAtRevision}
      onOpenPreviousRevision={openFileAtRevision}
      onFileHistoryChange={(sessionId, value) => actions.setFileHistory(value, sessionId)}
      onClearCherryPick={() => actions.setCherryPick(null)}
      onActivateRepository={activateRepository}
      onCloseRepository={actions.closeRepository}
      onOpenRecent={openRecentRepository}
      onPinRecent={actions.pinRecent}
      onRemoveRecent={actions.removeRecent}
      onRevealRecent={revealRecentRepository}
      onLocateMissing={locateMissingRepository}
      onRemoveMissing={removeMissingRepository}
      onSetOperationMode={changeOperationMode}
      onWorkspaceOperation={runWorkspaceOperation}
    />
  );
}

export default App;
