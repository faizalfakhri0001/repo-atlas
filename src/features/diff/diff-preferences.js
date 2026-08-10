export const DIFF_PREFERENCES_KEY = "repo-atlas-diff-preferences-v1";

export const DEFAULT_DIFF_PREFERENCES = Object.freeze({
  mode: "unified",
  wrap: false,
  syntaxHighlight: true,
});

export function normalizeDiffPreferences(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    mode: source.mode === "split" ? "split" : "unified",
    wrap: source.wrap === true,
    syntaxHighlight: source.syntaxHighlight !== false,
  };
}

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return null;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function loadDiffPreferences(storage) {
  const target = resolveStorage(storage);
  if (!target) return { ...DEFAULT_DIFF_PREFERENCES };
  try {
    return normalizeDiffPreferences(JSON.parse(target.getItem(DIFF_PREFERENCES_KEY) ?? "{}"));
  } catch {
    return { ...DEFAULT_DIFF_PREFERENCES };
  }
}

export function saveDiffPreferences(preferences, storage) {
  const target = resolveStorage(storage);
  const normalized = normalizeDiffPreferences(preferences);
  if (!target) return normalized;
  try {
    target.setItem(DIFF_PREFERENCES_KEY, JSON.stringify(normalized));
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
  return normalized;
}
