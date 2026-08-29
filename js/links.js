/* Linking — the author's "fast travel".
 *
 *   [[Page]]            a link to a page, by title or by any of its aliases
 *   [[Page#Heading]]    a link to a heading inside that page
 *   [[Page|other words]] the same link, reading as something else
 *
 * Targets are stored as the author typed them, never as ids: a link is a
 * claim about a title, and resolving it at render time is what makes a
 * broken link visible instead of silently dangling. Sealed pages resolve
 * if you link them deliberately, but never appear in suggestions.
 */

import { DEV_TIER } from './schema.js';
import { slugify } from './markdown.js';

/* A target may not contain a bracket: given an unclosed or nested `[[`,
 * the inner, complete link is the one the author meant. */
export const LINK_PATTERN = /\[\[([^[\]|#]*)(?:#([^[\]|]*))?(?:\|([^[\]]*))?\]\]/g;

/** Split text into plain and link tokens. Pure: the view builds the DOM. */
export function tokenise(text) {
  const tokens = [];
  let last = 0;
  const source = String(text ?? '');

  for (const match of source.matchAll(LINK_PATTERN)) {
    const [raw, target, anchor, alias] = match;
    if (match.index > last) tokens.push({ type: 'text', text: source.slice(last, match.index) });
    tokens.push({
      type: 'link',
      raw,
      target: (target || '').trim(),
      anchor: anchor?.trim() || null,
      alias: alias?.trim() || null,
      label: (alias || target || '').trim() + (alias ? '' : anchor ? ` › ${anchor.trim()}` : ''),
    });
    last = match.index + raw.length;
  }
  if (last < source.length) tokens.push({ type: 'text', text: source.slice(last) });
  return tokens;
}

/** Every link in a page's body and summary, in document order. */
export function linksIn(page) {
  const found = [];
  const scan = (text) => {
    for (const token of tokenise(text)) {
      if (token.type === 'link' && token.target) found.push({ target: token.target, anchor: token.anchor });
    }
  };
  scan(page.summary);
  for (const block of page.blocks || []) scan(block.text);

  const seen = new Set();
  return found.filter((link) => {
    const key = `${link.target.toLowerCase()}#${(link.anchor || '').toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* -------------------------------------------------------------- resolving */

/**
 * A lookup from title and alias to page. Later pages do not steal a name
 * an earlier page already holds, so a resolution stays stable as the
 * world grows; collisions are reported rather than silently picked.
 */
export function buildIndex(pages) {
  const byName = new Map();
  const collisions = [];

  const claim = (name, page) => {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return;
    const held = byName.get(key);
    if (held && held.id !== page.id) { collisions.push({ name, held, other: page }); return; }
    if (!held) byName.set(key, page);
  };

  for (const page of pages) claim(page.title, page);
  for (const page of pages) for (const alias of page.aliases || []) claim(alias, page);

  return {
    byName,
    collisions,
    pages,
    byId: new Map(pages.map((p) => [p.id, p])),
  };
}

/** Resolve one link to a page, or null when nothing answers to that name. */
export function resolve(index, target) {
  return index.byName.get(String(target || '').trim().toLowerCase()) || null;
}

/** Does a page actually contain the heading a link points at? */
export function hasAnchor(page, anchor) {
  if (!anchor) return true;
  const wanted = slugify(anchor);
  return (page.blocks || []).some((b) => b.kind === 'heading' && (b.anchor || slugify(b.text)) === wanted);
}

/** A link plus everything the renderer needs to draw it honestly. */
export function resolveLink(index, link) {
  const page = resolve(index, link.target);
  if (!page) return { ...link, page: null, broken: 'page' };
  if (!hasAnchor(page, link.anchor)) return { ...link, page, broken: 'anchor' };
  return { ...link, page, broken: null };
}

/* -------------------------------------------------------------- backlinks */

/**
 * Who points here. Built by walking every page's links once, so a rename
 * that breaks a link shows up on both sides immediately.
 */
export function buildBacklinks(pages, index = buildIndex(pages)) {
  const incoming = new Map();
  for (const page of pages) {
    for (const link of linksIn(page)) {
      const target = resolve(index, link.target);
      if (!target || target.id === page.id) continue;
      if (!incoming.has(target.id)) incoming.set(target.id, []);
      const list = incoming.get(target.id);
      if (!list.some((entry) => entry.from.id === page.id && entry.anchor === link.anchor)) {
        list.push({ from: page, anchor: link.anchor });
      }
    }
  }
  return incoming;
}

/** Every link that points at nothing, for the maintenance view. */
export function brokenLinks(pages, index = buildIndex(pages)) {
  const broken = [];
  for (const page of pages) {
    for (const link of linksIn(page)) {
      const resolved = resolveLink(index, link);
      if (resolved.broken) broken.push({ from: page, ...resolved });
    }
  }
  return broken;
}

/**
 * Broken links, grouped for the maintenance view: one row per page and
 * missing name, since mending that name mends every link to it at once.
 * An anchor break stays its own row — each missing heading is its own fix.
 */
export function groupBroken(broken) {
  const rows = new Map();
  for (const entry of broken) {
    const key = [entry.from.id, entry.broken, entry.target.toLowerCase(), entry.broken === 'anchor' ? entry.anchor : ''].join('|');
    const row = rows.get(key);
    if (row) row.count++;
    else rows.set(key, { ...entry, count: 1 });
  }
  return [...rows.values()];
}

/* ------------------------------------------------------------ suggestions */

/**
 * What `[[` should offer. Sealed pages are never suggested — that is the
 * quarantine working — and an exact prefix beats a match in the middle.
 */
export function suggest(pages, query, { limit = 8, excludeId = null, revealSealed = false } = {}) {
  const needle = String(query || '').trim().toLowerCase();

  const scored = [];
  for (const page of pages) {
    if (page.id === excludeId) continue;
    if (page.devTier === DEV_TIER.SEALED && !revealSealed) continue;

    const names = [page.title, ...(page.aliases || [])].filter(Boolean);
    let best = null;
    for (const name of names) {
      const lower = name.toLowerCase();
      const score = !needle ? 3
        : lower === needle ? 0
        : lower.startsWith(needle) ? 1
        : lower.includes(needle) ? 2
        : null;
      if (score == null) continue;
      if (best == null || score < best.score) best = { score, name, isAlias: name !== page.title };
    }
    if (best) scored.push({ page, ...best });
  }

  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
  scored.sort((a, b) => a.score - b.score
    || (b.page.updatedAt || '').localeCompare(a.page.updatedAt || '')
    || collator.compare(a.page.title, b.page.title));
  return scored.slice(0, limit);
}

/** Headings inside a page, for `[[Page#` completion. */
export function headingsOf(page, query = '') {
  const needle = query.trim().toLowerCase();
  return (page.blocks || [])
    .filter((b) => b.kind === 'heading' && b.text?.trim())
    .map((b) => ({ text: b.text.trim(), anchor: b.anchor || slugify(b.text) }))
    .filter((h) => !needle || h.text.toLowerCase().includes(needle));
}

/**
 * The `[[` the caret is currently inside, if any — what the autocomplete
 * needs in order to know whether to open, and on what.
 */
export function activeLinkAt(text, caret) {
  const before = String(text ?? '').slice(0, caret);
  const start = before.lastIndexOf('[[');
  if (start === -1) return null;
  const fragment = before.slice(start + 2);
  if (fragment.includes(']]') || fragment.includes('\n')) return null;

  const hash = fragment.indexOf('#');
  return {
    start,
    caret,
    query: hash === -1 ? fragment : fragment.slice(0, hash),
    anchorQuery: hash === -1 ? null : fragment.slice(hash + 1),
  };
}

/** Replace the `[[…` under the caret with a finished link. */
export function completeLink(text, active, { title, anchor = null }) {
  const source = String(text ?? '');
  const inserted = `[[${title}${anchor ? `#${anchor}` : ''}]]`;
  const after = source.slice(active.caret).startsWith(']]') ? source.slice(active.caret + 2) : source.slice(active.caret);
  return { text: source.slice(0, active.start) + inserted + after, caret: active.start + inserted.length };
}

/** The first lines of a page, for the hover and long-press preview. */
export function previewOf(page, { anchor = null, maxLength = 260 } = {}) {
  const blocks = page.blocks || [];
  let start = 0;
  if (anchor) {
    const wanted = slugify(anchor);
    const index = blocks.findIndex((b) => b.kind === 'heading' && (b.anchor || slugify(b.text)) === wanted);
    if (index >= 0) start = index + 1;
  }
  const prose = blocks.slice(start).find((b) => b.kind !== 'heading' && b.text?.trim());
  const text = (anchor ? prose?.text : page.summary || prose?.text) || prose?.text || '';
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1)}…` : flat;
}
