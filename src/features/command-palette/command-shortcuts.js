import { useEffect } from "react";
import { isCommandEnabled, isCommandVisible } from "./command-registry.js";

const KEY_ALIASES = {
  esc: "escape",
  return: "enter",
};

function normalizeKey(key) {
  return KEY_ALIASES[String(key ?? "").toLowerCase()] ?? String(key ?? "").toLowerCase();
}

export function shortcutMatches(shortcut, event) {
  const parts = new Set(shortcut ?? []);
  const hasMod = parts.has("mod");
  const hasCtrl = parts.has("ctrl");
  const hasAlt = parts.has("alt");
  const hasShift = parts.has("shift");
  const hasSystemModifier = Boolean(event?.metaKey || event?.ctrlKey);

  if (hasMod ? !hasSystemModifier : hasCtrl ? !event?.ctrlKey || event?.metaKey : hasSystemModifier) return false;
  if (Boolean(event?.altKey) !== hasAlt || Boolean(event?.shiftKey) !== hasShift) return false;
  const key = [...parts].find((part) => !["mod", "ctrl", "alt", "shift"].includes(part));
  return Boolean(key) && normalizeKey(event?.key) === normalizeKey(key);
}

export function findShortcutCommand(commands, event, context) {
  return (commands ?? []).find(
    (command) => isCommandVisible(command, context) && isCommandEnabled(command, context) && shortcutMatches(command.shortcut, event),
  ) ?? null;
}

export function useCommandPaletteShortcuts({ commands = [], context = {}, onOpenPalette, onExecute, open = false } = {}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      const isPlainModK = (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && normalizeKey(event.key) === "k";
      if (isPlainModK) {
        event.preventDefault();
        onOpenPalette?.();
        return;
      }
      if (open) return;
      const command = findShortcutCommand(commands, event, context);
      if (!command) return;
      event.preventDefault();
      void onExecute?.(command);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commands, context, onExecute, onOpenPalette, open]);
}
