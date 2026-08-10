const MAX_TOKENIZE_LENGTH = 20_000;
const TOKEN_CACHE_LIMIT = 2_048;
const tokenCache = new Map();

const COMMON_KEYWORDS = new Set([
  "as", "async", "await", "break", "case", "catch", "class", "const", "continue", "default", "delete", "do", "else", "export", "extends", "false", "finally", "for", "from", "function", "if", "import", "in", "interface", "let", "new", "null", "of", "package", "private", "protected", "public", "return", "static", "super", "switch", "this", "throw", "true", "try", "typeof", "undefined", "var", "void", "while", "with", "yield",
]);

const LANGUAGE_KEYWORDS = {
  bash: new Set(["case", "do", "done", "elif", "else", "esac", "fi", "for", "function", "if", "in", "then", "until", "while"]),
  c: new Set(["auto", "bool", "char", "double", "enum", "extern", "float", "int", "long", "register", "short", "signed", "sizeof", "struct", "typedef", "union", "unsigned", "void", "volatile"]),
  cpp: new Set(["auto", "bool", "char", "class", "const", "constexpr", "double", "enum", "explicit", "float", "int", "namespace", "nullptr", "private", "protected", "public", "return", "size_t", "static", "struct", "template", "this", "throw", "try", "typename", "using", "virtual", "void"]),
  go: new Set(["chan", "defer", "go", "goroutine", "interface", "map", "package", "range", "select", "struct", "type", "var"]),
  java: new Set(["boolean", "byte", "class", "double", "extends", "final", "float", "implements", "import", "instanceof", "int", "interface", "long", "new", "package", "private", "protected", "public", "return", "static", "super", "this", "throw", "throws", "try", "void"]),
  python: new Set(["and", "as", "assert", "async", "await", "class", "def", "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield"]),
  rust: new Set(["as", "async", "await", "const", "crate", "dyn", "enum", "fn", "impl", "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref", "return", "self", "Self", "struct", "trait", "type", "unsafe", "use", "where", "while"]),
};

const TOKEN_CLASS = {
  comment: "text-muted-foreground italic",
  function: "text-violet-300",
  heading: "font-semibold text-sky-300",
  keyword: "text-sky-400",
  number: "text-amber-300",
  operator: "text-rose-300",
  property: "text-cyan-300",
  string: "text-emerald-400",
  tag: "text-pink-300",
  plain: "text-foreground/90",
};

function pushToken(tokens, type, text) {
  if (!text) return;
  const previous = tokens.at(-1);
  if (previous?.type === type) previous.text += text;
  else tokens.push({ type, text });
}

function readQuoted(text, start) {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2;
      continue;
    }
    if (text[index] === quote) return index + 1;
    index += 1;
  }
  return text.length;
}

function isCommentStart(text, index, language) {
  if (text.startsWith("//", index) || text.startsWith("/*", index) || text.startsWith("<!--", index)) return true;
  return text[index] === "#" && language !== "json";
}

function isMarkup(language) {
  return language === "markup";
}

function keywordSet(language) {
  if (["javascript", "jsx", "typescript", "tsx"].includes(language)) return COMMON_KEYWORDS;
  return LANGUAGE_KEYWORDS[language] ?? new Set();
}

function classifyWord(word, line, end, start, language) {
  if (keywordSet(language).has(word)) return "keyword";
  const rest = line.slice(end);
  if (/^\s*\(/.test(rest)) return "function";
  if (/^\s*:/.test(rest) && ["css", "yaml", "json"].includes(language)) return "property";
  if (start > 0 && line[start - 1] === ".") return "property";
  return "plain";
}

export function tokenizeLine(line, language = "text") {
  const text = String(line ?? "");
  const normalizedLanguage = String(language || "text").toLowerCase();
  if (!text) return [];
  if (text.length > MAX_TOKENIZE_LENGTH) return [{ type: "plain", text }];

  const key = `${normalizedLanguage}\u0000${text}`;
  const cached = tokenCache.get(key);
  if (cached) {
    tokenCache.delete(key);
    tokenCache.set(key, cached);
    return cached;
  }

  const tokens = [];
  let index = 0;
  while (index < text.length) {
    if (isMarkup(normalizedLanguage) && text[index] === "<") {
      const end = text.indexOf(">", index + 1);
      if (end >= 0) {
        pushToken(tokens, "tag", text.slice(index, end + 1));
        index = end + 1;
        continue;
      }
    }
    if (isCommentStart(text, index, normalizedLanguage)) {
      pushToken(tokens, normalizedLanguage === "markdown" && index === 0 ? "heading" : "comment", text.slice(index));
      break;
    }
    if (["\"", "'", "`"].includes(text[index])) {
      const end = readQuoted(text, index);
      pushToken(tokens, "string", text.slice(index, end));
      index = end;
      continue;
    }
    const number = text.slice(index).match(/^(?:\d+(?:\.\d+)?|\.\d+)/);
    if (number) {
      pushToken(tokens, "number", number[0]);
      index += number[0].length;
      continue;
    }
    const word = text.slice(index).match(/^[A-Za-z_$][\w$-]*/);
    if (word) {
      const end = index + word[0].length;
      pushToken(tokens, classifyWord(word[0], text, end, index, normalizedLanguage), word[0]);
      index = end;
      continue;
    }
    if (/[=+\-*\/%!<>?:&|]/.test(text[index])) {
      pushToken(tokens, "operator", text[index]);
      index += 1;
      continue;
    }
    pushToken(tokens, "plain", text[index]);
    index += 1;
  }

  if (tokenCache.size >= TOKEN_CACHE_LIMIT) tokenCache.delete(tokenCache.keys().next().value);
  tokenCache.set(key, tokens);
  return tokens;
}

export function tokenClass(type) {
  return TOKEN_CLASS[type] ?? TOKEN_CLASS.plain;
}

export function clearTokenCache() {
  tokenCache.clear();
}

export function tokenCacheSize() {
  return tokenCache.size;
}

export const TOKENIZE_LIMIT = MAX_TOKENIZE_LENGTH;
export const TOKEN_CACHE_SIZE = TOKEN_CACHE_LIMIT;
