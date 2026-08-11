import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

function responseData(response) {
  return response?.data ?? response;
}

function responseError(response, fallback) {
  return response?.error?.message ?? responseData(response)?.error?.message ?? fallback;
}

function normalizeList(response) {
  const payload = responseData(response);
  return {
    savedViews: Array.isArray(payload?.savedViews) ? payload.savedViews : [],
    warning: payload?.warning ?? null,
  };
}

export function useSavedViews({ repositoryPath } = {}) {
  const [state, setState] = useState({ loading: Boolean(repositoryPath), error: null, savedViews: [], warning: null });

  const reload = useCallback(async () => {
    if (!repositoryPath || typeof api.listSavedViews !== "function") {
      setState({ loading: false, error: null, savedViews: [], warning: null });
      return [];
    }
    setState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const response = await api.listSavedViews({ repositoryPath });
      if (response?.ok === false) throw new Error(responseError(response, "Saved views could not be loaded."));
      const next = normalizeList(response);
      setState({ loading: false, error: null, ...next });
      return next.savedViews;
    } catch (error) {
      const message = error?.message ?? "Saved views could not be loaded.";
      setState((previous) => ({ ...previous, loading: false, error: message }));
      return [];
    }
  }, [repositoryPath]);

  useEffect(() => {
    let active = true;
    if (!repositoryPath) {
      setState({ loading: false, error: null, savedViews: [], warning: null });
      return undefined;
    }
    setState({ loading: true, error: null, savedViews: [], warning: null });
    if (typeof api.listSavedViews !== "function") {
      setState({ loading: false, error: null, savedViews: [], warning: null });
      return undefined;
    }
    api.listSavedViews({ repositoryPath }).then((response) => {
      if (!active) return;
      if (response?.ok === false) {
        setState({ loading: false, error: responseError(response, "Saved views could not be loaded."), savedViews: [], warning: null });
        return;
      }
      setState({ loading: false, error: null, ...normalizeList(response) });
    }).catch((error) => {
      if (active) setState({ loading: false, error: error?.message ?? "Saved views could not be loaded.", savedViews: [], warning: null });
    });
    return () => {
      active = false;
    };
  }, [repositoryPath]);

  const mutate = useCallback(async (method, input) => {
    if (!repositoryPath || typeof api[method] !== "function") throw new Error("Saved view persistence is unavailable in this environment.");
    const response = await api[method]({ repositoryPath, ...input });
    if (response?.ok === false) throw new Error(responseError(response, "Saved view operation failed."));
    const payload = responseData(response) ?? {};
    if (Array.isArray(payload.savedViews)) setState((previous) => ({ ...previous, savedViews: payload.savedViews, error: null }));
    return payload;
  }, [repositoryPath]);

  const createSavedView = useCallback((input) => mutate("createSavedView", input), [mutate]);
  const updateSavedView = useCallback((input) => mutate("updateSavedView", input), [mutate]);
  const deleteSavedView = useCallback((id) => mutate("deleteSavedView", { id }), [mutate]);
  const touchSavedView = useCallback((view) => {
    if (!view?.id) return Promise.resolve(null);
    return updateSavedView({ id: view.id, lastOpenedAt: new Date().toISOString() });
  }, [updateSavedView]);
  const duplicateSavedView = useCallback((view) => {
    if (!view) return Promise.reject(new Error("A saved view is required."));
    return createSavedView({ name: `${view.name} copy`.slice(0, 80), viewType: view.viewType, configVersion: view.configVersion, config: view.config, pinned: false });
  }, [createSavedView]);

  return {
    ...state,
    reload,
    createSavedView,
    updateSavedView,
    deleteSavedView,
    touchSavedView,
    duplicateSavedView,
  };
}
