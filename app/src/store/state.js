import { uid } from "../lib/id.js";
import { buildSeed } from "./seed.js";
import { collect, fingerprint, keyOf, applyRemoteRows } from "./entities.js";

const KEY = "dezk.state.v1";
const SCHEMA_VERSION = 2;
const UNDO_LIMIT = 30;
const TOMBSTONE_DAYS = 90;

const clone = (value) =>
  typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));

export const DEFAULT_SETTINGS = {
  theme: "dark",
  accent: "lime",
  weekStart: 1,
  displayName: "",
  focusMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  startPage: "#/today",
  confirmDelete: true,
  sidebarOpen: true,
  showCompleted: false,
};

function emptyState() {
  return {
    version: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    categories: [],
    projects: [],
    tasks: [],
    habits: [],
    notes: [],
    pages: [],
    focus: { sessions: [] },
    graveyard: [],
    sync: emptySync(),
    meta: { createdAt: new Date().toISOString(), lastOpened: null },
  };
}

/** Device-local: never synced, never exported. */
function emptySync() {
  return {
    url: "",
    token: "",
    cursor: 0,
    dirty: {},
    lastSyncedAt: null,
    lastError: null,
    deviceId: uid("dev"),
    deviceName: "",
  };
}

/** Fill in anything a stored payload is missing so old exports keep loading. */
function normalize(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;
  const state = {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings || {}) },
    focus: { ...base.focus, ...(raw.focus || {}) },
    sync: { ...base.sync, ...(raw.sync || {}) },
    meta: { ...base.meta, ...(raw.meta || {}) },
  };
  state.graveyard = Array.isArray(raw.graveyard) ? raw.graveyard : [];
  for (const key of ["categories", "projects", "tasks", "habits", "notes", "pages"]) {
    state[key] = Array.isArray(raw[key]) ? raw[key] : [];
  }
  state.focus.sessions = Array.isArray(state.focus.sessions) ? state.focus.sessions : [];

  const stamp = (item) => (typeof item.updatedAt === "number" ? item.updatedAt : Date.parse(item.updatedAt || "") || Date.now());

  state.tasks = state.tasks.map((task, index) => ({
    updatedAt: stamp(task),
    id: task.id || uid("t"),
    title: String(task.title ?? "Untitled"),
    notes: task.notes ?? "",
    projectId: task.projectId ?? null,
    status: task.status || "todo",
    priority: task.priority || "none",
    due: task.due || null,
    time: task.time || null,
    tags: Array.isArray(task.tags) ? task.tags : [],
    subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
    comments: Array.isArray(task.comments) ? task.comments : [],
    links: Array.isArray(task.links) ? task.links : [],
    order: typeof task.order === "number" ? task.order : index * 100,
    createdAt: task.createdAt || new Date().toISOString(),
    completedAt: task.completedAt || null,
    starred: Boolean(task.starred),
    archived: Boolean(task.archived),
  }));

  state.projects = state.projects.map((project) => ({
    updatedAt: stamp(project),
    id: project.id || uid("p"),
    name: project.name || "Untitled project",
    color: project.color || "#c7f051",
    categoryId: project.categoryId ?? null,
    favorite: Boolean(project.favorite),
    archived: Boolean(project.archived),
    description: project.description || "",
    createdAt: project.createdAt || new Date().toISOString(),
    columns: Array.isArray(project.columns) && project.columns.length
      ? project.columns
      : clone(DEFAULT_COLUMNS),
  }));

  state.pages = state.pages.map((page) => ({
    updatedAt: stamp(page),
    id: page.id || uid("pg"),
    name: page.name || "Untitled page",
    icon: page.icon || "note",
    template: page.template || "custom",
    description: page.description || "",
    fields: Array.isArray(page.fields) ? page.fields : [],
    views: Array.isArray(page.views) && page.views.length ? page.views : [{ id: uid("v"), name: "All", type: "table" }],
    records: (Array.isArray(page.records) ? page.records : []).map((record) => ({
      ...record,
      id: record.id || uid("r"),
      updatedAt: stamp(record),
    })),
    createdAt: page.createdAt || new Date().toISOString(),
  }));

  state.habits = state.habits.map((habit) => ({
    updatedAt: stamp(habit),
    logAt: habit.logAt && typeof habit.logAt === "object" ? habit.logAt : {},
    id: habit.id || uid("h"),
    name: habit.name || "Habit",
    color: habit.color || "#c7f051",
    target: habit.target || 7,
    icon: habit.icon || "target",
    log: habit.log && typeof habit.log === "object" ? habit.log : {},
    createdAt: habit.createdAt || new Date().toISOString(),
    archived: Boolean(habit.archived),
  }));

  state.notes = state.notes.map((note) => ({
    updatedAt: stamp(note),
    id: note.id || uid("n"),
    title: note.title || "",
    body: note.body || "",
    tags: Array.isArray(note.tags) ? note.tags : [],
    pinned: Boolean(note.pinned),
    createdAt: note.createdAt || new Date().toISOString(),
    updatedAt: note.updatedAt || note.createdAt || new Date().toISOString(),
  }));

  state.categories = state.categories.map((category) => ({ updatedAt: stamp(category), ...category }));
  state.focus.sessions = state.focus.sessions.map((session) => ({ updatedAt: stamp(session), ...session }));
  if (typeof state.settings.updatedAt !== "number") state.settings.updatedAt = Date.now();

  const cutoff = Date.now() - TOMBSTONE_DAYS * 86400000;
  state.graveyard = state.graveyard.filter((entry) => entry && entry.at > cutoff);

  state.version = SCHEMA_VERSION;
  return state;
}

export const DEFAULT_COLUMNS = [
  { id: "todo", name: "To Do" },
  { id: "doing", name: "In Progress" },
  { id: "review", name: "In Review" },
  { id: "done", name: "Done", isDone: true },
];

/**
 * localStorage throws outright in some contexts (Safari on file://, private
 * windows with storage blocked). Fall back to memory so the app still runs.
 */
function makeStorage() {
  try {
    const probe = "__dezk_probe__";
    globalThis.localStorage.setItem(probe, "1");
    globalThis.localStorage.removeItem(probe);
    return { kind: "local", get: (k) => globalThis.localStorage.getItem(k), set: (k, v) => globalThis.localStorage.setItem(k, v) };
  } catch {
    const memory = new Map();
    return { kind: "memory", get: (k) => memory.get(k) ?? null, set: (k, v) => memory.set(k, v) };
  }
}

const storage = makeStorage();
export const storageKind = storage.kind;

function load() {
  let raw = null;
  try {
    raw = JSON.parse(storage.get(KEY) || "null");
  } catch (error) {
    console.warn("Dezk: stored state was unreadable, starting fresh.", error);
  }
  if (!raw) return normalize(buildSeed());
  return normalize(raw);
}

class Store {
  constructor() {
    this.state = load();
    this.listeners = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this.writeFailed = false;
    this.index = new Map();
    this.reindex();
  }

  /** Rebuild the "what did the last write look like" index. */
  reindex() {
    this.index = new Map();
    for (const [key, entity] of collect(this.state)) this.index.set(key, fingerprint(entity.body));
  }

  /**
   * Compare the state against the index, stamp whatever changed with the time
   * it changed, and remember anything that vanished so the deletion can travel
   * to the other devices.
   */
  track() {
    const now = Date.now();
    const current = collect(this.state);
    const dirty = this.state.sync.dirty;
    let changed = 0;

    for (const [key, entity] of current) {
      const print = fingerprint(entity.body);
      if (this.index.get(key) === print) continue;
      entity.body.updatedAt = now;
      dirty[key] = true;
      changed += 1;
    }

    for (const key of this.index.keys()) {
      if (current.has(key)) continue;
      const [kind, ...rest] = key.split(":");
      const id = rest.join(":");
      this.state.graveyard.push({ kind, id, at: now });
      dirty[key] = true;
      changed += 1;
    }

    // Once real edits exist, this is no longer a pristine sample deck.
    if (changed && this.state.meta.seeded) this.state.meta.seeded = false;
    this.reindex();
    return changed;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of [...this.listeners]) listener(this.state);
  }

  persist() {
    try {
      storage.set(KEY, JSON.stringify(this.state));
      this.writeFailed = false;
    } catch (error) {
      this.writeFailed = true;
      console.error("Dezk: could not save state.", error);
    }
    return !this.writeFailed;
  }

  /**
   * Apply a mutation.
   * @param {(state: object) => any} recipe mutates state in place
   * @param {{silent?: boolean, undoable?: boolean, label?: string}} options
   */
  mutate(recipe, options = {}) {
    const { silent = false, undoable = false, label = "", fromSync = false } = options;
    if (undoable) {
      this.undoStack.push({ label, snapshot: clone(this.state) });
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    const result = recipe(this.state);
    // Changes arriving from the server already carry their own timestamps;
    // re-stamping them would echo them back out as fresh local edits.
    if (fromSync) this.reindex();
    else this.track();
    this.persist();
    if (!silent) this.emit();
    return result;
  }

  /* ---------------- sync plumbing ---------------- */

  /** Everything waiting to go to the server. */
  pendingChanges() {
    const entities = collect(this.state);
    const changes = [];
    for (const key of Object.keys(this.state.sync.dirty)) {
      const entity = entities.get(key);
      if (entity) {
        changes.push({ kind: entity.kind, id: entity.id, updatedAt: entity.body.updatedAt || Date.now(), deleted: false, body: entity.body });
        continue;
      }
      const grave = this.state.graveyard.find((entry) => keyOf(entry.kind, entry.id) === key);
      if (grave) changes.push({ kind: grave.kind, id: grave.id, updatedAt: grave.at, deleted: true, body: null });
    }
    return changes;
  }

  pendingCount() { return Object.keys(this.state.sync.dirty).length; }

  /** Mark pushed keys clean, unless they were edited again mid-flight. */
  clearDirty(changes) {
    this.mutate((state) => {
      const entities = collect(state);
      for (const change of changes) {
        const key = keyOf(change.kind, change.id);
        const current = entities.get(key);
        if (current && (current.body.updatedAt || 0) > change.updatedAt) continue;
        delete state.sync.dirty[key];
      }
    }, { fromSync: true, silent: true });
  }

  /** Fold rows from the server into the local state. */
  applyRemote(rows) {
    let applied = 0;
    this.mutate((state) => {
      const result = applyRemoteRows(state, rows, state.sync.dirty);
      applied = result.applied;
      for (const key of result.reMerged) state.sync.dirty[key] = true;
      for (const row of rows) {
        if (!row.deleted) continue;
        const key = keyOf(row.kind, row.id);
        if (!state.sync.dirty[key]) delete state.sync.dirty[key];
      }
    }, { fromSync: true, silent: true });
    return applied;
  }

  setSync(patch) {
    this.mutate((state) => { Object.assign(state.sync, patch); }, { fromSync: true, silent: true });
  }

  /** Queue every entity for upload — used on first connect. */
  markAllDirty() {
    this.mutate((state) => {
      for (const key of collect(state).keys()) state.sync.dirty[key] = true;
      for (const entry of state.graveyard) state.sync.dirty[keyOf(entry.kind, entry.id)] = true;
    }, { fromSync: true, silent: true });
  }

  /** Drop everything the server has not heard of — adopting a server copy. */
  clearLocalEntities() {
    this.mutate((state) => {
      state.categories = [];
      state.projects = [];
      state.tasks = [];
      state.habits = [];
      state.notes = [];
      state.pages = [];
      state.focus.sessions = [];
      state.graveyard = [];
      state.sync.dirty = {};
      state.meta.seeded = false;
    }, { fromSync: true, silent: true });
  }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push({ label: entry.label, snapshot: clone(this.state) });
    const sync = this.state.sync;
    this.state = entry.snapshot;
    this.state.sync = sync;
    this.track();
    this.persist();
    this.emit();
    return entry.label;
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push({ label: entry.label, snapshot: clone(this.state) });
    const sync = this.state.sync;
    this.state = entry.snapshot;
    this.state.sync = sync;
    this.track();
    this.persist();
    this.emit();
    return entry.label;
  }

  replace(next, { undoable = true, label = "Replaced data" } = {}) {
    if (undoable) this.undoStack.push({ label, snapshot: clone(this.state) });
    const sync = this.state.sync;
    this.state = normalize(next);
    this.state.sync = sync; // the connection belongs to this device, not the file
    this.index = new Map();
    this.track(); // everything counts as changed, so it all uploads
    this.persist();
    this.emit();
  }

  exportJSON() {
    const { sync, ...rest } = this.state; // never write the server token into a backup
    return JSON.stringify({ ...rest, exportedAt: new Date().toISOString() }, null, 2);
  }

  importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("That file is not a Dezk backup.");
    if (!Array.isArray(parsed.tasks) && !Array.isArray(parsed.pages)) {
      throw new Error("That file has no Dezk data in it.");
    }
    this.replace(parsed, { label: "Imported data" });
  }

  resetToSeed() { this.replace(buildSeed(), { label: "Reset to sample data" }); }

  resetEmpty() {
    const base = emptyState();
    base.settings = { ...this.state.settings };
    this.replace(base, { label: "Cleared all data" });
  }
}

export const store = new Store();
export const getState = () => store.state;
export { clone, KEY as STORAGE_KEY, SCHEMA_VERSION };
