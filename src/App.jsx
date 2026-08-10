import { useCallback, useEffect, useRef, useState } from "react";
import { api, isDemo } from "@/lib/api";
import { AppShell } from "@/app/AppShell";
import { useWorkspaceStore } from "@/app/workspace-store";

function App() {
  const { activeSession, actions } = useWorkspaceStore();
  const data = activeSession?.snapshot ?? null;
  const [theme, setTheme] = useState(() => localStorage.getItem("repo-atlas-theme") || "dark");
  const initialized = useRef(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("repo-atlas-theme", theme);
  }, [theme]);

  const loadRepository = useCallback(
    async (repositoryPath) => {
      actions.startLoading(repositoryPath);
      try {
        const response = await api.scanRepository(repositoryPath);
        if (!response?.ok) {
          actions.loadFailed(repositoryPath, response?.error || { message: "Repository scan failed.", code: "SCAN_FAILED" });
          return;
        }
        actions.loadSucceeded(repositoryPath, response.data);
        localStorage.setItem("repo-atlas-last-repository", response.data.repository.rootPath);
      } catch (scanError) {
        actions.loadFailed(repositoryPath, {
          message: scanError?.message || "Repository scan failed.",
          code: "SCAN_FAILED",
        });
      }
    },
    [actions],
  );

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const recentPath = localStorage.getItem("repo-atlas-last-repository");
    if (recentPath || isDemo) loadRepository(recentPath ?? undefined);
  }, [loadRepository]);

  const handleOpen = async () => {
    const repositoryPath = await api.openRepository();
    if (repositoryPath) await loadRepository(repositoryPath);
  };

  const handleRefresh = useCallback(() => {
    if (data?.repository?.rootPath) loadRepository(data.repository.rootPath);
  }, [data, loadRepository]);

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

  return (
    <AppShell
      session={activeSession}
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
      onClearCherryPick={() => actions.setCherryPick(null)}
    />
  );
}

export default App;
