const CATEGORY_ORDER = ["file", "commit", "branch", "tag", "author", "bookmark", "note", "saved-view"];

function normalize(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function fuzzyScore(candidate, query) {
  if (!query) return 0;
  let cursor = 0;
  let matched = 0;
  let contiguous = 0;
  let bestContiguous = 0;
  for (const character of query) {
    const index = candidate.indexOf(character, cursor);
    if (index < 0) return 0;
    if (index === cursor) contiguous += 1;
    else {
      bestContiguous = Math.max(bestContiguous, contiguous);
      contiguous = 1;
    }
    cursor = index + 1;
    matched += 1;
  }
  bestContiguous = Math.max(bestContiguous, contiguous);
  return 180 + (matched / Math.max(candidate.length, 1)) * 90 + bestContiguous * 5;
}

export function scoreText(value, query) {
  const candidate = normalize(value);
  const needle = normalize(query);
  if (!candidate || !needle) return 0;
  if (candidate === needle) return 1000;
  if (candidate.startsWith(needle)) return 820 - Math.min(candidate.length - needle.length, 120);

  const words = candidate.split(/[\s/._:@-]+/).filter(Boolean);
  if (words.some((word) => word.startsWith(needle))) return 700 - Math.min(candidate.length - needle.length, 120);
  if (candidate.includes(needle)) return 560 - Math.min(candidate.indexOf(needle), 120);
  return fuzzyScore(candidate, needle);
}

export function scoreFile(file, query) {
  const needle = normalize(query);
  if (!needle) return 0;
  const filePath = normalize(file?.path);
  const name = normalize(file?.name || filePath.split("/").pop());
  const extension = normalize(file?.extension);
  if (!filePath || !name) return 0;

  if (name === needle) return 1200;
  if (filePath === needle) return 1160;
  if (name.startsWith(needle)) return 1020 - Math.min(name.length - needle.length, 120);

  const segments = filePath.split("/").filter(Boolean);
  if (segments.some((segment) => normalize(segment).startsWith(needle))) {
    return 900 - Math.min(filePath.length - needle.length, 180);
  }
  if (extension === needle) return 760;
  if (name.includes(needle)) return 720 - Math.min(name.indexOf(needle), 80);
  if (filePath.includes(needle)) return 620 - Math.min(filePath.indexOf(needle), 120);
  return fuzzyScore(name, needle) || fuzzyScore(filePath, needle);
}

export function scoreSearchResult(result, query) {
  if (!result) return 0;
  if (result.type === "file") return scoreFile(result, query);
  if (result.type === "commit") {
    return Math.max(
      scoreText(result.subject, query),
      scoreText(result.hash, query),
      scoreText(result.shortHash, query),
      scoreText(result.author, query),
    );
  }
  if (result.type === "author") return Math.max(scoreText(result.name, query), scoreText(result.email, query));
  if (result.type === "bookmark") return Math.max(scoreText(result.hash, query), scoreText(result.shortHash, query), scoreText(result.label, query), scoreText(result.category, query));
  if (result.type === "note") return Math.max(scoreText(result.hash, query), scoreText(result.shortHash, query), scoreText(result.title, query), scoreText(result.body, query));
  if (result.type === "saved-view") return Math.max(scoreText(result.name, query), scoreText(result.viewType, query), scoreText(result.configSummary, query));
  return scoreText(result.name, query);
}

function resultName(result) {
  return normalize(result?.path || result?.name || result?.label || result?.title || result?.subject || result?.hash);
}

export function groupSearchResults(results = [], { limitPerType = 20, limit = 100 } = {}) {
  const groups = Object.fromEntries(CATEGORY_ORDER.map((type) => [type, []]));
  for (const result of Array.isArray(results) ? results : []) {
    if (!groups[result?.type]) continue;
    groups[result.type].push(result);
  }

  for (const type of CATEGORY_ORDER) {
    groups[type].sort((left, right) => {
      const scoreDelta = Number(right.score ?? 0) - Number(left.score ?? 0);
      return scoreDelta || resultName(left).localeCompare(resultName(right), undefined, { sensitivity: "base", numeric: true });
    });
    groups[type] = groups[type].slice(0, limitPerType);
  }

  const all = CATEGORY_ORDER.flatMap((type) => groups[type])
    .sort((left, right) => {
      const scoreDelta = Number(right.score ?? 0) - Number(left.score ?? 0);
      if (scoreDelta) return scoreDelta;
      const typeDelta = CATEGORY_ORDER.indexOf(left.type) - CATEGORY_ORDER.indexOf(right.type);
      return typeDelta || resultName(left).localeCompare(resultName(right), undefined, { sensitivity: "base", numeric: true });
    })
    .slice(0, limit);

  return { all, groups };
}

export { CATEGORY_ORDER };
