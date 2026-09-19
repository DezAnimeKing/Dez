import { uid } from "../lib/id.js";
import { buildSeed } from "./seed.js";

const KEY = "dezk.state.v1";
const SCHEMA_VERSION = 1;
const UNDO_LIMIT = 30;

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
    meta: { createdAt: new Date().toISOString(), lastOpened: null },
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
    meta: { ...base.meta, ...(raw.meta || {}) },
  };
  for (const key of ["categories", "projects", "tasks", "habits", "notes", "pages"]) {
    state[key] = Array.isArray(raw[key]) ? raw[key] : [];
  }
  state.focus.sessions = Array.isArray(state.focus.sessions) ? state.focus.sessions : [];

  state.tasks = state.tasks.map((task, index) => ({
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
    id: page.id || uid("pg"),
    name: page.name || "Untitled page",
    icon: page.icon || "note",
    template: page.template || "custom",
    description: page.description || "",
    fields: Array.isArray(page.fields) ? page.fields : [],
    views: Array.isArray(page.views) && page.views.length ? page.views : [{ id: uid("v"), name: "All", type: "table" }],
    records: Array.isArray(page.records) ? page.records : [],
    createdAt: page.createdAt || new Date().toISOString(),
  }));

  state.habits = state.habits.map((habit) => ({
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
    id: note.id || uid("n"),
    title: note.title || "",
    body: note.body || "",
    tags: Array.isArray(note.tags) ? note.tags : [],
    pinned: Boolean(note.pinned),
    createdAt: note.createdAt || new Date().toISOString(),
    updatedAt: note.updatedAt || note.createdAt || new Date().toISOString(),
  }));

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
    const { silent = false, undoable = false, label = "" } = options;
    if (undoable) {
      this.undoStack.push({ label, snapshot: clone(this.state) });
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    const result = recipe(this.state);
    this.persist();
    if (!silent) this.emit();
    return result;
  }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push({ label: entry.label, snapshot: clone(this.state) });
    this.state = entry.snapshot;
    this.persist();
    this.emit();
    return entry.label;
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push({ label: entry.label, snapshot: clone(this.state) });
    this.state = entry.snapshot;
    this.persist();
    this.emit();
    return entry.label;
  }

  replace(next, { undoable = true, label = "Replaced data" } = {}) {
    if (undoable) this.undoStack.push({ label, snapshot: clone(this.state) });
    this.state = normalize(next);
    this.persist();
    this.emit();
  }

  exportJSON() {
    return JSON.stringify({ ...this.state, exportedAt: new Date().toISOString() }, null, 2);
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
