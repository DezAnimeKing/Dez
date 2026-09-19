const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function uid(prefix = "") {
  let out = "";
  const bytes = new Uint8Array(10);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return prefix ? `${prefix}_${out}` : out;
}

export function slug(text, fallback = "item") {
  const base = String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || fallback;
}

/** Fractional ordering so a card can be dropped between two others. */
export function orderBetween(before, after) {
  if (before === null || before === undefined) return (after ?? 1000) - 100;
  if (after === null || after === undefined) return before + 100;
  return (before + after) / 2;
}
