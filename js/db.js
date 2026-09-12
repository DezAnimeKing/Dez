/* IndexedDB access. The only module in the app that knows IndexedDB exists.
 *
 * IndexedDB rather than localStorage because images are stored as real
 * Blobs — never base64 in a text field, and never in localStorage.
 */

export const DB_NAME = 'compendium';
export const DB_VERSION = 1;

export const STORES = Object.freeze({
  meta: 'meta',
  pages: 'pages',
  relationships: 'relationships',
  eras: 'eras',
  reckonings: 'reckonings',
  images: 'images',
  trash: 'trash',
});

/** Every store except `meta` is keyed by a record `id` field. */
export const RECORD_STORES = Object.freeze([
  STORES.pages, STORES.relationships, STORES.eras,
  STORES.reckonings, STORES.images, STORES.trash,
]);

let dbPromise = null;

export function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('This browser has no IndexedDB. The Compendium cannot store data safely here.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => upgrade(req.result, event.oldVersion);
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('The Compendium is open in another tab holding an older version.'));
  });
  return dbPromise;
}

function upgrade(db, oldVersion) {
  if (oldVersion < 1) {
    db.createObjectStore(STORES.meta, { keyPath: 'key' });

    const pages = db.createObjectStore(STORES.pages, { keyPath: 'id' });
    pages.createIndex('type', 'type');
    pages.createIndex('status', 'status');
    pages.createIndex('devTier', 'devTier');
    pages.createIndex('updatedAt', 'updatedAt');
    pages.createIndex('title', 'title');

    const rels = db.createObjectStore(STORES.relationships, { keyPath: 'id' });
    rels.createIndex('fromId', 'fromId');
    rels.createIndex('toId', 'toId');
    rels.createIndex('mode', 'mode');

    db.createObjectStore(STORES.eras, { keyPath: 'id' });
    db.createObjectStore(STORES.reckonings, { keyPath: 'id' });

    const images = db.createObjectStore(STORES.images, { keyPath: 'id' });
    images.createIndex('createdAt', 'createdAt');

    const trash = db.createObjectStore(STORES.trash, { keyPath: 'id' });
    trash.createIndex('deletedAt', 'deletedAt');
  }
  // Future versions append their migrations here. Never rewrite an old one.
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

function ask(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function get(storeName, key) {
  const db = await open();
  return ask(db.transaction(storeName, 'readonly').objectStore(storeName).get(key));
}

export async function getAll(storeName) {
  const db = await open();
  return ask(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
}

export async function getAllByIndex(storeName, indexName, value) {
  const db = await open();
  const idx = db.transaction(storeName, 'readonly').objectStore(storeName).index(indexName);
  return ask(idx.getAll(value));
}

export async function count(storeName) {
  const db = await open();
  return ask(db.transaction(storeName, 'readonly').objectStore(storeName).count());
}

export async function put(storeName, record) {
  const db = await open();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(record);
  await done(tx);
  return record;
}

/** One transaction for the whole batch: all of it lands, or none of it does. */
export async function putMany(storeName, records) {
  if (!records.length) return 0;
  const db = await open();
  const tx = db.transaction(storeName, 'readwrite');
  const os = tx.objectStore(storeName);
  for (const r of records) os.put(r);
  await done(tx);
  return records.length;
}

export async function del(storeName, key) {
  const db = await open();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(key);
  await done(tx);
}

/** Move a record between stores atomically — used by delete-to-trash.
 *
 * The put and the delete are issued inside the get's own success handler so
 * the whole move rides one transaction: a record can never be dropped from
 * one store without landing in the other.
 */
export async function move(fromStore, toStore, key, transform = (r) => r) {
  const db = await open();
  const tx = db.transaction([fromStore, toStore], 'readwrite');
  let moved = null;
  const req = tx.objectStore(fromStore).get(key);
  req.onsuccess = () => {
    const record = req.result;
    if (!record) { tx.abort(); return; }
    moved = transform(record);
    tx.objectStore(toStore).put(moved);
    tx.objectStore(fromStore).delete(key);
  };
  await done(tx).catch((err) => {
    throw moved === null ? new Error(`No record ${key} in ${fromStore}`) : err;
  });
  return moved;
}

/** Read every store at once — the basis of export and of the self-test. */
export async function snapshotStores() {
  const db = await open();
  const names = [STORES.meta, ...RECORD_STORES];
  const tx = db.transaction(names, 'readonly');
  const out = {};
  await Promise.all(names.map(async (n) => { out[n] = await ask(tx.objectStore(n).getAll()); }));
  await done(tx);
  return out;
}

/**
 * Replace the entire database contents in ONE transaction. An import that
 * fails halfway leaves the existing world untouched rather than half-eaten.
 */
export async function replaceAll(data) {
  const db = await open();
  const names = [STORES.meta, ...RECORD_STORES];
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) {
    const os = tx.objectStore(name);
    os.clear();
    for (const record of data[name] || []) os.put(record);
  }
  await done(tx);
}

/** Merge records in without clearing anything (additive import). */
export async function mergeAll(data) {
  const db = await open();
  const names = [STORES.meta, ...RECORD_STORES];
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) {
    const os = tx.objectStore(name);
    for (const record of data[name] || []) os.put(record);
  }
  await done(tx);
}

/** Test/reset support. Destructive, and only ever called deliberately. */
export async function wipe() {
  const db = await open();
  const names = [STORES.meta, ...RECORD_STORES];
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) tx.objectStore(name).clear();
  await done(tx);
}

export async function estimateUsage() {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { usage, quota };
}

/** Ask the browser not to evict us under storage pressure. */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return null;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
