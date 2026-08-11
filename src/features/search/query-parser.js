const SEARCH_TYPES = new Set(["all", "file", "commit", "branch", "tag", "author", "bookmark", "note", "saved-view"]);
const QUALIFIERS = new Set(["type", "author", "branch", "path", "after", "before"]);
const HASH_PATTERN = /^[0-9a-f]{7,40}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function tokenize(input) {
  const value = String(input ?? "");
  const tokens = [];
  let token = "";
  let quote = null;
  let escaped = false;

  const push = () => {
    if (token) tokens.push(token);
    token = "";
  };

  for (const character of value) {
    if (escaped) {
      token += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote) {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else token += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      push();
      continue;
    }
    token += character;
  }
  if (escaped) token += "\\";
  push();
  return tokens;
}

function validDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) &&
    date.getUTCFullYear() === Number(value.slice(0, 4)) &&
    date.getUTCMonth() + 1 === Number(value.slice(5, 7)) &&
    date.getUTCDate() === Number(value.slice(8, 10))
  );
}

export function isHashLike(value) {
  return HASH_PATTERN.test(String(value ?? "").trim());
}

export function parseSearchQuery(input) {
  const tokens = tokenize(input);
  const text = [];
  const errors = [];
  const result = { raw: String(input ?? ""), text: "", errors };

  for (const token of tokens) {
    const separator = token.indexOf(":");
    if (separator <= 0) {
      text.push(token);
      continue;
    }

    const qualifier = token.slice(0, separator).toLowerCase();
    const value = token.slice(separator + 1).trim();
    if (!QUALIFIERS.has(qualifier) || !value) {
      text.push(token);
      continue;
    }

    if (qualifier === "type") {
      const normalized = value.toLowerCase();
      if (!SEARCH_TYPES.has(normalized)) {
        errors.push({ token, message: `Unknown result type "${value}".` });
      } else {
        result.type = normalized;
      }
      continue;
    }

    if (qualifier === "after" || qualifier === "before") {
      if (!validDate(value)) {
        errors.push({ token, message: `Date must use a real YYYY-MM-DD value.` });
      } else {
        result[qualifier] = value;
      }
      continue;
    }

    result[qualifier] = value;
  }

  result.text = text.join(" ").trim();
  return result;
}

export function searchTypesForQuery(query, selectedType = "all") {
  const type = query?.type && query.type !== "all" ? query.type : selectedType;
  return type && type !== "all" ? [type] : undefined;
}

export { SEARCH_TYPES };
