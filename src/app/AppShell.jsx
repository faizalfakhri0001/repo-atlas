import { useCallback, useMemo, useState } from "react";
import {
  Archive,
  Bookmark,
  Boxes,
  Cherry,
  CircleAlert,
  CircleDot,
  ExternalLink,
  Files,
  Flame,
  FlaskConical,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  HardDrive,
  HeartPulse,
  History as HistoryIcon,
  LayoutDashboard,
  LoaderCircle,
  Moon,
  Radio,
  RefreshCw,
  Sun,
  UsersRound,
  Workflow,
} from "lucide-react";
import { api, isDemo } from "@/lib/api";
import { RepositoryTabs } from "@/app/RepositoryTabs";
import { RecentRepositories } from "@/app/RecentRepositories";
import { RepositoryRecovery } from "@/app/RepositoryRecovery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Overview } from "@/components/overview";
import { CommitGraph } from "@/features/commits";
import { ReflogView } from "@/features/reflog";
import { BranchesView } from "@/features/branches";
import { CompareView } from "@/features/compare";
import { WorktreesView, SubmodulesView, RefsView } from "@/features/metadata";
import { WorkspaceView } from "@/features/workspace";
import { FileExplorer } from "@/features/files";
import { HotspotsView } from "@/features/hotspots";
import { OwnershipView } from "@/features/ownership";
import { HealthView } from "@/features/health";
import { GlobalSearch } from "@/features/search";
import { CherryPickDialog } from "@/components/cherry-pick-dialog";
import { StateBanner } from "@/features/repository";
import {
  CommandPalette,
  createCommandRegistry,
  createFileCommands,
  createNavigationCommands,
  createSavedViewCommands,
  createRepositoryCommands,
  createSearchCommands,
  useCommandPalette,
  useCommandPaletteShortcuts,
} from "@/features/command-palette";
import { SaveViewDialog, SavedViewNotice, SavedViewToolbar, SavedViewsView } from "@/components/saved-views-view";
import {
  configsEqual,
  getCurrentSavedViewSnapshot,
  getMissingSavedViewReferences,
  getSavedViewNavigation,
  getSavedViewTypeLabel,
  savedViewMatchesCurrent,
  useSavedViews,
} from "@/features/saved-views";
import { cn, formatRelativeDate, truncateMiddle } from "@/lib/utils";

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "health", label: "Health", icon: HeartPulse },
  { id: "commits", label: "Commits", icon: GitCommitHorizontal },
  { id: "reflog", label: "Reflog", icon: HistoryIcon },
  { id: "files", label: "Files", icon: Files },
  { id: "hotspots", label: "Hotspots", icon: Flame },
  { id: "ownership", label: "Ownership", icon: UsersRound },
  { id: "branches", label: "Branches", icon: GitBranch },
  { id: "compare", label: "Compare / PR", icon: GitCompareArrows },
  { id: "worktrees", label: "Worktrees", icon: Workflow },
  { id: "submodules", label: "Submodules", icon: Boxes },
  { id: "workspace", label: "Workspace", icon: CircleDot },
  { id: "refs", label: "Refs & Metadata", icon: Archive },
];

export function AppShell({
  session,
  sessions = [],
  activeSessionId,
  operationMode,
  theme,
  onThemeChange,
  onOpen,
  onRefresh,
  onNavigate,
  onRequestNavigation,
  onCompare,
  onCherryPick,
  onShowBranchInGraph,
  onFocusCommit,
  onFocusAuthor,
  onShowWorkspace,
  onQuickOpenFile,
  onOpenFile,
  onFileHistoryChange,
  onOpenFileHistory,
  onOpenFileAtRevision,
  onOpenPreviousRevision,
  onClearCherryPick,
  onActivateRepository,
  onCloseRepository,
  recentRepositories = [],
  onOpenRecent,
  onPinRecent,
  onRemoveRecent,
  onRevealRecent,
  onLocateMissing,
  onRemoveMissing,
  onSetOperationMode,
  onWorkspaceOperation,
}) {
  const data = session?.snapshot ?? null;
  const loading = session?.loading ?? false;
  const error = session?.error ?? null;
  const activeView = session?.activeView;
  const cherryPick = session?.ui.cherryPick ?? null;
  const watchStatus = session?.ui?.watchStatus ?? null;
  const watchError = session?.ui?.watchError ?? null;
  const watchLabel = watchError
    ? "Auto refresh error"
    : watchStatus?.polling
      ? "Fallback polling"
      : watchStatus?.watching
        ? watchStatus.active === false
          ? "Paused"
          : "Watching"
        : watchStatus
          ? "Auto refresh off"
          : null;
  const watchVariant = watchError ? "destructive" : watchStatus?.polling ? "warning" : watchStatus?.watching ? "success" : "muted";
  const selectedSessionId = activeSessionId ?? session?.id;
  const workspaceSessions = useMemo(() => (sessions.length > 0 ? sessions : session ? [session] : []), [session, sessions]);
  const loadedSessions = workspaceSessions.filter((candidate) => candidate.snapshot);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchInitialQuery, setGlobalSearchInitialQuery] = useState("");
  const [openedSavedViewId, setOpenedSavedViewId] = useState(null);
  const [savedViewDialog, setSavedViewDialog] = useState(null);
  const [savedViewActionError, setSavedViewActionError] = useState(null);
  const savedViewsState = useSavedViews({ repositoryPath: data?.repository.rootPath });
  const currentSavedView = useMemo(
    () => getCurrentSavedViewSnapshot({
      activeView,
      graphRequest: session?.ui?.graphRequest,
      compareInit: session?.ui?.compareInit,
      navigationRequest: session?.ui?.navigationRequest,
    }),
    [activeView, session?.ui?.compareInit, session?.ui?.graphRequest, session?.ui?.navigationRequest],
  );
  const activeSavedView = useMemo(() => {
    if (!currentSavedView) return null;
    const opened = openedSavedViewId
      ? savedViewsState.savedViews.find((view) => view.id === openedSavedViewId && view.viewType === currentSavedView.viewType)
      : null;
    return opened ?? savedViewsState.savedViews.find((view) => savedViewMatchesCurrent(view, currentSavedView)) ?? null;
  }, [currentSavedView, openedSavedViewId, savedViewsState.savedViews]);
  const savedViewModified = Boolean(activeSavedView && currentSavedView && !configsEqual(activeSavedView.config, currentSavedView.config));

  const openGlobalSearch = useCallback(() => {
    if (data) {
      setGlobalSearchInitialQuery("");
      setGlobalSearchOpen(true);
    }
  }, [data]);

  const openSearchResult = useCallback(
    (result) => {
      if (!result) return;
      if (result.type === "file") onOpenFile?.(result.path);
      else if (result.type === "commit" || result.type === "tag") onFocusCommit?.(result.hash);
      else if (result.type === "branch") onShowBranchInGraph?.(result.name);
      else if (result.type === "author") onFocusAuthor?.(result.name);
    },
    [onFocusAuthor, onFocusCommit, onOpenFile, onShowBranchInGraph],
  );

  const navigateToView = useCallback(
    (view) => {
      setOpenedSavedViewId(null);
      setSavedViewActionError(null);
      onNavigate(view);
    },
    [onNavigate],
  );

  const requestNavigationToView = useCallback(
    (view, payload = {}) => {
      setSavedViewActionError(null);
      setOpenedSavedViewId(null);
      if (onRequestNavigation) onRequestNavigation(view, payload, selectedSessionId);
      else onNavigate(view);
    },
    [onNavigate, onRequestNavigation, selectedSessionId],
  );

  const manageSavedViews = useCallback(() => navigateToView("saved-views"), [navigateToView]);

  const openSavedView = useCallback(
    async (view) => {
      if (!view || !data) return;
      const missing = getMissingSavedViewReferences(view, data);
      if (missing.length > 0 && view.viewType === "compare") {
        setSavedViewActionError(`Cannot open ${view.name}: unavailable reference${missing.length === 1 ? "" : "s"} ${missing.join(", ")}.`);
        return;
      }
      const config = { ...(view.config ?? {}) };
      if (missing.length > 0) {
        const confirmed = typeof window === "undefined" || typeof window.confirm !== "function"
          ? false
          : window.confirm(`This saved view references ${missing.join(", ")}, which is not available anymore. Open without those filters?`);
        if (!confirmed) return;
        if (view.viewType === "commits" && Array.isArray(config.refs)) {
          config.refs = config.refs.filter((reference) => !missing.includes(reference));
          if (config.refs.length === 0) delete config.refs;
        }
        if (view.viewType === "reflog" && missing.includes(config.ref)) config.ref = "HEAD";
      }
      const nextView = { ...view, config };
      const navigation = getSavedViewNavigation(nextView);
      if (!navigation) return;
      setSavedViewActionError(null);
      setOpenedSavedViewId(view.id);
      void savedViewsState.touchSavedView(view).catch(() => {});
      if (view.viewType === "search") {
        setGlobalSearchInitialQuery(config.query ?? "");
        setGlobalSearchOpen(true);
      } else if (view.viewType === "compare" && config.base && config.head && onCompare) {
        onCompare(config.base, config.head);
      } else {
        requestNavigationToView(navigation.view, navigation.payload);
        setOpenedSavedViewId(view.id);
      }
    },
    [data, onCompare, requestNavigationToView, savedViewsState, selectedSessionId],
  );

  const openSaveDialog = useCallback((mode, target = null) => {
    if (!currentSavedView && mode !== "rename") {
      setSavedViewActionError("Open a filterable repository view before saving it.");
      return;
    }
    setSavedViewActionError(null);
    setSavedViewDialog({ mode, target });
  }, [currentSavedView]);

  const [savedViewBusy, setSavedViewBusy] = useState(false);
  const saveCurrentView = useCallback(async () => {
    if (!currentSavedView) return;
    if (activeSavedView && savedViewModified) {
      setSavedViewBusy(true);
      setSavedViewActionError(null);
      try {
        await savedViewsState.updateSavedView({
          id: activeSavedView.id,
          viewType: currentSavedView.viewType,
          configVersion: currentSavedView.configVersion,
          config: currentSavedView.config,
        });
      } catch (actionError) {
        setSavedViewActionError(actionError?.message ?? "Saved view could not be updated.");
      } finally {
        setSavedViewBusy(false);
      }
      return;
    }
    openSaveDialog(activeSavedView ? "saveAs" : "create", activeSavedView);
  }, [activeSavedView, currentSavedView, openSaveDialog, savedViewModified, savedViewsState]);

  const handleSavedViewDialogSubmit = useCallback(async ({ name, pinned }) => {
    if (!savedViewDialog) return;
    setSavedViewBusy(true);
    setSavedViewActionError(null);
    try {
      if (savedViewDialog.mode === "rename") {
        await savedViewsState.updateSavedView({ id: savedViewDialog.target.id, name });
        setSavedViewDialog(null);
      } else if (currentSavedView) {
        const result = await savedViewsState.createSavedView({
          name,
          viewType: currentSavedView.viewType,
          configVersion: currentSavedView.configVersion,
          config: currentSavedView.config,
          pinned,
        });
        setOpenedSavedViewId(result.savedView?.id ?? null);
        setSavedViewDialog(null);
      }
    } catch (actionError) {
      setSavedViewActionError(actionError?.message ?? "Saved view could not be saved.");
    } finally {
      setSavedViewBusy(false);
    }
  }, [currentSavedView, savedViewDialog, savedViewsState]);

  const saveAsNew = useCallback(() => openSaveDialog("saveAs", activeSavedView), [activeSavedView, openSaveDialog]);
  const revertSavedView = useCallback(() => {
    if (activeSavedView) void openSavedView(activeSavedView);
  }, [activeSavedView, openSavedView]);

  const renameSavedView = useCallback((view) => openSaveDialog("rename", view), [openSaveDialog]);
  const toggleSavedViewPin = useCallback(async (view) => {
    try {
      await savedViewsState.updateSavedView({ id: view.id, pinned: !view.pinned });
    } catch (actionError) {
      setSavedViewActionError(actionError?.message ?? "Saved view pin could not be changed.");
    }
  }, [savedViewsState]);
  const duplicateSavedView = useCallback(async (view) => {
    try {
      const result = await savedViewsState.duplicateSavedView(view);
      if (result.savedView?.id) setOpenedSavedViewId(result.savedView.id);
    } catch (actionError) {
      setSavedViewActionError(actionError?.message ?? "Saved view could not be duplicated.");
    }
  }, [savedViewsState]);
  const deleteSavedView = useCallback(async (view) => {
    if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(`Delete saved view “${view.name}”?`)) return;
    try {
      await savedViewsState.deleteSavedView(view.id);
      if (openedSavedViewId === view.id) setOpenedSavedViewId(null);
    } catch (actionError) {
      setSavedViewActionError(actionError?.message ?? "Saved view could not be deleted.");
    }
  }, [openedSavedViewId, savedViewsState]);

  const commandContext = useMemo(
    () => ({
      activeRepository: data?.repository ?? null,
      activeSession: session ?? null,
      activeView,
      sessions: workspaceSessions,
      recentRepositories,
      isDemo,
      navigate: navigateToView,
      openRepository: onOpen,
      refreshRepository: onRefresh,
      revealRepository: (repositoryPath) => api.revealRepository(repositoryPath),
      closeRepository: onCloseRepository,
      switchRepository: onActivateRepository,
      openRecentRepository: onOpenRecent,
      quickOpenFile: onQuickOpenFile,
      openGlobalSearch,
      currentSavedView,
      saveCurrentView,
      manageSavedViews,
      openSavedView,
    }),
    [activeView, currentSavedView, data?.repository, isDemo, manageSavedViews, navigateToView, onActivateRepository, onCloseRepository, onOpen, onOpenRecent, onQuickOpenFile, onRefresh, openGlobalSearch, openSavedView, recentRepositories, saveCurrentView, session, workspaceSessions],
  );
  const commandList = useMemo(
    () => createCommandRegistry([
      ...createNavigationCommands(),
      ...createSavedViewCommands(savedViewsState.savedViews),
      ...createRepositoryCommands(commandContext),
      ...createFileCommands(),
      ...createSearchCommands(),
    ]),
    [commandContext],
  );
  const palette = useCommandPalette({ commands: commandList, context: commandContext });
  useCommandPaletteShortcuts({
    commands: commandList,
    context: commandContext,
    onOpenPalette: palette.openPalette,
    onExecute: palette.executeCommand,
    open: palette.open || globalSearchOpen,
  });

  const counts = useMemo(
    () => ({
      commits: data?.repository.totalCommits ?? data?.commits.length,
      branches: data?.branches.length,
      worktrees: data?.worktrees.length,
      submodules: data?.submodules.length,
      workspace: data?.status.files.length,
      refs: data ? data.tags.length + data.stashes.length + data.remotes.length : undefined,
    }),
    [data],
  );

  const conflictCount = useMemo(
    () => data?.status.files.filter((file) => file.kind === "conflict").length ?? 0,
    [data],
  );
  const pinnedSavedViews = useMemo(
    () => savedViewsState.savedViews.filter((view) => view.pinned),
    [savedViewsState.savedViews],
  );

  const handleHealthNavigation = useCallback(
    (view, payload = {}) => {
      if (!view) return;
      requestNavigationToView(view, payload);
    },
    [requestNavigationToView],
  );

  return (
    <TooltipProvider delayDuration={350}>
      <div className="flex h-full min-h-0 bg-background text-foreground">
        <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card/55">
          <div className={cn("flex h-16 items-center gap-3 px-4", api.platform === "darwin" && "pt-3")}>
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <FolderGit2 className="size-5" />
            </div>
            <div>
              <div className="font-semibold tracking-tight">Repo Atlas</div>
              <div className="text-[11px] text-muted-foreground">Local Git visualizer</div>
            </div>
          </div>
          <Separator />

          {data ? (
            <div className="px-3 py-3.5">
              <div className="rounded-xl border border-border bg-background/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{data.repository.name}</div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground" title={data.repository.rootPath}>
                      {truncateMiddle(data.repository.rootPath, 22, 10)}
                    </div>
                  </div>
                  <span
                    title={data.repository.dirty ? "Uncommitted changes" : "Clean working tree"}
                    className={cn("size-2 shrink-0 rounded-full", data.repository.dirty ? "bg-amber-400" : "bg-emerald-400")}
                  />
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="muted" className="max-w-full truncate">
                    <GitBranch className="size-3" />
                    {data.repository.currentBranch}
                  </Badge>
                  {data.repository.ahead > 0 && <Badge variant="success">↑{data.repository.ahead}</Badge>}
                  {data.repository.behind > 0 && <Badge variant="warning">↓{data.repository.behind}</Badge>}
                </div>
              </div>
            </div>
          ) : (
            <div className="px-3 py-3.5">
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          <nav className="min-h-0 flex-1 space-y-0.5 overflow-auto px-3">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const count = counts[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!data}
                  onClick={() => navigateToView(item.id)}
                  className={cn(
                    "flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors disabled:opacity-40",
                    activeView === item.id && data
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  <span className="flex-1">{item.label}</span>
                  {Number.isFinite(count) && <span className="text-[11px] tabular-nums">{count.toLocaleString()}</span>}
                </button>
              );
            })}
            {data && (
              <div className="mt-4 border-t border-border/70 pt-3">
                <div className="mb-1 flex items-center justify-between px-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span>Saved Views</span>
                  <button type="button" className="text-[10px] normal-case tracking-normal text-primary hover:underline" onClick={manageSavedViews}>
                    Manage
                  </button>
                </div>
                {pinnedSavedViews.length === 0 ? (
                  <button
                    type="button"
                    className="flex h-8 w-full items-center gap-2 rounded-lg px-3 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={manageSavedViews}
                  >
                    <Bookmark className="size-3.5" />
                    No pinned views
                  </button>
                ) : (
                  pinnedSavedViews.map((view) => (
                    <button
                      key={view.id}
                      type="button"
                      className="flex h-8 w-full items-center gap-2 rounded-lg px-3 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                      onClick={() => openSavedView(view)}
                      title={view.name}
                    >
                      <Bookmark className="size-3.5 shrink-0 text-primary" />
                      <span className="truncate">{view.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </nav>

          <div className="border-t border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">Offline. No account required.</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun /> : <Moon />}
              </Button>
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/80 px-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="truncate text-sm font-medium">{data ? data.repository.name : "Select a project folder"}</div>
                {isDemo && (
                  <Badge variant="info">
                    <FlaskConical className="size-3" /> Demo data
                  </Badge>
                )}
                {!isDemo && watchLabel && (
                  <Badge variant={watchVariant} title={watchError?.message ?? watchStatus?.fallbackReason ?? undefined}>
                    {watchError ? <CircleAlert className="size-3" /> : <Radio className="size-3" />}
                    {watchLabel}
                  </Badge>
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {data
                  ? `Scanned ${formatRelativeDate(data.scannedAt)} · ${data.repository.shortHead} · ${data.repository.gitVersion.replace("git version ", "Git ")}${session?.ui?.lastRepositoryChange ? " · Updated just now" : ""}`
                  : "All repository data remains on this device."}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {data && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => api.revealRepository(data.repository.rootPath)}
                  title="Show in file manager"
                >
                  <ExternalLink />
                </Button>
              )}
              <Button variant="outline" onClick={onOpen} disabled={loading}>
                <FolderOpen /> Open Folder
              </Button>
              {data && (
                <Button onClick={onRefresh} disabled={loading}>
                  <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
                </Button>
              )}
            </div>
          </header>

          {sessions.length > 0 && (
            <RepositoryTabs
              sessions={sessions}
              activeSessionId={activeSessionId}
              onActivate={onActivateRepository}
              onClose={onCloseRepository}
              onOpen={onOpen}
            />
          )}

          {data && <StateBanner state={data.state} repoPath={data.repository.rootPath} conflictCount={conflictCount} onRefresh={onRefresh} />}

          <section className="min-h-0 flex-1">
            {loading && !data ? (
              <LoadingState />
            ) : error && !data ? (
              error.code === "PATH_NOT_FOUND" && session?.path ? (
                <RepositoryRecovery
                  repositoryPath={session.path}
                  onLocate={() => onLocateMissing(session.id)}
                  onRemove={() => onRemoveMissing(session.id, session.path)}
                />
              ) : (
                <ErrorState error={error} onOpen={onOpen} />
              )
            ) : !data ? (
              <RecentRepositories
                repositories={recentRepositories}
                loadingPath={session?.path}
                onOpenRepository={onOpenRecent}
                onPin={onPinRecent}
                onRemove={onRemoveRecent}
                onReveal={onRevealRecent}
              />
            ) : (
              loadedSessions.map((loadedSession) => (
                <div
                  key={loadedSession.id}
                  id={`repository-panel-${loadedSession.id}`}
                  role="tabpanel"
                  aria-labelledby={`repository-tab-${loadedSession.id}`}
                  className={cn("flex h-full min-h-0 flex-col", loadedSession.id !== selectedSessionId && "hidden")}
                >
                  <SavedViewToolbar
                    currentView={loadedSession.id === selectedSessionId ? currentSavedView : null}
                    activeSavedView={loadedSession.id === selectedSessionId ? activeSavedView : null}
                    modified={loadedSession.id === selectedSessionId && savedViewModified}
                    onSave={saveCurrentView}
                    onSaveAs={saveAsNew}
                    onRevert={revertSavedView}
                    disabled={savedViewBusy}
                  />
                  {savedViewActionError && loadedSession.id === selectedSessionId && (
                    <div role="alert" className="border-b border-amber-500/25 bg-amber-500/10 px-5 py-2 text-xs text-amber-400">{savedViewActionError}</div>
                  )}
                  <div className="min-h-0 flex-1">
                    <ViewHost
                      view={loadedSession.activeView}
                      data={loadedSession.snapshot}
                      revision={loadedSession.snapshot.scannedAt}
                      graphRequest={loadedSession.ui.graphRequest}
                      compareInit={loadedSession.ui.compareInit}
                      fileHistory={loadedSession.ui.fileHistory}
                      fileFilterRequest={loadedSession.ui.fileFilterRequest}
                      fileSelectionRequest={loadedSession.ui.fileSelectionRequest}
                      navigationRequest={loadedSession.ui.navigationRequest}
                      savedViews={savedViewsState.savedViews}
                      savedViewsLoading={savedViewsState.loading}
                      savedViewsError={savedViewsState.error}
                      savedViewsWarning={savedViewsState.warning}
                      operationMode={operationMode}
                      isDemo={isDemo}
                      operationError={loadedSession.ui.workspaceOperationError}
                      onSetOperationMode={onSetOperationMode}
                      onWorkspaceOperation={(operation, paths) => onWorkspaceOperation?.(loadedSession.id, operation, paths)}
                      onRefresh={onRefresh}
                      onCompare={onCompare}
                      onNavigate={navigateToView}
                      onCherryPick={onCherryPick}
                      onShowBranchInGraph={onShowBranchInGraph}
                      onFocusCommit={onFocusCommit}
                      onShowWorkspace={onShowWorkspace}
                      onFileHistoryChange={(value) => onFileHistoryChange?.(loadedSession.id, value)}
                      onOpenFileHistory={(path) => onOpenFileHistory?.(loadedSession.id, path)}
                      onOpenFileAtRevision={(revision, path) => onOpenFileAtRevision?.(revision, path, loadedSession.id)}
                      onOpenPreviousRevision={(revision, path) => onOpenPreviousRevision?.(revision, path, loadedSession.id)}
                      onHealthNavigate={handleHealthNavigation}
                      onReloadSavedViews={savedViewsState.reload}
                      onOpenSavedView={openSavedView}
                      onRenameSavedView={renameSavedView}
                      onDuplicateSavedView={duplicateSavedView}
                      onToggleSavedViewPin={toggleSavedViewPin}
                      onDeleteSavedView={deleteSavedView}
                      onCreateSavedView={() => openSaveDialog("create")}
                    />
                  </div>
                </div>
              ))
            )}
          </section>

          {error && data && (
            <div className="flex items-center gap-2 border-t border-red-500/20 bg-red-500/10 px-5 py-2 text-xs text-red-400">
              <CircleAlert className="size-4" />
              <span>{error.message}</span>
            </div>
          )}
        </main>

      {cherryPick && data && (
          <CherryPickDialog
            key={cherryPick.nonce}
            repoPath={data.repository.rootPath}
            hashes={cherryPick.hashes}
            currentBranch={data.repository.currentBranch}
            onClose={onClearCherryPick}
            onDone={onRefresh}
          />
        )}
      </div>
      <CommandPalette
        open={palette.open}
        onOpenChange={palette.handleOpenChange}
        query={palette.query}
        onQueryChange={palette.updateQuery}
        commands={palette.results}
        selectedIndex={palette.selectedIndex}
        onSelectedIndexChange={palette.setSelectedIndex}
        onExecute={palette.executeCommand}
        isCommandEnabled={palette.isCommandEnabled}
        executingId={palette.executingId}
        error={palette.error}
      />
      <GlobalSearch
        open={globalSearchOpen}
        onOpenChange={setGlobalSearchOpen}
        initialQuery={globalSearchInitialQuery}
        repositoryPath={data?.repository.rootPath}
        revision={data ? { head: data.repository.head, scannedAt: data.scannedAt } : null}
        onOpenResult={openSearchResult}
      />
      {savedViewDialog && (
        <SaveViewDialog
          open
          mode={savedViewDialog.mode}
          viewType={currentSavedView?.viewType ?? savedViewDialog.target?.viewType}
          initialName={savedViewDialog.mode === "rename" ? savedViewDialog.target?.name ?? "" : savedViewDialog.mode === "saveAs" ? `${savedViewDialog.target?.name ?? getSavedViewTypeLabel(currentSavedView?.viewType)} copy` : ""}
          initialPinned={savedViewDialog.target?.pinned ?? false}
          pending={savedViewBusy}
          onOpenChange={(open) => {
            if (!open && !savedViewBusy) setSavedViewDialog(null);
          }}
          onSubmit={handleSavedViewDialogSubmit}
        />
      )}
    </TooltipProvider>
  );
}

function ViewHost({
  view,
  data,
  revision,
  graphRequest,
  compareInit,
  onCompare,
  onNavigate,
  onCherryPick,
  onShowBranchInGraph,
  onFocusCommit,
  onShowWorkspace,
  fileHistory,
  fileFilterRequest,
  fileSelectionRequest,
  navigationRequest,
  savedViews,
  savedViewsLoading,
  savedViewsError,
  savedViewsWarning,
  operationMode,
  isDemo,
  operationError,
  onSetOperationMode,
  onWorkspaceOperation,
  onRefresh,
  onFileHistoryChange,
  onOpenFileHistory,
  onOpenFileAtRevision,
  onOpenPreviousRevision,
  onHealthNavigate,
  onReloadSavedViews,
  onOpenSavedView,
  onRenameSavedView,
  onDuplicateSavedView,
  onToggleSavedViewPin,
  onDeleteSavedView,
  onCreateSavedView,
}) {
  const effectiveGraphRequest = navigationRequest?.view === "commits"
    ? { ...navigationRequest.payload, query: navigationRequest.payload?.search ?? navigationRequest.payload?.query, nonce: navigationRequest.nonce }
    : graphRequest;
  const branchFilter = navigationRequest?.view === "branches"
    ? navigationRequest.payload?.filter ?? navigationRequest.payload?.status?.[0] ?? null
    : null;
  const hotspotFilter = navigationRequest?.view === "hotspots"
    ? navigationRequest.payload?.filter ?? null
    : null;
  // Commits and Compare stay mounted so their state (filters, selection,
  // loaded pages) survives navigation.
  return (
    <>
      <div className={cn("h-full", view !== "commits" && "hidden")}>
        <CommitGraph
          data={data}
          graphRequest={effectiveGraphRequest}
          onCompare={onCompare}
          onCherryPick={onCherryPick}
          onShowWorkspace={onShowWorkspace}
        />
      </div>
      <div className={cn("h-full", view !== "compare" && "hidden")}>
        <CompareView data={data} initial={compareInit} onCherryPick={onCherryPick} />
      </div>
      {view === "overview" && <Overview data={data} onOpenCommit={onFocusCommit} onOpenHealth={() => onNavigate("health")} />}
      {view === "branches" && (
        <BranchesView
          repoPath={data.repository.rootPath}
          branches={data.branches}
          currentBranch={data.repository.currentBranch}
          defaultBranch={data.repository.defaultBranch}
          onShowInGraph={onShowBranchInGraph}
          onCompareWithDefault={onCompare}
          onCompareWithCurrent={(branch) => onCompare(data.repository.currentBranch, branch)}
          initialFilter={branchFilter}
          initialConfig={navigationRequest?.view === "branches" ? navigationRequest.payload : null}
        />
      )}
      {view === "worktrees" && <WorktreesView worktrees={data.worktrees} />}
      {view === "submodules" && <SubmodulesView submodules={data.submodules} />}
      {view === "workspace" && (
        <WorkspaceView
          status={data.status}
          repoPath={data.repository.rootPath}
          operationMode={operationMode}
          isDemo={isDemo}
          operationError={operationError}
          onSetOperationMode={onSetOperationMode}
          onOperation={onWorkspaceOperation}
          onRefresh={onRefresh}
        />
      )}
      {view === "files" && (
        <FileExplorer
          repoPath={data.repository.rootPath}
          status={data.status}
          historyState={fileHistory}
          focusFilterRequest={fileFilterRequest}
          initialConfig={navigationRequest?.view === "files" ? navigationRequest.payload : null}
          fileSelectionRequest={fileSelectionRequest}
          onHistoryStateChange={onFileHistoryChange}
          onOpenCommit={onFocusCommit}
          onOpenFileAtRevision={onOpenFileAtRevision}
          onOpenPreviousRevision={onOpenPreviousRevision}
        />
      )}
      {view === "hotspots" && <HotspotsView repoPath={data.repository.rootPath} onOpenFileHistory={onOpenFileHistory} initialFilter={hotspotFilter} initialConfig={navigationRequest?.view === "hotspots" ? navigationRequest.payload : null} />}
      {view === "ownership" && <OwnershipView repoPath={data.repository.rootPath} initialConfig={navigationRequest?.view === "ownership" ? navigationRequest.payload : null} />}
      {view === "health" && <HealthView repoPath={data.repository.rootPath} revision={data.scannedAt} onNavigate={onHealthNavigate} />}
      {view === "reflog" && (
        <ReflogView
          repoPath={data.repository.rootPath}
          currentHead={data.repository.head}
          currentBranch={data.repository.currentBranch}
          branches={data.branches}
          revision={revision}
          initialConfig={navigationRequest?.view === "reflog" ? navigationRequest.payload : null}
          onViewCommit={onFocusCommit}
          onCompare={onCompare}
        />
      )}
      {view === "refs" && <RefsView data={data} />}
      {view === "saved-views" && (
        <SavedViewsView
          savedViews={savedViews}
          loading={savedViewsLoading}
          error={savedViewsError}
          warning={savedViewsWarning}
          data={data}
          onReload={onReloadSavedViews}
          onOpen={onOpenSavedView}
          onRename={onRenameSavedView}
          onDuplicate={onDuplicateSavedView}
          onTogglePin={onToggleSavedViewPin}
          onDelete={onDeleteSavedView}
          onCreate={onCreateSavedView}
          canCreate={Boolean(currentSavedView)}
        />
      )}
      {view === "activity" && <SavedViewNotice title="Activity view is not available yet" />}
      {view === "search" && <SavedViewNotice title="Search views open in the repository search dialog" />}
    </>
  );
}

function WelcomeState({ onOpen }) {
  const features = [
    [GitCommitHorizontal, "Commit graph", "GitKraken-style topology with search, branch filter, and multi-select."],
    [GitCompareArrows, "PR simulation", "Compare any two refs: commits, diffs, and merge-conflict prediction."],
    [Cherry, "Visual cherry-pick", "Pick commits from the graph with a conflict preview before anything runs."],
    [Workflow, "Worktrees & more", "Branches, worktrees, submodules, stashes, tags, and contributors."],
  ];

  return (
    <div className="flex h-full overflow-auto p-8">
      <div className="m-auto w-full max-w-4xl">
        <div className="text-center">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <FolderGit2 className="size-8" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Understand a Git repository visually</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Repo Atlas reads Git metadata directly from a local project folder. No login, no telemetry, no cloud — and it never
            writes to your repository except the cherry-picks you explicitly confirm.
          </p>
          <Button size="lg" className="mt-6" onClick={onOpen}>
            <FolderOpen /> Open Git Repository
          </Button>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {features.map(([Icon, title, description]) => (
            <div key={title} className="rounded-xl border border-border bg-card/60 p-4">
              <Icon className="mb-3 size-5 text-primary" />
              <div className="font-medium">{title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <HardDrive className="size-4" /> Requires the Git CLI to be available in PATH.
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <LoaderCircle className="mx-auto size-8 animate-spin text-primary" />
        <div className="mt-4 text-sm font-medium">Scanning repository</div>
        <div className="mt-1 text-xs text-muted-foreground">Reading local Git metadata.</div>
      </div>
    </div>
  );
}

function ErrorState({ error, onOpen }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-lg rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <CircleAlert className="mx-auto size-9 text-red-400" />
        <h2 className="mt-4 font-semibold">Repository could not be opened</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        {error.code && <code className="mt-3 block text-xs text-red-400/80">{error.code}</code>}
        <Button className="mt-5" onClick={onOpen}>
          <FolderOpen /> Choose Another Folder
        </Button>
      </div>
    </div>
  );
}
