import { useCallback, useEffect, useRef, useState } from "react";
import { api, isDemo } from "@/lib/api";
import { AppShell } from "@/app/AppShell";
import { MAX_OPEN_SESSIONS, useWorkspaceStore } from "@/app/workspace-store";

function App() {
  const workspaceStorage = !isDemo && typeof window !== "undefined" ? window.localStorage : null;
  const { state, activeSession, actions, findRepository } = useWorkspaceStore({ storage: workspaceStorage });
  const data = activeSession?.snapshot ?? null;
  const [theme, setTheme] = useState(() => localStorage.getItem("repo-atlas-theme") || "dark");
  const initialized = useRef(false);
  const quickFileRequest = useRef(0);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("repo-atlas-theme", theme);
  }, [theme]);

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
      actions.setGraphRequest({ focusHash: hash, nonce: Date.now() });
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
      theme={theme}
      onThemeChange={setTheme}
      onOpen={handleOpen}
      onRefresh={handleRefresh}
      onNavigate={actions.setActiveView}
      onCompare={openCompare}
      onCherryPick={openCherryPick}
      onShowBranchInGraph={showBranchInGraph}
      onFocusCommit={focusCommitInGraph}
      onShowWorkspace={showWorkspace}
      onQuickOpenFile={quickOpenFile}
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
    />
  );
}

export default App;
