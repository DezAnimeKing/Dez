/* Export / import. Everything in one JSON file, images included.
 *
 * The rule this module exists to honour: the author must always be able to
 * get the entire world out, and put the entire world back, with nothing
 * silently dropped. Counts are recorded on the way out and verified on the
 * way back in.
 */

import { SCHEMA_VERSION } from './schema.js';
import * as db from './db.js';

export const EXPORT_FORMAT = 'compendium-export';
export const EXPORT_VERSION = 1;

/* --------------------------------------------------------- blob encoding */

const BLOB_MARKER = '__blob__';

async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000; // chunked: String.fromCharCode dies on huge spreads
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBlob(b64, mime) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'application/octet-stream' });
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && !(v instanceof Blob) && !(v instanceof Date);

/** Walk a record, replacing Blobs with base64 envelopes. */
async function encodeValue(value) {
  if (value instanceof Blob) {
    return { [BLOB_MARKER]: true, mime: value.type || '', size: value.size, data: await blobToBase64(value) };
  }
  if (Array.isArray(value)) return Promise.all(value.map(encodeValue));
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = await encodeValue(v);
    return out;
  }
  return value;
}

function decodeValue(value) {
  if (isPlainObject(value) && value[BLOB_MARKER]) return base64ToBlob(value.data, value.mime);
  if (Array.isArray(value)) return value.map(decodeValue);
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = decodeValue(v);
    return out;
  }
  return value;
}

/* ------------------------------------------------------------ serialising */

const STORE_NAMES = [db.STORES.meta, ...db.RECORD_STORES];

function countsOf(data) {
  const counts = {};
  for (const name of STORE_NAMES) counts[name] = (data[name] || []).length;
  return counts;
}

/** Snapshot (raw records, Blobs live) → a plain JSON-safe export object. */
export async function serialise(snapshot, extra = {}) {
  const data = {};
  for (const name of STORE_NAMES) data[name] = await encodeValue(snapshot[name] || []);
  return {
    format: EXPORT_FORMAT,
    exportVersion: EXPORT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'The Compendium',
    counts: countsOf(snapshot),
    ...extra,
    data,
  };
}

export class ImportError extends Error {}

/** Export object → snapshot of raw records, Blobs restored. */
export function deserialise(payload) {
  if (!payload || typeof payload !== 'object') throw new ImportError('That file is not JSON the Compendium understands.');
  if (payload.format !== EXPORT_FORMAT) throw new ImportError('That file is not a Compendium export.');
  if (typeof payload.schemaVersion !== 'number') throw new ImportError('The export is missing its schema version.');
  if (payload.schemaVersion > SCHEMA_VERSION) {
    throw new ImportError(`This export was written by a newer Compendium (schema ${payload.schemaVersion}). Update the app before importing.`);
  }
  if (!payload.data || typeof payload.data !== 'object') throw new ImportError('The export contains no data section.');

  const snapshot = {};
  for (const name of STORE_NAMES) {
    const rows = payload.data[name] || [];
    if (!Array.isArray(rows)) throw new ImportError(`The "${name}" section of the export is malformed.`);
    snapshot[name] = rows.map(decodeValue);
  }

  // A count mismatch means the file was truncated or edited. Refuse it
  // rather than restoring a partial world over a good one.
  if (payload.counts) {
    for (const [name, expected] of Object.entries(payload.counts)) {
      const actual = (snapshot[name] || []).length;
      if (actual !== expected) {
        throw new ImportError(`The export looks incomplete: "${name}" claims ${expected} records but carries ${actual}.`);
      }
    }
  }
  return snapshot;
}

/* -------------------------------------------------------- whole-DB export */

export async function exportSnapshot(extra = {}) {
  return serialise(await db.snapshotStores(), extra);
}

export async function exportJSON(extra = {}) {
  return JSON.stringify(await exportSnapshot(extra), null, 2);
}

/**
 * Restore. `mode: 'replace'` wipes and restores; `mode: 'merge'` overlays.
 * Both go through a single transaction inside db, so a failure is a no-op.
 */
export async function importSnapshot(payload, { mode = 'replace' } = {}) {
  const snapshot = deserialise(payload);
  if (mode === 'merge') await db.mergeAll(snapshot);
  else await db.replaceAll(snapshot);
  return countsOf(snapshot);
}

export async function importJSON(text, options) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new ImportError('That file is not valid JSON.'); }
  return importSnapshot(parsed, options);
}

/* ------------------------------------------------------------ file plumbing */

export function backupFilename(worldTitle = 'compendium') {
  const slug = String(worldTitle).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'compendium';
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `${slug}-backup-${stamp}.json`;
}

export function downloadText(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
