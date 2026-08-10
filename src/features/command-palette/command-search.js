const SCORE_EXACT = 10_000;
const SCORE_PREFIX = 9_000;
const SCORE_WORD_PREFIX = 8_000;
const SCORE_SUBSTRING = 6_000;
const SCORE_FUZZY = 3_000;
export const MAX_COMMAND_RESULTS = 20;

function normalize(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function fuzzyCharacterScore(query, text) {
  let cursor = 0;
  let firstMatch = -1;
  let previousMatch = -2;
  let consecutive = 0;
  for (const character of query) {
    const match = text.indexOf(character, cursor);
    if (match < 0) return null;
    if (firstMatch < 0) firstMatch = match;
    if (match === previousMatch + 1) consecutive += 1;
    previousMatch = match;
    cursor = match + 1;
  }
  return SCORE_FUZZY + (consecutive * 80) + (query.length * 20) - firstMatch - (text.length - query.length);
}

export function scoreText(query, text) {
  const normalizedQuery = normalize(query);
  const normalizedText = normalize(text);
  if (!normalizedQuery || !normalizedText) return null;
  if (normalizedText === normalizedQuery) return SCORE_EXACT;
  if (normalizedText.startsWith(normalizedQuery)) return SCORE_PREFIX - normalizedText.length;

  const wordPrefix = normalizedText.split(/[^a-z0-9]+/).some((word) => word.startsWith(normalizedQuery));
  if (wordPrefix) return SCORE_WORD_PREFIX - normalizedText.indexOf(normalizedQuery);

  const substringIndex = normalizedText.indexOf(normalizedQuery);
  if (substringIndex >= 0) return SCORE_SUBSTRING - substringIndex;
  return fuzzyCharacterScore(normalizedQuery, normalizedText);
}

export function scoreCommand(command, query) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 0;
  const labelScore = scoreText(normalizedQuery, command?.label);
  const keywordScore = (command?.keywords ?? [])
    .map((keyword) => scoreText(normalizedQuery, keyword))
    .filter((score) => score != null)
    .reduce((best, score) => Math.max(best, score * 0.75), -Infinity);
  const score = Math.max(labelScore ?? -Infinity, keywordScore);
  return Number.isFinite(score) ? score : null;
}

export function rankCommands(commands, query, limit = MAX_COMMAND_RESULTS) {
  const safeLimit = Math.max(0, Number(limit) || 0);
  if (!normalize(query)) return (commands ?? []).slice(0, safeLimit).map((command, index) => ({ command, index, score: 0 }));
  return (commands ?? [])
    .map((command, index) => ({ command, index, score: scoreCommand(command, query) }))
    .filter(({ score }) => score != null)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, safeLimit);
}

export function searchCommands(commands, query, limit = MAX_COMMAND_RESULTS) {
  return rankCommands(commands, query, limit).map(({ command }) => command);
}
