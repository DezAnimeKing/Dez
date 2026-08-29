/* The app-facing data API. UI code talks to this, never to db.js directly.
 *
 * Responsibilities: seeding a new world, CRUD with autosave, a save-state
 * signal for the "saved" indicator, delete-to-trash with undo, and the
 * derived counts the Contents page needs.
 */

import * as db from './db.js';
import {
  SCHEMA_VERSION, STATUS, STATUS_ORDER, DEV_TIER, PAGE_TYPE_ORDER,
  makePage, makeRelationship, makeEra, makeReckoning, makeImage, newId,
} from './schema.js';
import { DEFAULT_RECKONINGS, CANONICAL_RECKONING_ID } from './reckoning.js';

/* --------------------------------------------------------------- events */

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}

function emit(event, detail) {
  for (const fn of listeners.get(event) || []) {
    try { fn(detail); } catch (err) { console.error(`listener for "${event}" threw`, err); }
  }
}

/* ----------------------------------------------------------- save state */

let saveState = 'idle';
let pending = 0;

export function getSaveState() { return saveState; }

function setSaveState(next) {
  saveState = next;
  emit('save-state', next);
}

/** Wrap a write so the indicator always reflects reality, errors included. */
async function write(fn) {
  pending++;
  setSaveState('saving');
  try {
    const result = await fn();
    if (--pending === 0) setSaveState('saved');
    return result;
  } catch (err) {
    pending--;
    setSaveState('error');
    emit('error', err);
    throw err;
  }
}

/* --------------------------------------------------------------- world */

const META_KEY = 'world';

const DEFAULT_WORLD = Object.freeze({
  key: META_KEY,
  title: 'The Compendium',
  subtitle: '',
  coverImageId: null,
  mapImageId: null,
  displayReckoningId: CANONICAL_RECKONING_ID,
  revealSealed: false,
  schemaVersion: SCHEMA_VERSION,
  lastBackupAt: null,
  createdAt: null,
});

let world = { ...DEFAULT_WORLD };

export function getWorld() { return { ...world }; }

export async function updateWorld(patch) {
  world = { ...world, ...patch, key: META_KEY };
  await write(() => db.put(db.STORES.meta, world));
  emit('change', { store: 'meta' });
  return getWorld();
}

/** Open the database, seeding a fresh world on first run. */
export async function init() {
  const existing = await db.get(db.STORES.meta, META_KEY);
  if (existing) {
    world = { ...DEFAULT_WORLD, ...existing };
  } else {
    world = { ...DEFAULT_WORLD, createdAt: new Date().toISOString() };
    await db.put(db.STORES.meta, world);
  }

  // The two reckonings are seeded, not hardcoded: they are ordinary records
  // and a third can be added at any time.
  if ((await db.count(db.STORES.reckonings)) === 0) {
    await db.putMany(db.STORES.reckonings, DEFAULT_RECKONINGS.map(makeReckoning));
  }

  await db.requestPersistence().catch(() => {});
  emit('ready', getWorld());
  return getWorld();
}

/* --------------------------------------------------------------- pages */

export const listPages = () => db.getAll(db.STORES.pages);
export const getPage = (id) => db.get(db.STORES.pages, id);
export const listPagesOfType = (type) => db.getAllByIndex(db.STORES.pages, 'type', type);

export async function createPage(patch = {}) {
  const page = makePage(patch);
  await write(() => db.put(db.STORES.pages, page));
  emit('change', { store: 'pages', id: page.id, action: 'create' });
  return page;
}

/** Patch a page. Always stamps updatedAt; never lets id or type drift. */
export async function updatePage(id, patch) {
  const current = await getPage(id);
  if (!current) throw new Error(`No page ${id}`);
  const next = { ...current, ...patch, id: current.id, type: current.type, updatedAt: new Date().toISOString() };
  await write(() => db.put(db.STORES.pages, next));
  emit('change', { store: 'pages', id, action: 'update' });
  return next;
}

/* Autosave: keystrokes coalesce into one write per page. */
const debounces = new Map();
export const AUTOSAVE_MS = 400;

export function savePageSoon(id, patch, delay = AUTOSAVE_MS) {
  const queued = debounces.get(id);
  if (queued) {
    clearTimeout(queued.timer);
    patch = { ...queued.patch, ...patch };
  }
  setSaveState('saving');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      debounces.delete(id);
      updatePage(id, patch).then(resolve, reject);
    }, delay);
    debounces.set(id, { timer, patch, resolve, reject });
  });
}

/** Flush every queued edit now — called before unload and before export. */
export async function flush() {
  const queued = [...debounces.entries()];
  debounces.clear();
  for (const [id, entry] of queued) {
    clearTimeout(entry.timer);
    await updatePage(id, entry.patch).then(entry.resolve, entry.reject);
  }
}

/* ------------------------------------------------------- relationships */

export const listRelationships = () => db.getAll(db.STORES.relationships);

export async function relationshipsFor(pageId) {
  const [out, incoming] = await Promise.all([
    db.getAllByIndex(db.STORES.relationships, 'fromId', pageId),
    db.getAllByIndex(db.STORES.relationships, 'toId', pageId),
  ]);
  return { outgoing: out, incoming };
}

export async function createRelationship(patch) {
  const rel = makeRelationship(patch);
  await write(() => db.put(db.STORES.relationships, rel));
  emit('change', { store: 'relationships', id: rel.id, action: 'create' });
  return rel;
}

/* --------------------------------------------------- eras & reckonings */

export const listEras = () => db.getAll(db.STORES.eras);
export const listReckonings = () => db.getAll(db.STORES.reckonings);

export async function createEra(patch) {
  const era = makeEra(patch);
  await write(() => db.put(db.STORES.eras, era));
  emit('change', { store: 'eras', id: era.id, action: 'create' });
  return era;
}

export async function createReckoning(patch) {
  const rkn = makeReckoning(patch);
  await write(() => db.put(db.STORES.reckonings, rkn));
  emit('change', { store: 'reckonings', id: rkn.id, action: 'create' });
  return rkn;
}

export async function getDisplayReckoning() {
  const all = await listReckonings();
  return all.find((r) => r.id === world.displayReckoningId) || all[0] || null;
}

/* -------------------------------------------------------------- images */

export const listImages = () => db.getAll(db.STORES.images);
export const getImage = (id) => db.get(db.STORES.images, id);

export async function addImage(fileOrBlob, patch = {}) {
  const image = makeImage({
    ...patch,
    blob: fileOrBlob,
    mime: fileOrBlob.type,
    filename: patch.filename ?? fileOrBlob.name ?? '',
  });
  await write(() => db.put(db.STORES.images, image));
  emit('change', { store: 'images', id: image.id, action: 'create' });
  return image;
}

/** Object URLs are cached per image and revoked together on teardown. */
const objectUrls = new Map();

export async function imageUrl(id) {
  if (objectUrls.has(id)) return objectUrls.get(id);
  const image = await getImage(id);
  if (!image?.blob) return null;
  const url = URL.createObjectURL(image.blob);
  objectUrls.set(id, url);
  return url;
}

export function releaseImageUrls() {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
}

/* ------------------------------------------------------- trash & undo */

const STORE_OF = {
  pages: db.STORES.pages,
  relationships: db.STORES.relationships,
  eras: db.STORES.eras,
  reckonings: db.STORES.reckonings,
  images: db.STORES.images,
};

const undoStack = [];
export const UNDO_LIMIT = 50;

export function canUndo() { return undoStack.length > 0; }
export function peekUndo() { return undoStack[undoStack.length - 1] || null; }

function pushUndo(entry) {
  undoStack.push(entry);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  emit('undo-state', { canUndo: true, label: entry.label });
}

/**
 * Delete anything. Nothing is destroyed: the record is moved into trash,
 * from which it can be restored, and an undo entry is pushed.
 */
export async function remove(kind, id, { label } = {}) {
  const storeName = STORE_OF[kind];
  if (!storeName) throw new Error(`Cannot delete unknown kind "${kind}"`);

  const trashId = newId('trash');
  const entry = await write(() => db.move(storeName, db.STORES.trash, id, (record) => ({
    id: trashId,
    kind,
    originalId: id,
    title: record.title || record.caption || record.name || id,
    deletedAt: new Date().toISOString(),
    payload: record,
  })));

  pushUndo({ label: label || `Delete ${entry.title}`, undo: () => restore(entry.id) });
  emit('change', { store: kind, id, action: 'delete' });
  return entry;
}

export const listTrash = () => db.getAll(db.STORES.trash);

export async function restore(trashId) {
  const entry = await db.get(db.STORES.trash, trashId);
  if (!entry) throw new Error(`Nothing in the trash with id ${trashId}`);
  const storeName = STORE_OF[entry.kind];
  if (!storeName) throw new Error(`Cannot restore unknown kind "${entry.kind}"`);
  await write(() => db.move(db.STORES.trash, storeName, trashId, (e) => e.payload));
  emit('change', { store: entry.kind, id: entry.originalId, action: 'restore' });
  return entry.payload;
}

/** The only call in the app that destroys data outright. */
export async function purgeTrash(trashId) {
  await write(() => db.del(db.STORES.trash, trashId));
  emit('change', { store: 'trash', id: trashId, action: 'purge' });
}

export async function undo() {
  const entry = undoStack.pop();
  if (!entry) return null;
  await entry.undo();
  emit('undo-state', { canUndo: undoStack.length > 0, label: peekUndo()?.label ?? null });
  return entry.label;
}

/* --------------------------------------------------------------- stats */

/** Counts for the Contents page: per section, broken down by canon status. */
export async function stats() {
  const [pages, images, trash, rels, eras, reckonings] = await Promise.all([
    listPages(), db.count(db.STORES.images), db.count(db.STORES.trash),
    db.count(db.STORES.relationships), db.count(db.STORES.eras), db.count(db.STORES.reckonings),
  ]);

  const sections = {};
  for (const type of PAGE_TYPE_ORDER) {
    sections[type] = { total: 0, sealed: 0, ...Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) };
  }
  let openBlocks = 0;
  let principals = 0;

  for (const page of pages) {
    const section = sections[page.type];
    if (!section) continue;
    section.total++;
    section[page.status]++;
    if (page.devTier === DEV_TIER.SEALED) section.sealed++;
    if (page.castTier === 'principal') principals++;
    for (const block of page.blocks || []) {
      if ((block.status || page.status) === STATUS.OPEN) openBlocks++;
    }
  }

  return {
    sections,
    pages: pages.length,
    images, trash, relationships: rels, eras, reckonings,
    openQuestions: openBlocks + pages.filter((p) => p.status === STATUS.OPEN).length,
    principals,
    lastBackupAt: world.lastBackupAt,
  };
}

/** Most recently touched pages, for the Contents page. */
export async function recent(limit = 8) {
  const pages = await listPages();
  return pages.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, limit);
}

export async function markBackedUp() {
  return updateWorld({ lastBackupAt: new Date().toISOString() });
}

/** Wipe everything and re-seed. Used by import-replace and by the self-test. */
export async function reset() {
  await db.wipe();
  undoStack.length = 0;
  releaseImageUrls();
  return init();
}

export { db };
