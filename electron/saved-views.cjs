const crypto = require("node:crypto");
const {
  GitServiceError,
  assertRefName,
  resolveRepository,
} = require("./git/core.cjs");

const SAVED_VIEW_CONFIG_VERSION = 1;
const MAX_SAVED_VIEW_NAME_LENGTH = 80;
const MAX_SAVED_VIEW_STRING_LENGTH = 500;
const MAX_SAVED_VIEW_ITEMS = 50;
const MAX_SAVED_VIEWS = 1000;

const VIEW_TYPES = new Set([
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

const ACTIONS = new Set(["commit", "checkout", "reset", "rebase", "merge", "cherry-pick", "amend", "other"]);
const BRANCH_STATUSES = new Set(["current", "ahead", "behind", "diverged", "stale", "merged", "gone", "healthy", "remote"]);
const COMMIT_ORDERS = new Set(["topo", "date"]);
const BRANCH_SORTS = new Set(["name", "date", "status", "ahead", "behind"]);
const PERIODS = new Set(["all", "12m"]);

const SCHEMA_KEYS = Object.freeze({
  commits: new Set(["refs", "order", "search", "author", "path", "dateRange"]),
  files: new Set(["pathPrefix", "filter", "extension", "status", "showOwnership"]),
  branches: new Set(["status", "sort", "direction", "localOnly"]),
  compare: new Set(["base", "head"]),
  hotspots: new Set(["pathPrefix", "extension", "includeGenerated", "sort"]),
  ownership: new Set(["path", "period", "contributor"]),
  activity: new Set(["range", "metric", "author", "pathPrefix"]),
  reflog: new Set(["ref", "actions", "search"]),
  search: new Set(["query", "types"]),
});

class SavedViewValidationError extends GitServiceError {
  constructor(message, issues = []) {
    super(message, "SAVED_VIEW_INVALID", issues.join("; "));
    this.name = "SavedViewValidationError";
    this.issues = issues;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function requireText(value, field, maximum = MAX_SAVED_VIEW_STRING_LENGTH) {
  if (typeof value !== "string" || value.includes("\0")) {
    throw new SavedViewValidationError(`${field} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new SavedViewValidationError(`${field} must contain between 1 and ${maximum} characters.`);
  }
  return normalized;
}

function optionalText(value, field, maximum = MAX_SAVED_VIEW_STRING_LENGTH) {
  if (value === undefined || value === null || value === "") return undefined;
  return requireText(value, field, maximum);
}

function optionalBoolean(value, field) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new SavedViewValidationError(`${field} must be a boolean.`);
  return value;
}

function optionalEnum(value, field, allowed) {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = requireText(value, field, 64);
  if (!allowed.has(normalized)) throw new SavedViewValidationError(`${field} is not supported.`);
  return normalized;
}

function optionalStringArray(value, field, { allowed, maxItems = MAX_SAVED_VIEW_ITEMS } = {}) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new SavedViewValidationError(`${field} must contain at most ${maxItems} items.`);
  }
  const values = [...new Set(value.map((item) => requireText(item, `${field} item`, MAX_SAVED_VIEW_STRING_LENGTH)))];
  if (allowed && values.some((item) => !allowed.has(item))) throw new SavedViewValidationError(`${field} contains an unsupported value.`);
  return values;
}

function optionalRef(value, field) {
  const normalized = optionalText(value, field, MAX_SAVED_VIEW_STRING_LENGTH);
  if (normalized === undefined || normalized === "current") return normalized;
  try {
    assertRefName(normalized);
  } catch {
    throw new SavedViewValidationError(`${field} contains an invalid Git reference.`);
  }
  return normalized;
}

function optionalDateRange(value) {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) throw new SavedViewValidationError("dateRange must be an object.");
  const unknown = Object.keys(value).filter((key) => !["from", "to"].includes(key));
  if (unknown.length > 0) throw new SavedViewValidationError(`dateRange contains unsupported keys: ${unknown.join(", ")}.`);
  const result = {};
  for (const key of ["from", "to"]) {
    const date = optionalText(value[key], `dateRange.${key}`, 32);
    if (date === undefined) continue;
    if (Number.isNaN(Date.parse(date))) throw new SavedViewValidationError(`dateRange.${key} must be a valid date.`);
    result[key] = date;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function validateConfigKeys(viewType, config) {
  if (!isPlainObject(config)) throw new SavedViewValidationError("Saved view config must be a plain object.");
  const allowed = SCHEMA_KEYS[viewType];
  const unknown = Object.keys(config).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new SavedViewValidationError(`Config for ${viewType} contains unsupported keys: ${unknown.join(", ")}.`);
}

function normalizeSavedViewConfig(viewType, input = {}) {
  if (typeof viewType !== "string" || !VIEW_TYPES.has(viewType)) {
    throw new SavedViewValidationError("Saved view type is not supported.");
  }
  validateConfigKeys(viewType, input);
  const config = {};

  if (viewType === "commits") {
    const refs = optionalStringArray(input.refs, "refs");
    const order = optionalEnum(input.order, "order", COMMIT_ORDERS);
    const search = optionalText(input.search, "search");
    const author = optionalText(input.author, "author");
    const path = optionalText(input.path, "path");
    const dateRange = optionalDateRange(input.dateRange);
    if (refs?.length) config.refs = refs.map((ref) => optionalRef(ref, "refs"));
    if (order) config.order = order;
    if (search) config.search = search;
    if (author) config.author = author;
    if (path) config.path = path;
    if (dateRange) config.dateRange = dateRange;
  } else if (viewType === "files") {
    const pathPrefix = optionalText(input.pathPrefix, "pathPrefix");
    const filter = optionalText(input.filter, "filter");
    const extension = optionalText(input.extension, "extension", 32);
    const status = optionalText(input.status, "status", 32);
    const showOwnership = optionalBoolean(input.showOwnership, "showOwnership");
    if (pathPrefix) config.pathPrefix = pathPrefix;
    if (filter) config.filter = filter;
    if (extension) config.extension = extension;
    if (status) config.status = status;
    if (showOwnership !== undefined) config.showOwnership = showOwnership;
  } else if (viewType === "branches") {
    const status = optionalStringArray(input.status, "status", { allowed: BRANCH_STATUSES });
    const sort = optionalEnum(input.sort, "sort", BRANCH_SORTS);
    const direction = optionalEnum(input.direction, "direction", new Set(["asc", "desc"]));
    const localOnly = optionalBoolean(input.localOnly, "localOnly");
    if (status?.length) config.status = status;
    if (sort) config.sort = sort;
    if (direction) config.direction = direction;
    if (localOnly !== undefined) config.localOnly = localOnly;
  } else if (viewType === "compare") {
    const base = optionalRef(input.base, "base");
    const head = optionalRef(input.head, "head");
    if (!base || !head) throw new SavedViewValidationError("Compare views require both base and head references.");
    config.base = base;
    config.head = head;
  } else if (viewType === "hotspots") {
    const pathPrefix = optionalText(input.pathPrefix, "pathPrefix");
    const extension = optionalText(input.extension, "extension", 32);
    const includeGenerated = optionalBoolean(input.includeGenerated, "includeGenerated");
    const sort = optionalEnum(input.sort, "sort", new Set(["score", "frequency", "churn", "recency", "path"]));
    if (pathPrefix) config.pathPrefix = pathPrefix;
    if (extension) config.extension = extension;
    if (includeGenerated !== undefined) config.includeGenerated = includeGenerated;
    if (sort) config.sort = sort;
  } else if (viewType === "ownership") {
    const path = optionalText(input.path, "path");
    const period = optionalEnum(input.period, "period", PERIODS);
    const contributor = optionalText(input.contributor, "contributor");
    if (path) config.path = path;
    if (period) config.period = period;
    if (contributor) config.contributor = contributor;
  } else if (viewType === "activity") {
    const range = optionalText(input.range, "range", 32);
    const metric = optionalText(input.metric, "metric", 32);
    const author = optionalText(input.author, "author");
    const pathPrefix = optionalText(input.pathPrefix, "pathPrefix");
    if (!range || !metric) throw new SavedViewValidationError("Activity views require range and metric.");
    config.range = range;
    config.metric = metric;
    if (author) config.author = author;
    if (pathPrefix) config.pathPrefix = pathPrefix;
  } else if (viewType === "reflog") {
    const ref = optionalRef(input.ref, "ref");
    const actions = optionalStringArray(input.actions, "actions", { allowed: ACTIONS });
    const search = optionalText(input.search, "search");
    if (ref) config.ref = ref;
    if (actions?.length) config.actions = actions;
    if (search) config.search = search;
  } else if (viewType === "search") {
    const query = optionalText(input.query, "query", 2000);
    const types = optionalStringArray(input.types, "types", { maxItems: 10 });
    if (!query) throw new SavedViewValidationError("Search views require a query.");
    config.query = query;
    if (types?.length) config.types = types;
  }

  return config;
}

function normalizeTimestamp(value, field, { allowNull = false } = {}) {
  if (value === null && allowNull) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new SavedViewValidationError(`${field} must be an ISO timestamp.`);
  }
  return new Date(value).toISOString();
}

function normalizeSavedViewRecord(value, { now = new Date().toISOString(), requireId = true } = {}) {
  if (!isPlainObject(value)) throw new SavedViewValidationError("Saved view must be a plain object.");
  const id = requireId ? requireText(value.id, "id", 200) : value.id ? requireText(value.id, "id", 200) : crypto.randomUUID();
  const name = requireText(value.name, "name", MAX_SAVED_VIEW_NAME_LENGTH);
  const viewType = requireText(value.viewType, "viewType", 32);
  if (!VIEW_TYPES.has(viewType)) throw new SavedViewValidationError("Saved view type is not supported.");
  const configVersion = value.configVersion === undefined ? SAVED_VIEW_CONFIG_VERSION : value.configVersion;
  if (configVersion !== SAVED_VIEW_CONFIG_VERSION) throw new SavedViewValidationError("Saved view config version is not supported.");
  const config = normalizeSavedViewConfig(viewType, value.config ?? {});
  if (typeof value.pinned !== "boolean") throw new SavedViewValidationError("pinned must be a boolean.");
  const createdAt = value.createdAt === undefined ? normalizeTimestamp(now, "createdAt") : normalizeTimestamp(value.createdAt, "createdAt");
  const updatedAt = value.updatedAt === undefined ? createdAt : normalizeTimestamp(value.updatedAt, "updatedAt");
  const lastOpenedAt = value.lastOpenedAt === undefined ? null : normalizeTimestamp(value.lastOpenedAt, "lastOpenedAt", { allowNull: true });
  return { id, name, viewType, configVersion, config, pinned: value.pinned, createdAt, updatedAt, lastOpenedAt };
}

function migrateSavedView(value, options = {}) {
  return normalizeSavedViewRecord(value, options);
}

function normalizeStoredViews(views, now) {
  if (!Array.isArray(views)) return [];
  return views
    .slice(0, MAX_SAVED_VIEWS)
    .map((view) => {
      try {
        return migrateSavedView(view, { now });
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function repositoryIdentity(repository) {
  return {
    repositoryId: repository.repositoryId,
    commonGitDir: repository.commonGitDir,
    lastKnownName: repository.name,
  };
}

function findView(views, id) {
  const normalizedId = requireText(id, "id", 200);
  const view = views.find((candidate) => candidate.id === normalizedId);
  if (!view) throw new GitServiceError("Saved view was not found.", "SAVED_VIEW_NOT_FOUND");
  return view;
}

function createSavedViewService({ store, resolveRepository: resolveRepositoryFn = resolveRepository, now = () => new Date().toISOString(), idFactory = () => crypto.randomUUID() } = {}) {
  if (!store || typeof store.load !== "function" || typeof store.save !== "function") throw new TypeError("A repository metadata store is required.");

  async function loadContext(repositoryPath) {
    const repository = await resolveRepositoryFn(repositoryPath);
    const identity = repositoryIdentity(repository);
    const loaded = await store.load(identity);
    const savedViews = normalizeStoredViews(loaded.metadata.savedViews, now());
    return { repository, identity, loaded, metadata: { ...loaded.metadata, savedViews } };
  }

  async function persist(context, savedViews) {
    const metadata = await store.save({ ...context.metadata, savedViews }, { createBackup: true });
    return normalizeStoredViews(metadata.savedViews, now());
  }

  async function listSavedViews(repositoryPath) {
    const context = await loadContext(repositoryPath);
    return {
      repositoryId: context.identity.repositoryId,
      savedViews: context.metadata.savedViews,
      source: context.loaded.source,
      warning: context.loaded.warning ?? null,
    };
  }

  async function createSavedView(repositoryPath, input = {}) {
    const context = await loadContext(repositoryPath);
    if (context.metadata.savedViews.length >= MAX_SAVED_VIEWS) throw new SavedViewValidationError("The saved view limit has been reached.");
    const timestamp = now();
    const savedView = normalizeSavedViewRecord({
      ...input,
      id: input.id ?? idFactory(),
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: null,
      pinned: Boolean(input.pinned),
    }, { now: timestamp });
    const savedViews = await persist(context, [...context.metadata.savedViews, savedView]);
    return { repositoryId: context.identity.repositoryId, savedView, savedViews };
  }

  async function updateSavedView(repositoryPath, input = {}) {
    const context = await loadContext(repositoryPath);
    const current = findView(context.metadata.savedViews, input.id);
    const timestamp = now();
    const next = normalizeSavedViewRecord({
      ...current,
      ...input,
      id: current.id,
      viewType: input.viewType ?? current.viewType,
      configVersion: current.configVersion,
      config: input.config ?? current.config,
      name: input.name ?? current.name,
      pinned: input.pinned === undefined ? current.pinned : input.pinned,
      createdAt: current.createdAt,
      updatedAt: timestamp,
      lastOpenedAt: input.lastOpenedAt === undefined ? current.lastOpenedAt : input.lastOpenedAt,
    }, { now: timestamp });
    const savedViews = await persist(context, context.metadata.savedViews.map((view) => (view.id === current.id ? next : view)));
    return { repositoryId: context.identity.repositoryId, savedView: next, savedViews };
  }

  async function deleteSavedView(repositoryPath, input = {}) {
    const context = await loadContext(repositoryPath);
    const current = findView(context.metadata.savedViews, input.id);
    const savedViews = await persist(context, context.metadata.savedViews.filter((view) => view.id !== current.id));
    return { repositoryId: context.identity.repositoryId, deletedId: current.id, savedViews };
  }

  return { createSavedView, deleteSavedView, listSavedViews, updateSavedView };
}

module.exports = {
  ACTIONS: [...ACTIONS],
  BRANCH_STATUSES: [...BRANCH_STATUSES],
  MAX_SAVED_VIEWS,
  MAX_SAVED_VIEW_NAME_LENGTH,
  SAVED_VIEW_CONFIG_VERSION,
  SAVED_VIEW_STRING_LIMIT: MAX_SAVED_VIEW_STRING_LENGTH,
  SavedViewValidationError,
  VIEW_TYPES: [...VIEW_TYPES],
  createSavedViewService,
  migrateSavedView,
  normalizeSavedViewConfig,
  normalizeSavedViewRecord,
};
