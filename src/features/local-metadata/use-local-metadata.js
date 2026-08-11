import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { normalizeBookmarks, normalizeNotes, getBookmarkedHashes } from "./local-metadata-model";

function responseData(response) {
  return response?.data ?? response;
}

function responseError(response, fallback) {
  return response?.error?.message ?? responseData(response)?.error?.message ?? fallback;
}

export function useLocalMetadata({ repositoryPath } = {}) {
  const [state, setState] = useState({ loading: Boolean(repositoryPath), error: null, warning: null, bookmarks: [], notes: [] });

  const reload = useCallback(async () => {
    if (!repositoryPath || typeof api.listBookmarks !== "function" || typeof api.listNotes !== "function") {
      setState({ loading: false, error: null, warning: null, bookmarks: [], notes: [] });
      return { bookmarks: [], notes: [] };
    }
    setState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const [bookmarkResponse, noteResponse] = await Promise.all([
        api.listBookmarks({ repositoryPath }),
        api.listNotes({ repositoryPath }),
      ]);
      if (bookmarkResponse?.ok === false) throw new Error(responseError(bookmarkResponse, "Bookmarks could not be loaded."));
      if (noteResponse?.ok === false) throw new Error(responseError(noteResponse, "Notes could not be loaded."));
      const bookmarkPayload = responseData(bookmarkResponse) ?? {};
      const notePayload = responseData(noteResponse) ?? {};
      const next = {
        loading: false,
        error: null,
        warning: bookmarkPayload.warning ?? notePayload.warning ?? null,
        bookmarks: normalizeBookmarks(bookmarkPayload.bookmarks),
        notes: normalizeNotes(notePayload.notes),
      };
      setState(next);
      return next;
    } catch (error) {
      const message = error?.message ?? "Local metadata could not be loaded.";
      setState((previous) => ({ ...previous, loading: false, error: message }));
      return { bookmarks: [], notes: [] };
    }
  }, [repositoryPath]);

  useEffect(() => {
    let active = true;
    if (!repositoryPath) {
      setState({ loading: false, error: null, warning: null, bookmarks: [], notes: [] });
      return undefined;
    }
    setState({ loading: true, error: null, warning: null, bookmarks: [], notes: [] });
    Promise.all([
      api.listBookmarks?.({ repositoryPath }),
      api.listNotes?.({ repositoryPath }),
    ]).then(([bookmarkResponse, noteResponse]) => {
      if (!active) return;
      if (bookmarkResponse?.ok === false || noteResponse?.ok === false) {
        const failed = bookmarkResponse?.ok === false ? bookmarkResponse : noteResponse;
        setState({ loading: false, error: responseError(failed, "Local metadata could not be loaded."), warning: null, bookmarks: [], notes: [] });
        return;
      }
      const bookmarkPayload = responseData(bookmarkResponse) ?? {};
      const notePayload = responseData(noteResponse) ?? {};
      setState({
        loading: false,
        error: null,
        warning: bookmarkPayload.warning ?? notePayload.warning ?? null,
        bookmarks: normalizeBookmarks(bookmarkPayload.bookmarks),
        notes: normalizeNotes(notePayload.notes),
      });
    }).catch((error) => {
      if (active) setState({ loading: false, error: error?.message ?? "Local metadata could not be loaded.", warning: null, bookmarks: [], notes: [] });
    });
    return () => {
      active = false;
    };
  }, [repositoryPath]);

  const mutate = useCallback(async (method, input) => {
    if (!repositoryPath || typeof api[method] !== "function") throw new Error("Local metadata persistence is unavailable in this environment.");
    const response = await api[method]({ repositoryPath, ...input });
    if (response?.ok === false) throw new Error(responseError(response, "Local metadata operation failed."));
    const payload = responseData(response) ?? {};
    setState((previous) => ({
      ...previous,
      error: null,
      warning: payload.warning ?? previous.warning,
      bookmarks: payload.bookmarks ? normalizeBookmarks(payload.bookmarks) : previous.bookmarks,
      notes: payload.notes ? normalizeNotes(payload.notes) : previous.notes,
    }));
    return payload;
  }, [repositoryPath]);

  const createBookmark = useCallback((input) => mutate("createBookmark", input), [mutate]);
  const updateBookmark = useCallback((input) => mutate("updateBookmark", input), [mutate]);
  const deleteBookmark = useCallback((id) => mutate("deleteBookmark", { id }), [mutate]);
  const createNote = useCallback((input) => mutate("createNote", input), [mutate]);
  const updateNote = useCallback((input) => mutate("updateNote", input), [mutate]);
  const deleteNote = useCallback((id) => mutate("deleteNote", { id }), [mutate]);

  const bookmarkedHashes = useMemo(() => getBookmarkedHashes(state.bookmarks), [state.bookmarks]);
  const bookmarkByHash = useMemo(
    () => new Map(state.bookmarks.map((bookmark) => [bookmark.commitHash, bookmark])),
    [state.bookmarks],
  );
  return {
    ...state,
    bookmarkedHashes,
    bookmarkByHash,
    reload,
    createBookmark,
    updateBookmark,
    deleteBookmark,
    createNote,
    updateNote,
    deleteNote,
  };
}
