const REFLOG_RECORD_SEPARATOR = "\x1e";
const REFLOG_FIELD_SEPARATOR = "\x1f";
const REFLOG_ACTIONS = new Set([
  "commit",
  "checkout",
  "reset",
  "rebase",
  "merge",
  "pull",
  "cherry-pick",
  "revert",
  "branch",
  "amend",
  "other",
]);

function parseReflogAction(subject) {
  const rawMessage = typeof subject === "string" ? subject.trim() : "";
  const match = rawMessage.match(/^([a-z-]+)(?:\s+\(([^)]+)\))?(?::\s*(.*)|\s+[^:]+:\s*(.*))$/i);
  if (!match) return { action: "other", detail: rawMessage };

  const baseAction = match[1].toLowerCase();
  const qualifier = match[2]?.trim().toLowerCase() ?? "";
  const action = baseAction === "commit" && qualifier === "amend" ? "amend" : baseAction;
  return {
    action: REFLOG_ACTIONS.has(action) ? action : "other",
    detail: (match[3] ?? match[4] ?? "").trim(),
  };
}

function parseReflogEntries(raw, { refName = "HEAD", offset = 0 } = {}) {
  if (typeof raw !== "string" || !raw.trim()) return [];

  return raw
    .split(REFLOG_RECORD_SEPARATOR)
    .map((record) => record.replace(/\n+$/, ""))
    .filter(Boolean)
    .map((record, index) => {
      const fields = record.split(REFLOG_FIELD_SEPARATOR);
      const hash = fields.shift() ?? "";
      const selector = fields.shift() ?? "";
      fields.shift();
      const actorName = fields.shift() ?? "";
      const actorEmail = fields.shift() ?? "";
      const date = fields.shift() ?? "";
      const rawMessage = fields.join(REFLOG_FIELD_SEPARATOR);
      if (!hash || !selector || !date) return null;
      const classified = parseReflogAction(rawMessage);
      return {
        index: offset + index,
        hash,
        shortHash: hash.slice(0, 8),
        selector,
        refName,
        date,
        actor: {
          name: actorName,
          email: actorEmail,
        },
        rawMessage,
        action: classified.action,
        detail: classified.detail,
        reachable: null,
      };
    })
    .filter(Boolean);
}

module.exports = {
  REFLOG_ACTIONS: [...REFLOG_ACTIONS],
  REFLOG_FIELD_SEPARATOR,
  REFLOG_RECORD_SEPARATOR,
  parseReflogAction,
  parseReflogEntries,
};
