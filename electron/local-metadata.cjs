const crypto = require("node:crypto");
const {
  GitServiceError,
  resolveRepository,
  runGit,
} = require("./git/core.cjs");

const MAX_BOOKMARKS = 1000;
const MAX_NOTES = 1000;
const MAX_BOOKMARK_LABEL_LENGTH = 120;
const MAX_BOOKMARK_CATEGORY_LENGTH = 60;
const MAX_NOTE_TITLE_LENGTH = 120;
const MAX_NOTE_BODY_LENGTH = 10_000;
const MAX_ID_LENGTH = 200;

class LocalMetadataValidationError extends GitServiceError {
  constructor(message) {
    super(message, "LOCAL_METADATA_INVALID");
    this.name = "LocalMetadataValidationError";
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

function requireInputObject(value) {
  if (!isPlainObject(value)) throw new LocalMetadataValidationError("Metadata input must be an object.");
  return value;
}

function requireIdValue(value) {
  if (typeof value !== "string" || value.includes("\0")) {
    throw new LocalMetadataValidationError("A metadata record ID is required.");
  }
  const id = value.trim();
  if (!id || id.length > MAX_ID_LENGTH) {
    throw new LocalMetadataValidationError(`Metadata record IDs must contain between 1 and ${MAX_ID_LENGTH} characters.`);
  }
  return id;
}

function requireCommitHash(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{7,64}$/i.test(value.trim())) {
    throw new LocalMetadataValidationError("A valid commit hash is required.");
  }
  return value.trim().toLowerCase();
}

function optionalText(value, field, maximum) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.includes("\0")) {
    throw new LocalMetadataValidationError(`${field} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maximum) {
    throw new LocalMetadataValidationError(`${field} must contain at most ${maximum} characters.`);
  }
  return normalized;
}

function normalizeNoteBody(value) {
  if (typeof value !== "string" || value.includes("\0")) {
    throw new LocalMetadataValidationError("Note body must be a string.");
  }
  if (value.length > MAX_NOTE_BODY_LENGTH) {
    throw new LocalMetadataValidationError(`Note body must contain at most ${MAX_NOTE_BODY_LENGTH} characters.`);
  }
  return value;
}

function normalizeTimestamp(value, field) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new LocalMetadataValidationError(`${field} must be an ISO timestamp.`);
  }
  return new Date(value).toISOString();
}

function resolveTimestamp(now) {
  const value = typeof now === "function" ? now() : now;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

function normalizeBookmarkRecord(value, { requireId = true, now = new Date().toISOString() } = {}) {
  const input = requireInputObject(value);
  const id = requireId ? requireIdValue(input.id) : input.id === undefined ? crypto.randomUUID() : requireIdValue(input.id);
  const commitHash = requireCommitHash(input.commitHash);
  const label = optionalText(input.label, "Bookmark label", MAX_BOOKMARK_LABEL_LENGTH);
  const category = optionalText(input.category, "Bookmark category", MAX_BOOKMARK_CATEGORY_LENGTH);
  const createdAt = input.createdAt === undefined ? normalizeTimestamp(now, "createdAt") : normalizeTimestamp(input.createdAt, "createdAt");
  const updatedAt = input.updatedAt === undefined ? createdAt : normalizeTimestamp(input.updatedAt, "updatedAt");
  return { id, commitHash, label, category, createdAt, updatedAt };
}

function normalizeNoteRecord(value, { requireId = true, now = new Date().toISOString() } = {}) {
  const input = requireInputObject(value);
  const id = requireId ? requireIdValue(input.id) : input.id === undefined ? crypto.randomUUID() : requireIdValue(input.id);
  if (input.targetType !== "commit") throw new LocalMetadataValidationError("Only commit notes are supported.");
  const targetId = requireCommitHash(input.targetId);
  const title = optionalText(input.title, "Note title", MAX_NOTE_TITLE_LENGTH);
  const body = normalizeNoteBody(input.body);
  const createdAt = input.createdAt === undefined ? normalizeTimestamp(now, "createdAt") : normalizeTimestamp(input.createdAt, "createdAt");
  const updatedAt = input.updatedAt === undefined ? createdAt : normalizeTimestamp(input.updatedAt, "updatedAt");
  return {
    id,
    targetType: "commit",
    targetId,
    ...(title ? { title } : {}),
    body,
    createdAt,
    updatedAt,
  };
}

function repositoryIdentity(repository) {
  return {
    repositoryId: repository.repositoryId,
    commonGitDir: repository.commonGitDir,
    lastKnownName: repository.name,
  };
}

function normalizeStoredRecords(values, normalizer) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => {
    try {
      return normalizer(value);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function findRecord(records, id, label) {
  const normalizedId = requireIdValue(id);
  const record = records.find((candidate) => candidate.id === normalizedId);
  if (!record) throw new GitServiceError(`${label} was not found.`, "LOCAL_METADATA_NOT_FOUND");
  return record;
}

function createLocalMetadataService({
  store,
  resolveRepository: resolveRepositoryFn = resolveRepository,
  commitExists = defaultCommitExists,
  now = () => new Date().toISOString(),
  idFactory = () => crypto.randomUUID(),
} = {}) {
  if (!store || typeof store.load !== "function" || typeof store.save !== "function") {
    throw new TypeError("A repository metadata store is required.");
  }
  if (typeof commitExists !== "function") throw new TypeError("A commit existence check is required.");

  async function loadContext(repositoryPath) {
    const repository = await resolveRepositoryFn(repositoryPath);
    const identity = repositoryIdentity(repository);
    const loaded = await store.load(identity);
    const metadata = {
      ...loaded.metadata,
      bookmarks: normalizeStoredRecords(loaded.metadata.bookmarks, (value) => normalizeBookmarkRecord(value)),
      notes: normalizeStoredRecords(loaded.metadata.notes, (value) => normalizeNoteRecord(value)),
    };
    return { repository, identity, loaded, metadata };
  }

  async function persist(context, metadata) {
    const saved = await store.save({ ...context.metadata, ...metadata }, { createBackup: true });
    return {
      ...saved,
      bookmarks: normalizeStoredRecords(saved.bookmarks, (value) => normalizeBookmarkRecord(value)),
      notes: normalizeStoredRecords(saved.notes, (value) => normalizeNoteRecord(value)),
    };
  }

  async function assertCommitAvailable(repository, hash) {
    const normalizedHash = requireCommitHash(hash);
    await commitExists(repository, normalizedHash);
    return normalizedHash;
  }

  function response(context, records, field) {
    return {
      repositoryId: context.identity.repositoryId,
      [field]: records,
      source: context.loaded.source,
      warning: context.loaded.warning ?? null,
    };
  }

  async function listBookmarks(repositoryPath) {
    const context = await loadContext(repositoryPath);
    return response(context, context.metadata.bookmarks, "bookmarks");
  }

  async function createBookmark(repositoryPath, input = {}) {
    const context = await loadContext(repositoryPath);
    if (context.metadata.bookmarks.length >= MAX_BOOKMARKS) throw new LocalMetadataValidationError("The bookmark limit has been reached.");
    const value = requireInputObject(input);
    const commitHash = await assertCommitAvailable(context.repository, value.commitHash);
    const timestamp = resolveTimestamp(now);
    const id = value.id === undefined ? idFactory() : value.id;
    const bookmark = normalizeBookmarkRecord({ ...value, id, commitHash, createdAt: timestamp, updatedAt: timestamp }, { now: timestamp });
    if (context.metadata.bookmarks.some((candidate) => candidate.id === bookmark.id)) {
      throw new LocalMetadataValidationError("A bookmark with this ID already exists.");
    }
    const metadata = await persist(context, { bookmarks: [...context.metadata.bookmarks, bookmark] });
    return { ...response(context, metadata.bookmarks, "bookmarks"), bookmark };
  }

  async function updateBookmark(repositoryPath, input = {}) {
    const context = await loadContext(repositoryPath);
    const value = requireInputObject(input);
    const current = findRecord(context.metadata.bookmarks, value.id, "Bookmark");
    const commitHash = hasOwn(value, "commitHash") ? await assertCommitAvailable(context.repository, value.commitHash) : current.commitHash;
    const timestamp = resolveTimestamp(now);
    const bookmark = normalizeBookmarkRecord({
      id: current.id,
      commitHash,
      label: hasOwn(value, "label") ? value.label : current.label,
      category: hasOwn(value, "category") ? value.category : current.category,
      createdAt: current.createdAt,
      updatedAt: timestamp,
    }, { now: timestamp });
    const metadata = await persist(context, { bookmarks: context.metadata.bookmarks.map((candidate) => candidate.id === current.id ? bookmark : candidate) });
    return { ...response(context, metadata.bookmarks, "bookmarks"), bookmark };
  }

  async function deleteBookmark(repositoryPath, input = {}) {
    const context = await loadContext(repositoryPath);
    const current = findRecord(context.metadata.bookmarks, input?.id, "Bookmark");
    const metadata = await persist(context, { bookmarks: context.metadata.bookmarks.filter((candidate) => candidate.id !== current.id) });
    return { ...response(context, metadata.bookmarks, "bookmarks"), deletedId: current.id };
  }

  async function listNotes(repositoryPath) {
    const context = await loadContext(repositoryPath);
    return response(context, context.metadata.notes, "notes");
  }

  async function createNote(repositoryPath, input = {}) {
    const context = await loadContext(repositoryPath);
    if (context.metadata.notes.length >= MAX_NOTES) throw new LocalMetadataValidationError("The note limit has been reached.");
    const value = requireInputObject(input);
    const targetId = await assertCommitAvailable(context.repository, value.targetId);
    const timestamp = resolveTimestamp(now);
    const id = value.id === undefined ? idFactory() : value.id;
    const note = normalizeNoteRecord({ ...value, id, targetType: "commit", targetId, createdAt: timestamp, updatedAt: timestamp }, { now: timestamp });
    if (context.metadata.notes.some((candidate) => candidate.id === note.id)) {
      throw new LocalMetadataValidationError("A note with this ID already exists.");
    }
    const metadata = await persist(context, { notes: [...context.metadata.notes, note] });
    return { ...response(context, metadata.notes, "notes"), note };
  }

  async function updateNote(repositoryPath, input = {}) {
    const context = await loadContext(repositoryPath);
    const value = requireInputObject(input);
    const current = findRecord(context.metadata.notes, value.id, "Note");
    const targetId = hasOwn(value, "targetId") ? await assertCommitAvailable(context.repository, value.targetId) : current.targetId;
    const timestamp = resolveTimestamp(now);
    const note = normalizeNoteRecord({
      id: current.id,
      targetType: "commit",
      targetId,
      title: hasOwn(value, "title") ? value.title : current.title,
      body: hasOwn(value, "body") ? value.body : current.body,
      createdAt: current.createdAt,
      updatedAt: timestamp,
    }, { now: timestamp });
    const metadata = await persist(context, { notes: context.metadata.notes.map((candidate) => candidate.id === current.id ? note : candidate) });
    return { ...response(context, metadata.notes, "notes"), note };
  }

  async function deleteNote(repositoryPath, input = {}) {
    const context = await loadContext(repositoryPath);
    const current = findRecord(context.metadata.notes, input?.id, "Note");
    const metadata = await persist(context, { notes: context.metadata.notes.filter((candidate) => candidate.id !== current.id) });
    return { ...response(context, metadata.notes, "notes"), deletedId: current.id };
  }

  return {
    createBookmark,
    createNote,
    deleteBookmark,
    deleteNote,
    listBookmarks,
    listNotes,
    updateBookmark,
    updateNote,
  };
}

async function defaultCommitExists(repository, hash) {
  const result = await runGit(repository.rootPath, ["cat-file", "-e", `${requireCommitHash(hash)}^{commit}`], { allowFailure: true });
  if (result.failed) throw new GitServiceError("The selected commit could not be found in this repository.", "COMMIT_NOT_FOUND");
}

module.exports = {
  MAX_BOOKMARK_CATEGORY_LENGTH,
  MAX_BOOKMARK_LABEL_LENGTH,
  MAX_BOOKMARKS,
  MAX_NOTE_BODY_LENGTH,
  MAX_NOTE_TITLE_LENGTH,
  MAX_NOTES,
  LocalMetadataValidationError,
  createLocalMetadataService,
  normalizeBookmarkRecord,
  normalizeNoteRecord,
};
