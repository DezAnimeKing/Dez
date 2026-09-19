import { store, DEFAULT_COLUMNS, clone } from "./state.js";
import { uid } from "../lib/id.js";
import { todayKey } from "../lib/date.js";
import { doneColumnId, isDone, tasksInColumn, columnsFor, projectById, taskById, pageById } from "./selectors.js";
import { templateById } from "./templates.js";

const now = () => new Date().toISOString();

/* ============================ tasks ============================ */

export function createTask(partial = {}) {
  const id = uid("t");
  store.mutate((state) => {
    const siblings = state.tasks.filter(
      (t) => t.projectId === (partial.projectId ?? null) && t.status === (partial.status || "todo")
    );
    const minOrder = siblings.length ? Math.min(...siblings.map((t) => t.order ?? 0)) : 100;
    state.tasks.push({
      id,
      title: "Untitled task",
      notes: "",
      projectId: null,
      status: "todo",
      priority: "none",
      due: null,
      time: null,
      tags: [],
      subtasks: [],
      comments: [],
      links: [],
      order: minOrder - 100,
      createdAt: now(),
      completedAt: null,
      starred: false,
      archived: false,
      ...partial,
    });
  }, { undoable: true, label: "Task added" });
  return id;
}

export function updateTask(id, patch) {
  store.mutate((state) => {
    const task = taskById(state, id);
    if (task) Object.assign(task, patch);
  });
}

export function setTaskDone(id, done) {
  store.mutate((state) => {
    const task = taskById(state, id);
    if (!task) return;
    const columns = columnsFor(state, task.projectId);
    if (done) {
      task.status = doneColumnId(state, task.projectId);
      task.completedAt = now();
    } else {
      task.completedAt = null;
      if (task.status === doneColumnId(state, task.projectId)) task.status = columns[0].id;
    }
  }, { undoable: true, label: done ? "Task completed" : "Task reopened" });
}

export function toggleTask(id) {
  const task = taskById(store.state, id);
  if (task) setTaskDone(id, !isDone(store.state, task));
}

export function moveTask(id, { projectId, status, order }) {
  store.mutate((state) => {
    const task = taskById(state, id);
    if (!task) return;
    if (projectId !== undefined) task.projectId = projectId;
    if (status !== undefined) {
      task.status = status;
      const done = doneColumnId(state, task.projectId);
      if (status === done && !task.completedAt) task.completedAt = now();
      if (status !== done) task.completedAt = null;
    }
    if (order !== undefined) task.order = order;
  }, { undoable: true, label: "Task moved" });
}

/** Drop `id` into `columnId` directly above `beforeId` (or at the end). */
export function reorderTask(id, projectId, columnId, beforeId = null) {
  const state = store.state;
  const list = tasksInColumn(state, projectId, columnId).filter((t) => t.id !== id);
  const index = beforeId ? list.findIndex((t) => t.id === beforeId) : list.length;
  const prev = index > 0 ? list[index - 1]?.order ?? 0 : null;
  const next = index >= 0 && index < list.length ? list[index]?.order ?? null : null;
  let order;
  if (prev === null && next === null) order = 100;
  else if (prev === null) order = next - 100;
  else if (next === null) order = prev + 100;
  else order = (prev + next) / 2;
  moveTask(id, { projectId, status: columnId, order });
}

export function deleteTask(id) {
  store.mutate((state) => {
    state.tasks = state.tasks.filter((t) => t.id !== id);
  }, { undoable: true, label: "Task deleted" });
}

export function duplicateTask(id) {
  let newId = null;
  store.mutate((state) => {
    const task = taskById(state, id);
    if (!task) return;
    newId = uid("t");
    state.tasks.push({
      ...clone(task),
      id: newId,
      title: `${task.title} (copy)`,
      order: (task.order ?? 0) + 1,
      createdAt: now(),
      completedAt: null,
    });
  }, { undoable: true, label: "Task duplicated" });
  return newId;
}

export function addSubtask(taskId, title) {
  store.mutate((state) => {
    const task = taskById(state, taskId);
    if (task) task.subtasks.push({ id: uid("s"), title, done: false });
  });
}

export function toggleSubtask(taskId, subtaskId) {
  store.mutate((state) => {
    const subtask = taskById(state, taskId)?.subtasks.find((s) => s.id === subtaskId);
    if (subtask) subtask.done = !subtask.done;
  });
}

export function updateSubtask(taskId, subtaskId, patch) {
  store.mutate((state) => {
    const subtask = taskById(state, taskId)?.subtasks.find((s) => s.id === subtaskId);
    if (subtask) Object.assign(subtask, patch);
  }, { silent: true });
}

export function removeSubtask(taskId, subtaskId) {
  store.mutate((state) => {
    const task = taskById(state, taskId);
    if (task) task.subtasks = task.subtasks.filter((s) => s.id !== subtaskId);
  });
}

export function addComment(taskId, body) {
  store.mutate((state) => {
    const task = taskById(state, taskId);
    if (task) task.comments.push({ id: uid("cm"), body, at: now() });
  });
}

export function removeComment(taskId, commentId) {
  store.mutate((state) => {
    const task = taskById(state, taskId);
    if (task) task.comments = task.comments.filter((c) => c.id !== commentId);
  });
}

/* ============================ projects ============================ */

export function createProject(partial = {}) {
  const id = uid("p");
  store.mutate((state) => {
    state.projects.push({
      id,
      name: "New project",
      color: "#c7f051",
      categoryId: null,
      favorite: false,
      archived: false,
      description: "",
      columns: clone(DEFAULT_COLUMNS),
      createdAt: now(),
      ...partial,
    });
  }, { undoable: true, label: "Project created" });
  return id;
}

export function updateProject(id, patch) {
  store.mutate((state) => {
    const project = projectById(state, id);
    if (project) Object.assign(project, patch);
  });
}

export function deleteProject(id, { keepTasks = false } = {}) {
  store.mutate((state) => {
    state.projects = state.projects.filter((p) => p.id !== id);
    if (keepTasks) {
      for (const task of state.tasks) if (task.projectId === id) task.projectId = null;
    } else {
      state.tasks = state.tasks.filter((t) => t.projectId !== id);
    }
  }, { undoable: true, label: "Project deleted" });
}

export function addColumn(projectId, name = "New column") {
  store.mutate((state) => {
    const project = projectById(state, projectId);
    if (!project) return;
    const doneIndex = project.columns.findIndex((c) => c.isDone);
    const column = { id: uid("col"), name };
    if (doneIndex >= 0) project.columns.splice(doneIndex, 0, column);
    else project.columns.push(column);
  }, { undoable: true, label: "Column added" });
}

export function updateColumn(projectId, columnId, patch) {
  store.mutate((state) => {
    const column = projectById(state, projectId)?.columns.find((c) => c.id === columnId);
    if (column) Object.assign(column, patch);
  });
}

export function deleteColumn(projectId, columnId) {
  store.mutate((state) => {
    const project = projectById(state, projectId);
    if (!project || project.columns.length <= 1) return;
    project.columns = project.columns.filter((c) => c.id !== columnId);
    const fallback = project.columns[0].id;
    for (const task of state.tasks) {
      if (task.projectId === projectId && task.status === columnId) task.status = fallback;
    }
  }, { undoable: true, label: "Column deleted" });
}

/* ============================ categories ============================ */

export function createCategory(name, color = "#7fb2f0") {
  const id = uid("c");
  store.mutate((state) => { state.categories.push({ id, name, color }); }, { undoable: true, label: "Category added" });
  return id;
}

export function updateCategory(id, patch) {
  store.mutate((state) => {
    const category = state.categories.find((c) => c.id === id);
    if (category) Object.assign(category, patch);
  });
}

export function deleteCategory(id) {
  store.mutate((state) => {
    state.categories = state.categories.filter((c) => c.id !== id);
    for (const project of state.projects) if (project.categoryId === id) project.categoryId = null;
  }, { undoable: true, label: "Category deleted" });
}

/* ============================ pages ============================ */

export function createPage({ name, templateId = "custom", icon } = {}) {
  const template = templateById(templateId);
  const built = template.build();
  const id = uid("pg");
  store.mutate((state) => {
    state.pages.push({
      id,
      name: name || template.name,
      icon: icon || template.icon,
      template: template.id,
      description: "",
      createdAt: now(),
      ...built,
    });
  }, { undoable: true, label: "Page created" });
  return id;
}

export function updatePage(id, patch) {
  store.mutate((state) => {
    const page = pageById(state, id);
    if (page) Object.assign(page, patch);
  });
}

export function deletePage(id) {
  store.mutate((state) => {
    state.pages = state.pages.filter((p) => p.id !== id);
  }, { undoable: true, label: "Page deleted" });
}

export function addField(pageId, field) {
  const id = uid("f");
  store.mutate((state) => {
    const page = pageById(state, pageId);
    if (page) page.fields.push({ id, name: "New field", type: "text", ...field });
  }, { undoable: true, label: "Field added" });
  return id;
}

export function updateField(pageId, fieldId, patch) {
  store.mutate((state) => {
    const field = pageById(state, pageId)?.fields.find((f) => f.id === fieldId);
    if (field) Object.assign(field, patch);
  });
}

export function deleteField(pageId, fieldId) {
  store.mutate((state) => {
    const page = pageById(state, pageId);
    if (!page) return;
    page.fields = page.fields.filter((f) => f.id !== fieldId);
    for (const record of page.records) delete record.values[fieldId];
    for (const view of page.views) {
      if (view.groupBy === fieldId) view.groupBy = null;
      if (view.sortBy === fieldId) view.sortBy = null;
    }
  }, { undoable: true, label: "Field deleted" });
}

export function addSelectOption(pageId, fieldId, name, color = "#8b929c") {
  const id = uid("o");
  store.mutate((state) => {
    const field = pageById(state, pageId)?.fields.find((f) => f.id === fieldId);
    if (!field) return;
    field.options = field.options || [];
    field.options.push({ id, name, color });
  });
  return id;
}

export function addView(pageId, view) {
  const id = uid("v");
  store.mutate((state) => {
    const page = pageById(state, pageId);
    if (page) page.views.push({ id, name: "New view", type: "table", ...view });
  }, { undoable: true, label: "View added" });
  return id;
}

export function updateView(pageId, viewId, patch) {
  store.mutate((state) => {
    const view = pageById(state, pageId)?.views.find((v) => v.id === viewId);
    if (view) Object.assign(view, patch);
  });
}

export function deleteView(pageId, viewId) {
  store.mutate((state) => {
    const page = pageById(state, pageId);
    if (page && page.views.length > 1) page.views = page.views.filter((v) => v.id !== viewId);
  }, { undoable: true, label: "View deleted" });
}

export function createRecord(pageId, values = {}) {
  const id = uid("r");
  store.mutate((state) => {
    const page = pageById(state, pageId);
    if (!page) return;
    const seeded = { ...values };
    // A page with a date field should default it to today, like a paper log.
    for (const field of page.fields) {
      if (field.type === "date" && seeded[field.id] === undefined && /date|day|on/i.test(field.name)) {
        seeded[field.id] = todayKey();
      }
    }
    page.records.unshift({ id, values: seeded, createdAt: now(), updatedAt: now() });
  }, { undoable: true, label: "Entry added" });
  return id;
}

export function updateRecord(pageId, recordId, values, { silent = false } = {}) {
  store.mutate((state) => {
    const record = pageById(state, pageId)?.records.find((r) => r.id === recordId);
    if (!record) return;
    record.values = { ...record.values, ...values };
    record.updatedAt = now();
  }, { silent });
}

export function deleteRecord(pageId, recordId) {
  store.mutate((state) => {
    const page = pageById(state, pageId);
    if (page) page.records = page.records.filter((r) => r.id !== recordId);
  }, { undoable: true, label: "Entry deleted" });
}

/* ============================ habits ============================ */

export function createHabit(partial = {}) {
  const id = uid("h");
  store.mutate((state) => {
    state.habits.push({
      id, name: "New habit", color: "#c7f051", icon: "target", target: 7,
      log: {}, logAt: {}, createdAt: now(), archived: false, ...partial,
    });
  }, { undoable: true, label: "Habit added" });
  return id;
}

export function updateHabit(id, patch) {
  store.mutate((state) => {
    const habit = state.habits.find((h) => h.id === id);
    if (habit) Object.assign(habit, patch);
  });
}

export function toggleHabitDay(id, key = todayKey()) {
  store.mutate((state) => {
    const habit = state.habits.find((h) => h.id === id);
    if (!habit) return;
    if (habit.log[key]) delete habit.log[key];
    else habit.log[key] = true;
    // Remembered per day so a tick here and a tick there both survive a sync.
    habit.logAt = habit.logAt || {};
    habit.logAt[key] = Date.now();
  });
}

export function deleteHabit(id) {
  store.mutate((state) => {
    state.habits = state.habits.filter((h) => h.id !== id);
  }, { undoable: true, label: "Habit deleted" });
}

/* ============================ notes ============================ */

export function createNote(partial = {}) {
  const id = uid("n");
  store.mutate((state) => {
    state.notes.unshift({
      id, title: "", body: "", tags: [], pinned: false,
      createdAt: now(), updatedAt: now(), ...partial,
    });
  }, { undoable: true, label: "Note added" });
  return id;
}

export function updateNote(id, patch, { silent = false } = {}) {
  store.mutate((state) => {
    const note = state.notes.find((n) => n.id === id);
    if (note) Object.assign(note, patch, { updatedAt: now() });
  }, { silent });
}

export function deleteNote(id) {
  store.mutate((state) => {
    state.notes = state.notes.filter((n) => n.id !== id);
  }, { undoable: true, label: "Note deleted" });
}

/* ============================ focus & settings ============================ */

export function logFocusSession({ minutes, taskId = null, mode = "focus" }) {
  store.mutate((state) => {
    state.focus.sessions.push({ id: uid("fs"), startedAt: now(), minutes, taskId, mode });
  });
}

export function setSetting(key, value) {
  store.mutate((state) => { state.settings[key] = value; });
}

export function setSettings(patch) {
  store.mutate((state) => { Object.assign(state.settings, patch); });
}
