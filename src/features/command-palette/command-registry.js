const SHORTCUT_ALIASES = {
  cmd: "mod",
  command: "mod",
  control: "ctrl",
  esc: "escape",
  return: "enter",
};

const MODIFIER_ORDER = new Map([
  ["mod", 0],
  ["ctrl", 1],
  ["alt", 2],
  ["shift", 3],
]);

function normalizeShortcutPart(part) {
  const value = String(part ?? "").trim().toLowerCase();
  return SHORTCUT_ALIASES[value] ?? value;
}

export function normalizeShortcut(shortcut) {
  const parts = Array.isArray(shortcut) ? shortcut : String(shortcut ?? "").split("+");
  return [...new Set(parts.map(normalizeShortcutPart).filter(Boolean))].sort(
    (left, right) => (MODIFIER_ORDER.get(left) ?? 10) - (MODIFIER_ORDER.get(right) ?? 10),
  );
}

function normalizeKeywords(keywords) {
  return [...new Set((Array.isArray(keywords) ? keywords : []).map((keyword) => String(keyword).trim()).filter(Boolean))];
}

function normalizePredicate(predicate, fallback) {
  if (typeof predicate === "function") return predicate;
  if (typeof predicate === "boolean") return () => predicate;
  return fallback;
}

export function createCommand(definition) {
  if (!definition || typeof definition !== "object") throw new TypeError("A command definition is required.");
  if (!definition.id || !definition.label || !definition.category) {
    throw new TypeError("A command requires id, label, and category.");
  }
  if (typeof definition.run !== "function") throw new TypeError(`Command ${definition.id} requires a run function.`);

  return Object.freeze({
    ...definition,
    id: String(definition.id),
    label: String(definition.label),
    category: String(definition.category),
    keywords: normalizeKeywords(definition.keywords),
    shortcut: normalizeShortcut(definition.shortcut),
    enabled: normalizePredicate(definition.enabled, () => true),
    visible: normalizePredicate(definition.visible, () => true),
  });
}

export function createCommandRegistry(definitions = []) {
  if (!Array.isArray(definitions)) throw new TypeError("Command definitions must be an array.");
  const commands = definitions.map(createCommand);
  const ids = new Set();
  for (const command of commands) {
    if (ids.has(command.id)) throw new TypeError(`Duplicate command id: ${command.id}`);
    ids.add(command.id);
  }
  return Object.freeze(commands);
}

export function isCommandEnabled(command, context) {
  return Boolean(command?.enabled?.(context));
}

export function isCommandVisible(command, context) {
  return command?.visible?.(context) !== false;
}
