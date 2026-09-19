// The sync layer sees the state as a flat bag of entities, each with its own
// `updatedAt`, so two devices editing different things never clobber one
// another. Pages keep their records nested for the views' benefit; this module
// flattens them on the way out and re-nests them on the way in.

export const KINDS = ["settings", "category", "project", "task", "habit", "note", "page", "record", "focus"];

export const SINGLETON = "singleton";

const listFor = {
  category: (state) => state.categories,
  project: (state) => state.projects,
  task: (state) => state.tasks,
  habit: (state) => state.habits,
  note: (state) => state.notes,
  page: (state) => state.pages,
  focus: (state) => state.focus.sessions,
};

export const keyOf = (kind, id) => `${kind}:${id}`;

/** Every entity in the state, keyed "kind:id". */
export function collect(state) {
  const out = new Map();
  const add = (kind, id, body) => out.set(keyOf(kind, id), { kind, id, body });

  add("settings", SINGLETON, state.settings);
  for (const [kind, pick] of Object.entries(listFor)) {
    if (kind === "page") continue;
    for (const item of pick(state) || []) add(kind, item.id, item);
  }
  for (const page of state.pages || []) {
    const { records, ...rest } = page;
    add("page", page.id, rest);
    for (const record of records || []) add("record", record.id, { ...record, pageId: page.id });
  }
  return out;
}

/** Comparable form of an entity, ignoring the bookkeeping field itself. */
export function fingerprint(body) {
  const { updatedAt, ...rest } = body || {};
  return JSON.stringify(rest);
}

export function findEntity(state, kind, id) {
  if (kind === "settings") return state.settings;
  if (kind === "record") {
    for (const page of state.pages) {
      const record = page.records?.find((r) => r.id === id);
      if (record) return record;
    }
    return null;
  }
  const list = listFor[kind]?.(state);
  return list?.find((item) => item.id === id) || null;
}

export function removeEntity(state, kind, id) {
  if (kind === "settings") return false;
  if (kind === "record") {
    for (const page of state.pages) {
      const before = page.records?.length || 0;
      page.records = (page.records || []).filter((record) => record.id !== id);
      if (page.records.length !== before) return true;
    }
    return false;
  }
  if (kind === "page") {
    const before = state.pages.length;
    state.pages = state.pages.filter((page) => page.id !== id);
    return state.pages.length !== before;
  }
  if (kind === "focus") {
    const before = state.focus.sessions.length;
    state.focus.sessions = state.focus.sessions.filter((item) => item.id !== id);
    return state.focus.sessions.length !== before;
  }
  const list = listFor[kind]?.(state);
  if (!list) return false;
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) return false;
  list.splice(index, 1);
  return true;
}

export function upsertEntity(state, kind, id, body) {
  if (kind === "settings") {
    // Keep whatever this device knows that the other one has never heard of.
    state.settings = { ...state.settings, ...body };
    return;
  }
  if (kind === "record") {
    const { pageId, ...record } = body;
    const page = state.pages.find((p) => p.id === pageId);
    if (!page) return; // its page has not arrived (or was deleted) — drop it
    page.records = page.records || [];
    const index = page.records.findIndex((r) => r.id === id);
    if (index >= 0) page.records[index] = { ...record, id };
    else page.records.unshift({ ...record, id });
    return;
  }
  if (kind === "page") {
    const index = state.pages.findIndex((page) => page.id === id);
    if (index >= 0) state.pages[index] = { ...body, id, records: state.pages[index].records || [] };
    else state.pages.push({ ...body, id, records: [] });
    return;
  }
  const list = listFor[kind]?.(state);
  if (!list) return;
  const index = list.findIndex((item) => item.id === id);
  if (index >= 0) list[index] = { ...body, id };
  else list.push({ ...body, id });
}

/**
 * Habit ticks are the one thing both devices touch on the same day, so they
 * merge per day rather than whole-object. `logAt` remembers when each day was
 * last changed, including days that were un-ticked.
 */
export function mergeHabit(local, remote) {
  // Sorted, so both devices build byte-identical maps and stop re-merging.
  const days = [...new Set([
    ...Object.keys(local.log || {}), ...Object.keys(local.logAt || {}),
    ...Object.keys(remote.log || {}), ...Object.keys(remote.logAt || {}),
  ])].sort();
  const log = {};
  const logAt = {};
  for (const day of days) {
    const localAt = local.logAt?.[day] ?? (local.log?.[day] ? 1 : 0);
    const remoteAt = remote.logAt?.[day] ?? (remote.log?.[day] ? 1 : 0);
    const winner = localAt >= remoteAt ? local : remote;
    const at = Math.max(localAt, remoteAt);
    if (winner.log?.[day]) log[day] = true;
    if (at > 0) logAt[day] = at;
  }
  const newest = (remote.updatedAt || 0) > (local.updatedAt || 0) ? remote : local;
  return { ...newest, log, logAt, updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0) };
}

/**
 * Apply rows from the server. Local wins only when it is both newer and still
 * waiting to be pushed, so a pull can never silently drop an unsent edit.
 * @returns {{applied: number, reMerged: string[]}} keys that changed shape
 *          locally during the merge and therefore need pushing back.
 */
export function applyRemoteRows(state, rows, dirty) {
  let applied = 0;
  const reMerged = [];

  for (const row of rows) {
    const key = keyOf(row.kind, row.id);
    const local = findEntity(state, row.kind, row.id);
    const localAt = local?.updatedAt || 0;
    const remoteAt = row.updatedAt || 0;

    if (row.deleted) {
      if (dirty[key] && localAt > remoteAt) continue; // we changed it after the delete
      if (removeEntity(state, row.kind, row.id)) applied += 1;
      continue;
    }

    if (row.kind === "habit" && local) {
      const merged = mergeHabit(local, row.body);
      const changedHere = fingerprint(merged) !== fingerprint(local);
      const changedThere = fingerprint(merged) !== fingerprint(row.body);
      // A union of both devices' ticks is newer than either of them, so it
      // needs a timestamp that beats both or the server will reject it.
      if (changedThere) merged.updatedAt = Math.max(Date.now(), merged.updatedAt || 0) + 1;
      upsertEntity(state, "habit", row.id, merged);
      if (changedHere) applied += 1;
      if (changedThere) reMerged.push(key);
      continue;
    }

    if (local && dirty[key] && localAt >= remoteAt) continue; // ours is newer and unsent
    if (local && localAt > remoteAt) continue;

    upsertEntity(state, row.kind, row.id, row.body);
    applied += 1;
  }

  return { applied, reMerged };
}
