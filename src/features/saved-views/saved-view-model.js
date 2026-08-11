export const SAVED_VIEW_CONFIG_VERSION = 1;
export const MAX_SAVED_VIEW_NAME_LENGTH = 80;

export const SAVED_VIEW_TYPES = Object.freeze([
  "commits",
  "files",
  "branches",
  "compare",
  "hotspots",
  "ownership",
  "activity",
  "reflog",
  "search",
]);

export const SAVED_VIEW_TYPE_LABELS = Object.freeze({
  commits: "Commits",
  files: "Files",
  branches: "Branches",
  compare: "Compare",
  hotspots: "Hotspots",
  ownership: "Ownership",
  activity: "Activity",
  reflog: "Reflog",
  search: "Search",
});

const CONFIG_KEYS = Object.freeze({
  commits: ["refs", "order", "search", "author", "path", "dateRange"],
  files: ["pathPrefix", "filter", "extension", "status", "showOwnership"],
  branches: ["status", "sort", "direction", "localOnly"],
  compare: ["base", "head"],
  hotspots: ["pathPrefix", "extension", "includeGenerated", "sort"],
  ownership: ["path", "period", "contributor"],
  activity: ["range", "metric", "author", "pathPrefix"],
  reflog: ["ref", "actions", "search"],
  search: ["query", "types"],
});

const VIEW_CONFIG_SOURCE_KEYS = Object.freeze({
  commits: CONFIG_KEYS.commits,
  files: CONFIG_KEYS.files,
  branches: CONFIG_KEYS.branches,
  compare: CONFIG_KEYS.compare,
  hotspots: CONFIG_KEYS.hotspots,
  ownership: CONFIG_KEYS.ownership,
  activity: CONFIG_KEYS.activity,
  reflog: CONFIG_KEYS.reflog,
  search: CONFIG_KEYS.search,
});

export function getSavedViewTypeLabel(viewType) {
  return SAVED_VIEW_TYPE_LABELS[viewType] ?? "Saved View";
}

export function validateSavedViewName(value) {
  if (typeof value !== "string") return "Enter a saved view name.";
  const name = value.trim();
  if (name.length < 1) return "Enter a saved view name.";
  if (name.length > MAX_SAVED_VIEW_NAME_LENGTH) return `Names must be ${MAX_SAVED_VIEW_NAME_LENGTH} characters or fewer.`;
  if (name.includes("\0")) return "Names cannot contain null characters.";
  return null;
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function stableSerialize(value) {
  return JSON.stringify(stableValue(value));
}

export function configsEqual(left, right) {
  return stableSerialize(left ?? {}) === stableSerialize(right ?? {});
}

export function normalizeSavedViewConfigForClient(viewType, input = {}) {
  const allowed = CONFIG_KEYS[viewType] ?? [];
  if (!isPlainObject(input)) return {};
  return Object.fromEntries(
    allowed
      .filter((key) => Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined)
      .map((key) => [key, input[key]]),
  );
}

function cleanArray(value) {
  return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))] : undefined;
}

function pickConfig(viewType, source = {}) {
  const allowed = VIEW_CONFIG_SOURCE_KEYS[viewType] ?? [];
  const config = {};
  for (const key of allowed) {
    if (source[key] === undefined || source[key] === null || source[key] === "") continue;
    if (["refs", "status", "actions", "types"].includes(key)) {
      const values = cleanArray(source[key]);
      if (values?.length) config[key] = values;
    } else if (key === "dateRange" && isPlainObject(source[key])) {
      const range = {};
      if (source[key].from) range.from = String(source[key].from);
      if (source[key].to) range.to = String(source[key].to);
      if (Object.keys(range).length) config[key] = range;
    } else if (typeof source[key] === "boolean" || typeof source[key] === "number" || typeof source[key] === "string") {
      config[key] = source[key];
    }
  }
  return config;
}

function navigationPayloadFor(viewType, { graphRequest, compareInit, navigationRequest } = {}) {
  if (viewType === "compare") return compareInit ?? {};
  if (viewType === "commits") return graphRequest ?? {};
  if (navigationRequest?.view === viewType) return navigationRequest.payload ?? {};
  return {};
}

export function getCurrentSavedViewSnapshot({ activeView, graphRequest, compareInit, navigationRequest } = {}) {
  if (!SAVED_VIEW_TYPES.includes(activeView)) return null;
  const source = navigationPayloadFor(activeView, { graphRequest, compareInit, navigationRequest });
  const config = pickConfig(activeView, source);

  if (activeView === "commits" && source.query && !config.search) config.search = String(source.query).trim();
  if (activeView === "branches" && source.filter && source.filter !== "all" && !config.status) config.status = [String(source.filter)];
  if (activeView === "reflog" && source.action && source.action !== "all" && !config.actions) config.actions = [String(source.action)];
  if (activeView === "hotspots" && source.path && !config.pathPrefix) config.pathPrefix = String(source.path).trim();

  return {
    viewType: activeView,
    config: normalizeSavedViewConfigForClient(activeView, config),
    configVersion: SAVED_VIEW_CONFIG_VERSION,
  };
}

function repositoryReferenceNames(data) {
  const names = new Set(["HEAD", "current"]);
  const repository = data?.repository ?? {};
  for (const value of [repository.currentBranch, repository.defaultBranch]) {
    if (value) names.add(String(value));
  }
  for (const branch of Array.isArray(data?.branches) ? data.branches : []) {
    for (const value of [branch?.name, branch?.ref]) {
      if (value) names.add(String(value));
    }
  }
  for (const tag of Array.isArray(data?.tags) ? data.tags : []) {
    for (const value of [tag?.name, tag?.ref]) {
      if (value) names.add(String(value));
    }
  }
  for (const remote of Array.isArray(data?.remotes) ? data.remotes : []) {
    if (remote?.name) names.add(String(remote.name));
  }
  return names;
}

function referenceExists(reference, names) {
  if (!reference || reference === "current") return true;
  const value = String(reference);
  const alternatives = [
    value,
    value.replace(/^refs\/(heads|tags|remotes)\//, ""),
    value.replace(/^refs\/remotes\//, ""),
  ];
  return alternatives.some((candidate) => names.has(candidate));
}

export function getMissingSavedViewReferences(view, data) {
  const config = view?.config ?? {};
  const names = repositoryReferenceNames(data);
  const references = [];
  if (view?.viewType === "commits") references.push(...(Array.isArray(config.refs) ? config.refs : []));
  if (view?.viewType === "compare") references.push(config.base, config.head);
  if (view?.viewType === "reflog") references.push(config.ref);
  return [...new Set(references.filter((reference) => reference && !referenceExists(reference, names)))];
}

export function savedViewMatchesCurrent(view, current) {
  return Boolean(view && current && view.viewType === current.viewType && configsEqual(view.config, current.config));
}

export function getSavedViewNavigation(view) {
  if (!view || !SAVED_VIEW_TYPES.includes(view.viewType)) return null;
  if (view.viewType === "compare") return { view: "compare", payload: { ...view.config } };
  if (view.viewType === "commits") return { view: "commits", payload: { ...view.config, query: view.config.search } };
  if (view.viewType === "branches") return { view: "branches", payload: { ...view.config, filter: view.config.status?.[0] ?? "all" } };
  if (view.viewType === "hotspots") return { view: "hotspots", payload: { ...view.config } };
  if (view.viewType === "reflog") return { view: "reflog", payload: { ...view.config, action: view.config.actions?.[0] ?? "all" } };
  return { view: view.viewType, payload: { ...view.config } };
}

export function getSavedViewConfigSummary(view) {
  const config = view?.config ?? {};
  const parts = [];
  if (config.refs?.length) parts.push(`${config.refs.length} ref${config.refs.length === 1 ? "" : "s"}`);
  if (config.base && config.head) parts.push(`${config.base} → ${config.head}`);
  if (config.search || config.query) parts.push(`“${config.search ?? config.query}”`);
  if (config.pathPrefix || config.path) parts.push(config.pathPrefix ?? config.path);
  if (config.ref) parts.push(config.ref);
  return parts.join(" · ") || "All current filters";
}
