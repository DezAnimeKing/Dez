import { store } from "./state.js";

// Talks to the Worker. The rules are deliberately dull: push what this device
// changed, pull what the others changed, last write wins per entity. Anything
// that fails is retried on the next run — nothing is ever dropped locally.

const listeners = new Set();
const PUSH_DELAY = 2500;
const POLL_INTERVAL = 60000;
const RETRY_BASE = 5000;
const MAX_BATCH = 400;

export const sync = {
  status: "off",      // off | idle | syncing | offline | error
  message: "",
  lastSyncedAt: null,
  pending: 0,
};

let timer = null;
let pollTimer = null;
let running = null;
let failures = 0;
let started = false;

export function onSync(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(patch = {}) {
  Object.assign(sync, patch, { pending: store.pendingCount() });
  for (const listener of [...listeners]) listener(sync);
}

export const isConnected = () => Boolean(store.state.sync.url && store.state.sync.token);

function endpoint(path) {
  const base = store.state.sync.url.replace(/\/+$/, "");
  return `${base}${path}`;
}

async function request(path, { method = "POST", body = null, token = store.state.sync.token } = {}) {
  const response = await fetch(endpoint(path), {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try { payload = await response.json(); } catch { /* non-JSON error page */ }

  if (!response.ok) {
    const error = new Error(payload?.error || `Server said ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

/* ---------------- connecting ---------------- */

/**
 * @returns {Promise<{serverHasData: boolean}>}
 */
/**
 * Accepts whatever someone pastes out of an address bar — the app's own hash
 * route, a query string, a trailing slash, or no scheme at all — and reduces
 * it to the base the API lives under.
 */
export function normalizeServerUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Enter the address of your sync server");

  let parsed;
  try {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error("That does not look like a web address");
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("The address needs to start with https://");
  }
  // The hash is the app's own routing, never part of the server address.
  return `${parsed.origin}${parsed.pathname}`.replace(/\/index\.html$/i, "").replace(/\/+$/, "");
}

export async function connect(url, passphrase, { deviceName = "" } = {}) {
  const clean = normalizeServerUrl(url);

  const response = await fetch(`${clean}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passphrase }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) throw new Error(payload?.error || "That passphrase was not accepted");
    if (response.status === 404) throw new Error(`No sync server answered at ${clean} — check the address`);
    throw new Error(payload?.error || `Server said ${response.status}`);
  }

  store.setSync({
    url: clean,
    token: payload.token,
    lastError: null,
    deviceName: deviceName || store.state.sync.deviceName || guessDeviceName(),
  });
  emit({ status: "idle", message: "Connected" });
  return { serverHasData: Boolean(payload.hasData) };
}

export function disconnect() {
  stop();
  store.setSync({ url: "", token: "", cursor: 0, lastSyncedAt: null, lastError: null });
  emit({ status: "off", message: "", lastSyncedAt: null });
}

/** Take the server's copy as the truth on this device. */
export async function adoptServerCopy() {
  store.clearLocalEntities();
  store.setSync({ cursor: 0 });
  await run({ force: true });
}

/** Send everything this device has, then merge in whatever comes back. */
export async function uploadEverything() {
  store.markAllDirty();
  await run({ force: true });
}

function guessDeviceName() {
  const agent = navigator.userAgent || "";
  if (/iPhone|Android.*Mobile/i.test(agent)) return "Phone";
  if (/iPad|Tablet/i.test(agent)) return "Tablet";
  if (/Mac/i.test(agent)) return "Mac";
  if (/Windows/i.test(agent)) return "PC";
  return "This device";
}

/* ---------------- the sync run ---------------- */

export function run(options = {}) {
  if (running) return running;
  running = doRun(options).finally(() => { running = null; });
  return running;
}

async function doRun({ force = false } = {}) {
  if (!isConnected()) return { ok: false, reason: "not connected" };
  if (!navigator.onLine && !force) {
    emit({ status: "offline", message: "Offline — changes are queued" });
    return { ok: false, reason: "offline" };
  }

  emit({ status: "syncing", message: "Syncing…" });

  try {
    const changes = store.pendingChanges().slice(0, MAX_BATCH);
    const payload = await request("/api/sync", {
      body: {
        cursor: store.state.sync.cursor || 0,
        device: store.state.sync.deviceId,
        changes,
      },
    });

    if (changes.length) store.clearDirty(changes);
    const applied = payload.changes?.length ? store.applyRemote(payload.changes) : 0;
    store.setSync({ cursor: payload.cursor ?? store.state.sync.cursor, lastSyncedAt: Date.now(), lastError: null });

    failures = 0;
    const more = store.pendingCount() > 0;
    emit({
      status: "idle",
      message: applied ? `Merged ${applied} change${applied === 1 ? "" : "s"}` : "Up to date",
      lastSyncedAt: store.state.sync.lastSyncedAt,
    });
    if (applied) store.emit();
    if (more) schedule(400); // a batch was capped, or edits landed mid-flight
    return { ok: true, applied, pushed: changes.length };
  } catch (error) {
    failures += 1;
    if (error.status === 401) {
      store.setSync({ token: "", lastError: "Sign in again" });
      emit({ status: "error", message: "Sign in again" });
      return { ok: false, reason: "unauthorised" };
    }
    const offline = !navigator.onLine || error.name === "TypeError";
    store.setSync({ lastError: error.message });
    emit({
      status: offline ? "offline" : "error",
      message: offline ? "Offline — changes are queued" : error.message,
    });
    schedule(Math.min(RETRY_BASE * 2 ** Math.min(failures, 5), 5 * 60000));
    return { ok: false, reason: error.message };
  }
}

export function schedule(delay = PUSH_DELAY) {
  if (!isConnected()) return;
  clearTimeout(timer);
  timer = setTimeout(() => run(), delay);
}

export function stop() {
  started = false;
  clearTimeout(timer);
  clearInterval(pollTimer);
  timer = null;
  pollTimer = null;
}

/** Wire the automatic triggers: edits, focus, reconnection, and a slow poll. */
export function start() {
  if (started) return;
  started = true;

  store.subscribe(() => {
    emit();
    if (store.pendingCount() > 0) schedule();
  });

  window.addEventListener("online", () => { failures = 0; run(); });
  window.addEventListener("offline", () => emit({ status: "offline", message: "Offline — changes are queued" }));
  window.addEventListener("focus", () => { if (isConnected()) run(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isConnected()) run();
  });
  // A last push on the way out, best effort.
  window.addEventListener("pagehide", () => {
    if (!isConnected() || !store.pendingCount()) return;
    const body = JSON.stringify({
      cursor: store.state.sync.cursor || 0,
      device: store.state.sync.deviceId,
      token: store.state.sync.token,
      changes: store.pendingChanges().slice(0, MAX_BATCH),
    });
    try { navigator.sendBeacon?.(endpoint("/api/beacon"), new Blob([body], { type: "application/json" })); }
    catch { /* nothing more we can do here */ }
  });

  pollTimer = setInterval(() => { if (isConnected()) run(); }, POLL_INTERVAL);

  if (isConnected()) {
    emit({ status: "idle", lastSyncedAt: store.state.sync.lastSyncedAt });
    run();
  } else {
    emit({ status: "off" });
  }
}
