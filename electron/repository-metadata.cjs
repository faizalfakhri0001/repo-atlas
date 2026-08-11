const CURRENT_METADATA_VERSION = 2;
const REPOSITORY_ID_PATTERN = /^[0-9a-f]{64}$/;
const COMMIT_HASH_PATTERN = /^[0-9a-f]{7,64}$/i;
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
const PREFERENCE_KEYS = ["heatmap", "reflog", "worktree"];
const MAX_ID_LENGTH = 200;
const MAX_NAME_LENGTH = 160;
const MAX_LABEL_LENGTH = 160;
const MAX_CATEGORY_LENGTH = 100;
const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 20_000;
const MAX_CONFIG_DEPTH = 8;
const MAX_CONFIG_KEYS = 200;
const MAX_CONFIG_ARRAY_ITEMS = 2_000;
const MAX_CONFIG_STRING_LENGTH = 10_000;

class MetadataValidationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "MetadataValidationError";
    this.code = "METADATA_INVALID";
    this.issues = issues;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeText(value, maximum, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || value.includes("\0") || value.length > maximum) return null;
  const normalized = value.trim();
  if (!allowEmpty && !normalized) return null;
  return normalized;
}

function normalizeBody(value) {
  if (typeof value !== "string" || value.includes("\0") || value.length > MAX_BODY_LENGTH) return null;
  return value;
}

function normalizeTimestamp(value, fallback) {
  return normalizeText(value, 128) ?? fallback;
}

function resolveTimestamp(now) {
  const value = typeof now === "function" ? now() : now;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return normalizeTimestamp(value, new Date().toISOString());
}

function normalizeRepositoryIdentity(identity) {
  if (!isPlainObject(identity)) {
    throw new MetadataValidationError("Repository identity is required.");
  }

  const repositoryId = normalizeText(identity.repositoryId, 64);
  if (!repositoryId || !REPOSITORY_ID_PATTERN.test(repositoryId)) {
    throw new MetadataValidationError("Repository identity contains an invalid repository ID.");
  }

  const commonGitDir = normalizeText(identity.commonGitDir, 4096);
  if (!commonGitDir) {
    throw new MetadataValidationError("Repository identity contains an invalid common Git directory.");
  }

  return {
    repositoryId,
    commonGitDir,
    lastKnownName: normalizeText(identity.lastKnownName ?? identity.name, MAX_NAME_LENGTH, { allowEmpty: true }) ?? "",
  };
}

function cloneJsonValue(value, depth = 0) {
  if (depth > MAX_CONFIG_DEPTH) throw new MetadataValidationError("Metadata configuration is too deeply nested.");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.includes("\0") || value.length > MAX_CONFIG_STRING_LENGTH) {
      throw new MetadataValidationError("Metadata configuration contains an invalid string.");
    }
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new MetadataValidationError("Metadata configuration contains an invalid number.");
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_CONFIG_ARRAY_ITEMS) throw new MetadataValidationError("Metadata configuration contains too many items.");
    return value.map((item) => cloneJsonValue(item, depth + 1));
  }
  if (!isPlainObject(value)) throw new MetadataValidationError("Metadata configuration must contain plain JSON objects.");

  const keys = Object.keys(value);
  if (keys.length > MAX_CONFIG_KEYS) throw new MetadataValidationError("Metadata configuration contains too many keys.");
  const clone = {};
  for (const key of keys) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      throw new MetadataValidationError("Metadata configuration contains an unsafe key.");
    }
    clone[key] = cloneJsonValue(value[key], depth + 1);
  }
  return clone;
}

function sanitizeSavedView(value, issues, index) {
  if (!isPlainObject(value)) {
    issues.push(`savedViews[${index}] was discarded because it is not an object.`);
    return null;
  }
  const id = normalizeText(value.id, MAX_ID_LENGTH);
  const name = normalizeText(value.name, MAX_NAME_LENGTH);
  const viewType = normalizeText(value.viewType, 32);
  const configVersion = value.configVersion;
  const createdAt = normalizeText(value.createdAt, 128);
  const updatedAt = normalizeText(value.updatedAt, 128);
  const lastOpenedAt = value.lastOpenedAt === null ? null : normalizeText(value.lastOpenedAt, 128);
  if (
    !id ||
    !name ||
    !VIEW_TYPES.has(viewType) ||
    !Number.isSafeInteger(configVersion) ||
    configVersion < 1 ||
    !isPlainObject(value.config) ||
    typeof value.pinned !== "boolean" ||
    !createdAt ||
    !updatedAt ||
    (value.lastOpenedAt !== null && !lastOpenedAt)
  ) {
    issues.push(`savedViews[${index}] was discarded because its fields are invalid.`);
    return null;
  }

  let config;
  try {
    config = cloneJsonValue(value.config);
  } catch {
    issues.push(`savedViews[${index}] was discarded because its configuration is invalid.`);
    return null;
  }

  return {
    id,
    name,
    viewType,
    configVersion,
    config,
    pinned: value.pinned,
    createdAt,
    updatedAt,
    lastOpenedAt,
  };
}

function sanitizeCollection(value, field, sanitizer, issues) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push(`${field} was reset because it is not an array.`);
    return [];
  }
  return value.map((item, index) => sanitizer(item, issues, index)).filter(Boolean);
}

function sanitizeBookmark(value, issues, index) {
  if (!isPlainObject(value)) {
    issues.push(`bookmarks[${index}] was discarded because it is not an object.`);
    return null;
  }
  const id = normalizeText(value.id, MAX_ID_LENGTH);
  const commitHash = normalizeText(value.commitHash, 64);
  const label = value.label === null ? null : normalizeText(value.label, MAX_LABEL_LENGTH);
  const category = value.category === null ? null : normalizeText(value.category, MAX_CATEGORY_LENGTH);
  const createdAt = normalizeText(value.createdAt, 128);
  const updatedAt = normalizeText(value.updatedAt, 128);
  if (
    !id ||
    !commitHash ||
    !COMMIT_HASH_PATTERN.test(commitHash) ||
    (value.label !== null && !label) ||
    (value.category !== null && !category) ||
    !createdAt ||
    !updatedAt
  ) {
    issues.push(`bookmarks[${index}] was discarded because its fields are invalid.`);
    return null;
  }
  return { id, commitHash: commitHash.toLowerCase(), label, category, createdAt, updatedAt };
}

function sanitizeNote(value, issues, index) {
  if (!isPlainObject(value)) {
    issues.push(`notes[${index}] was discarded because it is not an object.`);
    return null;
  }
  const id = normalizeText(value.id, MAX_ID_LENGTH);
  const targetId = normalizeText(value.targetId, 64);
  const title = value.title === undefined ? undefined : normalizeText(value.title, MAX_TITLE_LENGTH);
  const body = normalizeBody(value.body);
  const createdAt = normalizeText(value.createdAt, 128);
  const updatedAt = normalizeText(value.updatedAt, 128);
  if (
    !id ||
    value.targetType !== "commit" ||
    !targetId ||
    !COMMIT_HASH_PATTERN.test(targetId) ||
    (value.title !== undefined && !title) ||
    body === null ||
    !createdAt ||
    !updatedAt
  ) {
    issues.push(`notes[${index}] was discarded because its fields are invalid.`);
    return null;
  }
  return {
    id,
    targetType: "commit",
    targetId: targetId.toLowerCase(),
    ...(title ? { title } : {}),
    body,
    createdAt,
    updatedAt,
  };
}

function sanitizePreferences(value, issues) {
  if (value === undefined) return {};
  if (!isPlainObject(value)) {
    issues.push("preferences was reset because it is not an object.");
    return {};
  }

  const preferences = {};
  for (const key of PREFERENCE_KEYS) {
    if (value[key] === undefined) continue;
    if (!isPlainObject(value[key])) {
      issues.push(`preferences.${key} was discarded because it is not an object.`);
      continue;
    }
    try {
      preferences[key] = cloneJsonValue(value[key]);
    } catch {
      issues.push(`preferences.${key} was discarded because it is invalid.`);
    }
  }
  return preferences;
}

function normalizeV2Metadata(value, identity, now) {
  if (!isPlainObject(value) || value.version !== CURRENT_METADATA_VERSION) {
    throw new MetadataValidationError("Repository metadata is not a version 2 object.");
  }
  const currentIdentity = normalizeRepositoryIdentity(identity);
  if (!isPlainObject(value.repository)) {
    throw new MetadataValidationError("Repository metadata has no valid repository identity.");
  }

  const storedId = normalizeText(value.repository.id, 64);
  const storedCommonGitDir = normalizeText(value.repository.commonGitDir, 4096);
  if (storedId !== currentIdentity.repositoryId || storedCommonGitDir !== currentIdentity.commonGitDir) {
    throw new MetadataValidationError("Repository metadata belongs to a different repository.");
  }

  const issues = [];
  const lastKnownName = normalizeText(value.repository.lastKnownName, MAX_NAME_LENGTH, { allowEmpty: true });
  if (value.repository.lastKnownName !== undefined && lastKnownName === null) {
    issues.push("repository.lastKnownName was replaced with the current repository name.");
  }
  const updatedAt = normalizeText(value.updatedAt, 128);
  if (!updatedAt) issues.push("updatedAt was replaced with the current time.");

  return {
    metadata: {
      version: CURRENT_METADATA_VERSION,
      repository: {
        id: currentIdentity.repositoryId,
        commonGitDir: currentIdentity.commonGitDir,
        lastKnownName: lastKnownName ?? currentIdentity.lastKnownName,
      },
      savedViews: sanitizeCollection(value.savedViews, "savedViews", sanitizeSavedView, issues),
      bookmarks: sanitizeCollection(value.bookmarks, "bookmarks", sanitizeBookmark, issues),
      notes: sanitizeCollection(value.notes, "notes", sanitizeNote, issues),
      preferences: sanitizePreferences(value.preferences, issues),
      updatedAt: updatedAt ?? resolveTimestamp(now),
    },
    migrated: false,
    issues,
  };
}

function migrateV1Metadata(value, identity, now) {
  if (!isPlainObject(value)) throw new MetadataValidationError("Repository metadata is not an object.");
  const legacyRepository = isPlainObject(value.repository) ? value.repository : {};
  const migrated = {
    version: CURRENT_METADATA_VERSION,
    repository: {
      id: normalizeRepositoryIdentity(identity).repositoryId,
      commonGitDir: normalizeRepositoryIdentity(identity).commonGitDir,
      lastKnownName: legacyRepository.lastKnownName ?? value.lastKnownName ?? normalizeRepositoryIdentity(identity).lastKnownName,
    },
    savedViews: value.savedViews ?? value.views,
    bookmarks: value.bookmarks,
    notes: value.notes,
    preferences: value.preferences,
    updatedAt: value.updatedAt,
  };
  const normalized = normalizeV2Metadata(migrated, identity, now);
  return {
    ...normalized,
    migrated: true,
    issues: ["Repository metadata was migrated from version 1.", ...normalized.issues],
  };
}

function looksLikeLegacyMetadata(value) {
  return isPlainObject(value) && ["repository", "savedViews", "views", "bookmarks", "notes", "preferences", "updatedAt"].some((key) => key in value);
}

function normalizeMetadata(value, identity, now = new Date().toISOString()) {
  if (isPlainObject(value) && value.version === CURRENT_METADATA_VERSION) {
    return normalizeV2Metadata(value, identity, now);
  }
  if (isPlainObject(value) && (value.version === 1 || (value.version === undefined && looksLikeLegacyMetadata(value)))) {
    return migrateV1Metadata(value, identity, now);
  }
  throw new MetadataValidationError("Repository metadata has an unsupported version.");
}

function createEmptyMetadata(identity, now = new Date().toISOString()) {
  const normalizedIdentity = normalizeRepositoryIdentity(identity);
  return {
    version: CURRENT_METADATA_VERSION,
    repository: {
      id: normalizedIdentity.repositoryId,
      commonGitDir: normalizedIdentity.commonGitDir,
      lastKnownName: normalizedIdentity.lastKnownName,
    },
    savedViews: [],
    bookmarks: [],
    notes: [],
    preferences: {},
    updatedAt: resolveTimestamp(now),
  };
}

module.exports = {
  COMMIT_HASH_PATTERN,
  CURRENT_METADATA_VERSION,
  MetadataValidationError,
  REPOSITORY_ID_PATTERN,
  VIEW_TYPES: [...VIEW_TYPES],
  createEmptyMetadata,
  looksLikeLegacyMetadata,
  migrateV1Metadata,
  normalizeMetadata,
  normalizeRepositoryIdentity,
};
