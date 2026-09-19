/**
 * Dezk sync server — a Cloudflare Worker over D1.
 *
 * It serves the app itself from the ASSETS binding and exposes three routes:
 *   POST /api/login   passphrase -> bearer token
 *   POST /api/sync    push local changes, pull everyone else's
 *   POST /api/beacon  a last-gasp push from `navigator.sendBeacon`
 *
 * There are no user accounts: one passphrase covers all your devices. Rows are
 * opaque JSON — the server never looks inside them, it only orders them.
 */

const TOKEN_DAYS = 120;
const MAX_CHANGES = 500;
const MAX_BODY_BYTES = 2_000_000;

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...cors(), ...extra },
  });

const cors = () => ({
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-max-age": "86400",
});

const encoder = new TextEncoder();

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return base64url(new Uint8Array(signature));
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Length-independent comparison, so a wrong guess tells you nothing. */
async function sameSecret(a, b) {
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(String(a))),
    crypto.subtle.digest("SHA-256", encoder.encode(String(b))),
  ]);
  const x = new Uint8Array(left);
  const y = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function issueToken(env) {
  const expires = Date.now() + TOKEN_DAYS * 86400000;
  return `${expires}.${await hmac(env.DEZK_PASSPHRASE, String(expires))}`;
}

async function tokenValid(env, token) {
  if (!token || !token.includes(".")) return false;
  const [expires, signature] = token.split(".");
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  return sameSecret(signature, await hmac(env.DEZK_PASSPHRASE, expires));
}

const bearer = (request) => (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();

function configError(env) {
  if (!env.DB) return "This worker has no D1 database bound as DB.";
  if (!env.DEZK_PASSPHRASE) return "No passphrase is set. Run: npx wrangler secret put DEZK_PASSPHRASE";
  return null;
}

/* ---------------- handlers ---------------- */

async function handleLogin(request, env) {
  const { passphrase } = await request.json().catch(() => ({}));
  if (!passphrase || !(await sameSecret(passphrase, env.DEZK_PASSPHRASE))) {
    // A small delay blunts online guessing without needing any state.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return json({ error: "That passphrase was not accepted" }, 401);
  }
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM items WHERE deleted = 0").first();
  return json({ token: await issueToken(env), hasData: (row?.n || 0) > 0 });
}

async function applyChanges(env, changes, device) {
  if (!changes.length) return 0;

  // Sequence numbers come from the server clock rather than a shared counter,
  // so two devices pushing at once cannot hand out the same number.
  const head = await env.DB.prepare("SELECT MAX(seq) AS m FROM items").first();
  let seq = Math.max(Date.now(), Number(head?.m || 0) + 1) - 1;

  const statements = [];
  for (const change of changes.slice(0, MAX_CHANGES)) {
    if (!change || typeof change.kind !== "string" || typeof change.id !== "string") continue;
    if (change.kind.length > 40 || change.id.length > 120) continue;
    const body = change.deleted ? null : JSON.stringify(change.body ?? null);
    if (body && body.length > MAX_BODY_BYTES) continue;
    seq += 1;
    statements.push(
      env.DB.prepare(
        `INSERT INTO items (kind, id, updated_at, seq, deleted, device, body)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT (kind, id) DO UPDATE SET
           updated_at = excluded.updated_at,
           seq        = excluded.seq,
           deleted    = excluded.deleted,
           device     = excluded.device,
           body       = excluded.body
         WHERE excluded.updated_at > items.updated_at`
      ).bind(change.kind, change.id, Number(change.updatedAt) || Date.now(), seq, change.deleted ? 1 : 0, device || null, body)
    );
  }

  if (!statements.length) return 0;
  await env.DB.batch(statements);
  return statements.length;
}

async function pullSince(env, cursor, device) {
  // `>=` rather than `>`: re-sending the boundary row is harmless (applying a
  // change twice is a no-op) and it means a row can never be stepped over.
  const { results } = await env.DB.prepare(
    `SELECT kind, id, updated_at, seq, deleted, body
     FROM items
     WHERE seq >= ?1 AND (device IS NULL OR device <> ?2)
     ORDER BY seq
     LIMIT 1000`
  ).bind(cursor, device || "").all();

  const head = await env.DB.prepare("SELECT MAX(seq) AS v FROM items").first();
  const changes = (results || []).map((row) => ({
    kind: row.kind,
    id: row.id,
    updatedAt: row.updated_at,
    deleted: Boolean(row.deleted),
    body: row.body ? JSON.parse(row.body) : null,
  }));

  // If the batch was capped, only advance as far as the rows handed over;
  // otherwise the client has seen everything up to the current head.
  const truncated = (results?.length || 0) >= 1000;
  const highest = truncated
    ? results[results.length - 1].seq
    : Math.max(Number(head?.v || 0), cursor);
  return { changes, cursor: highest };
}

async function handleSync(request, env) {
  const payload = await request.json().catch(() => null);
  if (!payload) return json({ error: "Expected a JSON body" }, 400);

  const device = typeof payload.device === "string" ? payload.device.slice(0, 80) : "";
  const changes = Array.isArray(payload.changes) ? payload.changes : [];
  const cursor = Number.isFinite(payload.cursor) ? Number(payload.cursor) : 0;

  // Pull BEFORE applying the push. Otherwise a device's own write can replace
  // a row it has not seen yet, and — because a device never pulls back its own
  // writes — the version it replaced would be lost for good. Pulling first
  // means the client always sees the other device's copy and can merge it.
  const pulled = await pullSince(env, cursor, device);
  const received = await applyChanges(env, changes, device);
  return json({ ...pulled, received });
}

/* ---------------- entry point ---------------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });

    if (!url.pathname.startsWith("/api/")) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("Dezk sync server is running. The app is not served from here.", {
        status: 200, headers: { "content-type": "text/plain" },
      });
    }

    const problem = configError(env);
    if (problem && url.pathname !== "/api/health") return json({ error: problem }, 500);

    try {
      if (url.pathname === "/api/health") {
        return json({ ok: !problem, error: problem || undefined, version: 1 });
      }
      if (url.pathname === "/api/login" && request.method === "POST") {
        return handleLogin(request, env);
      }
      if (url.pathname === "/api/sync" && request.method === "POST") {
        if (!(await tokenValid(env, bearer(request)))) return json({ error: "Sign in again" }, 401);
        return handleSync(request, env);
      }
      if (url.pathname === "/api/beacon" && request.method === "POST") {
        // sendBeacon cannot set headers, so the token travels in the body.
        const payload = await request.json().catch(() => null);
        if (!payload || !(await tokenValid(env, payload.token))) return json({ error: "Sign in again" }, 401);
        await applyChanges(env, Array.isArray(payload.changes) ? payload.changes : [], payload.device);
        return json({ ok: true });
      }
      return json({ error: "No such endpoint" }, 404);
    } catch (error) {
      return json({ error: error.message || "Something went wrong" }, 500);
    }
  },
};
