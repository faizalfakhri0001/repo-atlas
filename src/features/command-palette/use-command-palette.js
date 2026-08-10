import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isCommandEnabled, isCommandVisible } from "./command-registry.js";
import { MAX_COMMAND_RESULTS, searchCommands } from "./command-search.js";

export function useCommandPalette({ commands = [], context = {}, maxResults = MAX_COMMAND_RESULTS } = {}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [executingId, setExecutingId] = useState(null);
  const [error, setError] = useState(null);
  const previousFocusRef = useRef(null);
  const wasOpenRef = useRef(false);

  const visibleCommands = useMemo(
    () => commands.filter((command) => isCommandVisible(command, context)),
    [commands, context],
  );
  const results = useMemo(
    () => searchCommands(visibleCommands, query, maxResults),
    [maxResults, query, visibleCommands],
  );
  const selected = Math.min(Math.max(selectedIndex, 0), Math.max(results.length - 1, 0));

  useEffect(() => {
    setSelectedIndex(0);
  }, [open, query, visibleCommands]);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    const previousFocus = previousFocusRef.current;
    if (!previousFocus || typeof previousFocus.focus !== "function") return;
    const timer = window.setTimeout(() => previousFocus.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const openPalette = useCallback(() => {
    if (!open && typeof document !== "undefined") previousFocusRef.current = document.activeElement;
    setError(null);
    setQuery("");
    setSelectedIndex(0);
    setOpen(true);
  }, [open]);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
    setError(null);
  }, []);

  const updateQuery = useCallback((value) => {
    setQuery(value);
    setSelectedIndex(0);
    setError(null);
  }, []);

  const executeCommand = useCallback(async (command) => {
    if (!command || executingId || !isCommandEnabled(command, context)) return false;
    setExecutingId(command.id);
    setError(null);
    try {
      await command.run(context);
      closePalette();
      return true;
    } catch (commandError) {
      setError(commandError?.message || "Command failed.");
      return false;
    } finally {
      setExecutingId(null);
    }
  }, [closePalette, context, executingId]);

  const handleOpenChange = useCallback((nextOpen) => {
    if (nextOpen) openPalette();
    else closePalette();
  }, [closePalette, openPalette]);

  return {
    open,
    openPalette,
    closePalette,
    handleOpenChange,
    query,
    updateQuery,
    results,
    selectedIndex: selected,
    setSelectedIndex,
    isCommandEnabled: (command) => isCommandEnabled(command, context),
    executeCommand,
    executingId,
    error,
  };
}
