import { DEFAULT_COLUMNS } from "./state.js";
import { todayKey, diffDays, shiftKey, toKey } from "../lib/date.js";

export const PRIORITIES = [
  { id: "high", name: "High", rank: 0 },
  { id: "medium", name: "Medium", rank: 1 },
  { id: "low", name: "Low", rank: 2 },
  { id: "none", name: "None", rank: 3 },
];
export const priorityRank = (id) => (PRIORITIES.find((p) => p.id === id) || PRIORITIES[3]).rank;

export const byId = (list, id) => list.find((item) => item.id === id) || null;
export const projectById = (state, id) => byId(state.projects, id);
export const taskById = (state, id) => byId(state.tasks, id);
export const pageById = (state, id) => byId(state.pages, id);
export const noteById = (state, id) => byId(state.notes, id);
export const habitById = (state, id) => byId(state.habits, id);

export function columnsFor(state, projectId) {
  const project = projectById(state, projectId);
  return project?.columns?.length ? project.columns : DEFAULT_COLUMNS;
}

export function doneColumnId(state, projectId) {
  const columns = columnsFor(state, projectId);
  return (columns.find((c) => c.isDone) || columns[columns.length - 1]).id;
}

export function isDone(state, task) {
  if (!task) return false;
  if (task.completedAt) return true;
  return task.status === doneColumnId(state, task.projectId);
}

export const activeTasks = (state) => state.tasks.filter((t) => !t.archived);

export function openTasks(state) {
  return activeTasks(state).filter((t) => !isDone(state, t));
}

export function sortTasks(list, state) {
  return [...list].sort((a, b) => {
    const aDone = isDone(state, a);
    const bDone = isDone(state, b);
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (a.due !== b.due) {
      if (!a.due) return 1;
      if (!b.due) return -1;
      return a.due < b.due ? -1 : 1;
    }
    const pr = priorityRank(a.priority) - priorityRank(b.priority);
    if (pr !== 0) return pr;
    return (a.order ?? 0) - (b.order ?? 0);
  });
}

export function tasksForProject(state, projectId, { includeDone = true } = {}) {
  return activeTasks(state).filter(
    (t) => t.projectId === projectId && (includeDone || !isDone(state, t))
  );
}

export function tasksInColumn(state, projectId, columnId) {
  return tasksForProject(state, projectId)
    .filter((t) => t.status === columnId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export const overdueTasks = (state) =>
  openTasks(state).filter((t) => t.due && diffDays(t.due) < 0);

export const dueTodayTasks = (state) =>
  openTasks(state).filter((t) => t.due && diffDays(t.due) === 0);

export const completedOn = (state, key) =>
  activeTasks(state).filter((t) => t.completedAt && toKey(new Date(t.completedAt)) === key);

export function todayAgenda(state) {
  const overdue = sortTasks(overdueTasks(state), state);
  const due = sortTasks(dueTodayTasks(state), state);
  const done = completedOn(state, todayKey());
  return { overdue, due, done };
}

export function upcomingTasks(state, days = 7) {
  const limit = shiftKey(todayKey(), days);
  return sortTasks(
    openTasks(state).filter((t) => t.due && t.due > todayKey() && t.due <= limit),
    state
  );
}

export const inboxTasks = (state) => openTasks(state).filter((t) => !t.projectId);
export const starredTasks = (state) => openTasks(state).filter((t) => t.starred);
export const somedayTasks = (state) => openTasks(state).filter((t) => !t.due);

export function allTags(state) {
  const counts = new Map();
  for (const task of activeTasks(state)) {
    for (const tag of task.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  for (const note of state.notes) {
    for (const tag of note.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

export function tasksWithTag(state, tag) {
  return sortTasks(activeTasks(state).filter((t) => (t.tags || []).includes(tag)), state);
}

export function projectProgress(state, projectId) {
  const tasks = tasksForProject(state, projectId);
  const done = tasks.filter((t) => isDone(state, t)).length;
  return { total: tasks.length, done, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

export function subtaskProgress(task) {
  const total = task.subtasks?.length || 0;
  const done = task.subtasks?.filter((s) => s.done).length || 0;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

/* ---------------- habits ---------------- */

export function habitStreak(habit) {
  let streak = 0;
  let cursor = todayKey();
  // Today not being ticked yet shouldn't break yesterday's streak.
  if (!habit.log?.[cursor]) cursor = shiftKey(cursor, -1);
  while (habit.log?.[cursor]) {
    streak += 1;
    cursor = shiftKey(cursor, -1);
  }
  return streak;
}

export function habitBestStreak(habit) {
  const keys = Object.keys(habit.log || {}).filter((k) => habit.log[k]).sort();
  let best = 0;
  let run = 0;
  let previous = null;
  for (const key of keys) {
    run = previous && diffDays(key, previous) === 1 ? run + 1 : 1;
    previous = key;
    best = Math.max(best, run);
  }
  return best;
}

export function habitRate(habit, days = 30) {
  let hits = 0;
  for (let i = 0; i < days; i += 1) if (habit.log?.[shiftKey(todayKey(), -i)]) hits += 1;
  return Math.round((hits / days) * 100);
}

export const activeHabits = (state) => state.habits.filter((h) => !h.archived);

/* ---------------- pages ---------------- */

export function primaryField(page) {
  return page.fields?.find((f) => f.primary) || page.fields?.find((f) => f.type === "text") || page.fields?.[0] || null;
}

export function recordTitle(page, record) {
  const field = primaryField(page);
  const raw = field ? record.values?.[field.id] : null;
  if (raw === null || raw === undefined || raw === "") {
    const first = page.fields?.find((f) => record.values?.[f.id]);
    const fallback = first ? record.values[first.id] : "";
    const text = Array.isArray(fallback) ? fallback.join(", ") : String(fallback || "");
    return text.split("\n")[0].slice(0, 80) || "Untitled";
  }
  return Array.isArray(raw) ? raw.join(", ") : String(raw);
}

export function fieldOption(field, value) {
  return field?.options?.find((o) => o.id === value) || null;
}

export function sortRecords(page, view) {
  const records = [...(page.records || [])];
  const sortField = view?.sortBy;
  if (!sortField) return records.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const dir = view.sortDir === "asc" ? 1 : -1;
  return records.sort((a, b) => {
    const av = a.values?.[sortField] ?? "";
    const bv = b.values?.[sortField] ?? "";
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

/* ---------------- stats ---------------- */

export function completionsByDay(state, days = 14) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = shiftKey(todayKey(), -i);
    out.push({ key, count: completedOn(state, key).length });
  }
  return out;
}

export function focusMinutesByDay(state, days = 14) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = shiftKey(todayKey(), -i);
    const minutes = (state.focus?.sessions || [])
      .filter((s) => s.mode !== "break" && toKey(new Date(s.startedAt)) === key)
      .reduce((sum, s) => sum + (s.minutes || 0), 0);
    out.push({ key, count: minutes });
  }
  return out;
}

export function focusMinutesOn(state, key = todayKey()) {
  return (state.focus?.sessions || [])
    .filter((s) => s.mode !== "break" && toKey(new Date(s.startedAt)) === key)
    .reduce((sum, s) => sum + (s.minutes || 0), 0);
}

/* ---------------- search ---------------- */

export function searchAll(state, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results = [];
  const push = (item) => { if (results.length < 40) results.push(item); };

  for (const task of activeTasks(state)) {
    const haystack = `${task.title} ${task.notes} ${(task.tags || []).join(" ")}`.toLowerCase();
    if (haystack.includes(q)) {
      const project = projectById(state, task.projectId);
      push({ kind: "task", id: task.id, title: task.title, sub: project ? project.name : "Inbox", icon: "check-circle", href: `#/tasks?task=${task.id}` });
    }
  }
  for (const project of state.projects) {
    if (project.name.toLowerCase().includes(q)) {
      push({ kind: "project", id: project.id, title: project.name, sub: "Project", icon: "board", href: `#/projects/${project.id}` });
    }
  }
  for (const page of state.pages) {
    if (page.name.toLowerCase().includes(q)) {
      push({ kind: "page", id: page.id, title: page.name, sub: "Page", icon: page.icon || "note", href: `#/pages/${page.id}` });
    }
    for (const record of page.records || []) {
      const haystack = Object.values(record.values || {}).map((v) => (Array.isArray(v) ? v.join(" ") : String(v ?? ""))).join(" ").toLowerCase();
      if (haystack.includes(q)) {
        push({ kind: "record", id: record.id, title: recordTitle(page, record), sub: page.name, icon: page.icon || "note", href: `#/pages/${page.id}?record=${record.id}` });
      }
    }
  }
  for (const note of state.notes) {
    if (`${note.title} ${note.body}`.toLowerCase().includes(q)) {
      push({ kind: "note", id: note.id, title: note.title || note.body.slice(0, 40), sub: "Note", icon: "note", href: `#/notes?note=${note.id}` });
    }
  }
  for (const habit of activeHabits(state)) {
    if (habit.name.toLowerCase().includes(q)) {
      push({ kind: "habit", id: habit.id, title: habit.name, sub: "Habit", icon: "repeat", href: "#/habits" });
    }
  }
  return results;
}
