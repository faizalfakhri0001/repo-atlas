import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { isHashLike, parseSearchQuery, searchTypesForQuery } from "./query-parser.js";
import { SearchCache } from "./search-cache.js";
import { groupSearchResults } from "./search-scoring.js";
import { buildLocalMetadataRevisionKey, buildLocalMetadataSearchResults, LOCAL_SEARCH_TYPES } from "./local-search.js";

export const SEARCH_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "file", label: "Files" },
  { id: "commit", label: "Commits" },
  { id: "branch", label: "Branches" },
  { id: "tag", label: "Tags" },
  { id: "author", label: "Authors" },
  { id: "bookmark", label: "Bookmarks" },
  { id: "note", label: "Local Notes" },
  { id: "saved-view", label: "Saved Views" },
];

const DEBOUNCE_MS = 150;
const EMPTY_LOCAL_METADATA = Object.freeze({ bookmarks: [], notes: [], savedViews: [] });

function buildRevisionKey(repositoryPath, revision, localMetadata) {
  const head = revision?.head || revision?.shortHead || "";
  const scannedAt = revision?.scannedAt || "";
  const localRevision = buildLocalMetadataRevisionKey(localMetadata);
  return `${repositoryPath || "demo"}:${head}:${scannedAt}:${localRevision}`;
}

function emptyGrouped() {
  return groupSearchResults([]);
}

export function useGlobalSearch({ repositoryPath, revision, open = false, initialQuery = "", localMetadata = {} } = {}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [state, setState] = useState({ loading: false, error: null, errors: [], grouped: emptyGrouped(), durationMs: null });
  const cacheRef = useRef(new SearchCache(30));
  const requestIdRef = useRef(0);
  const timerRef = useRef(null);
  const stableLocalMetadata = useMemo(
    () => ({
      bookmarks: Array.isArray(localMetadata?.bookmarks) ? localMetadata.bookmarks : EMPTY_LOCAL_METADATA.bookmarks,
      notes: Array.isArray(localMetadata?.notes) ? localMetadata.notes : EMPTY_LOCAL_METADATA.notes,
      savedViews: Array.isArray(localMetadata?.savedViews) ? localMetadata.savedViews : EMPTY_LOCAL_METADATA.savedViews,
    }),
    [localMetadata?.bookmarks, localMetadata?.notes, localMetadata?.savedViews],
  );
  const revisionKey = buildRevisionKey(repositoryPath, revision, stableLocalMetadata);

  useEffect(() => {
    cacheRef.current.setRevision(revisionKey);
  }, [revisionKey]);

  useEffect(() => {
    if (open) return undefined;
    requestIdRef.current += 1;
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    setQuery("");
    setSelectedIndex(0);
    setState({ loading: false, error: null, errors: [], grouped: emptyGrouped(), durationMs: null });
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open || !initialQuery) return;
    setQuery(initialQuery);
    setCategory("all");
    setSelectedIndex(0);
  }, [initialQuery, open]);

  const performSearch = useCallback(
    async (nextQuery, nextCategory, requestId) => {
      const parsed = parseSearchQuery(nextQuery);
      const operand = parsed.text || parsed.path || parsed.branch || parsed.author || "";
      const trimmed = String(operand).trim();
      if (trimmed.length < 2 && !isHashLike(trimmed)) {
        if (requestId !== requestIdRef.current) return;
        setState({ loading: false, error: null, errors: parsed.errors, grouped: emptyGrouped(), durationMs: null });
        return;
      }

      const types = searchTypesForQuery(parsed, nextCategory);
      const localTypes = Array.isArray(types) ? types.filter((type) => LOCAL_SEARCH_TYPES.includes(type)) : LOCAL_SEARCH_TYPES;
      const repositoryTypes = Array.isArray(types) ? types.filter((type) => !LOCAL_SEARCH_TYPES.includes(type)) : undefined;
      const cacheKey = `${nextCategory}:${nextQuery.trim()}`;
      const cached = cacheRef.current.get(cacheKey, revisionKey);
      if (cached) {
        if (requestId !== requestIdRef.current) return;
        setState({ loading: false, error: null, errors: cached.errors ?? [], grouped: cached.grouped, durationMs: cached.durationMs ?? null });
        return;
      }

      setState((current) => ({ ...current, loading: true, error: null, errors: parsed.errors }));
      try {
        const localResults = buildLocalMetadataSearchResults({
          query: trimmed,
          types: localTypes,
          ...stableLocalMetadata,
        });
        const shouldSearchRepository = repositoryTypes === undefined || repositoryTypes.length > 0;
        const response = shouldSearchRepository && typeof api.repositorySearch === "function"
          ? await api.repositorySearch({
            repositoryPath,
            query: nextQuery,
            types: repositoryTypes,
            limit: 100,
          })
          : { ok: true, data: { results: [], errors: [], durationMs: null } };
        if (requestId !== requestIdRef.current) return;
        if (!response?.ok) {
          setState((current) => ({ ...current, loading: false, error: response?.error?.message ?? "Repository search failed." }));
          return;
        }
        const data = response.data ?? {};
        const grouped = groupSearchResults([...(data.results ?? []), ...localResults], { limitPerType: 20, limit: 100 });
        const value = { grouped, errors: data.errors ?? parsed.errors, durationMs: data.durationMs ?? null };
        cacheRef.current.set(cacheKey, value, revisionKey);
        setState({ loading: false, error: null, errors: value.errors, grouped, durationMs: value.durationMs });
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        setState((current) => ({ ...current, loading: false, error: error?.message ?? "Repository search failed." }));
      }
    },
    [repositoryPath, revisionKey, stableLocalMetadata],
  );

  useEffect(() => {
    if (!open) return undefined;
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void performSearch(query, category, requestId);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [category, open, performSearch, query]);

  const results = useMemo(
    () => (category === "all" ? state.grouped.all : state.grouped.groups[category] ?? []),
    [category, state.grouped],
  );

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(results.length - 1, 0)));
  }, [results.length]);

  const updateQuery = useCallback((value) => {
    setQuery(value);
    setSelectedIndex(0);
  }, []);

  const updateCategory = useCallback((value) => {
    setCategory(value);
    setSelectedIndex(0);
  }, []);

  const moveSelection = useCallback(
    (offset) => {
      setSelectedIndex((current) => (results.length ? (current + offset + results.length) % results.length : 0));
    },
    [results.length],
  );

  const clearCache = useCallback(() => {
    requestIdRef.current += 1;
    cacheRef.current.clear();
  }, []);

  return {
    query,
    updateQuery,
    category,
    updateCategory,
    categories: SEARCH_CATEGORIES,
    results,
    groups: state.grouped.groups,
    loading: state.loading,
    error: state.error,
    errors: state.errors,
    durationMs: state.durationMs,
    selectedIndex,
    setSelectedIndex,
    moveSelection,
    clearCache,
  };
}
