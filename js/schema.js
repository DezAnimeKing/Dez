/* The Compendium — schema, closed vocabularies, record factories.
 *
 * Everything the rest of the app is allowed to know about the shape of the
 * data lives here. The vocabularies are CLOSED on purpose: the whole reason
 * this app exists is that the author kept conflating kinds of continuity.
 */

export const SCHEMA_VERSION = 1;

/* ---------------------------------------------------------------- canon */

export const STATUS = Object.freeze({
  CANON: 'CANON',
  PROPOSED: 'PROPOSED',
  OPEN: 'OPEN',
  SOURCE: 'SOURCE',
});

export const STATUS_ORDER = Object.freeze(['CANON', 'PROPOSED', 'OPEN', 'SOURCE']);

export const STATUS_META = Object.freeze({
  CANON:    { label: 'Canon',    hint: 'Settled. Fixed.',                       token: '--status-canon' },
  PROPOSED: { label: 'Proposed', hint: 'Suggested, awaiting a ruling.',         token: '--status-proposed' },
  OPEN:     { label: 'Open',     hint: 'A live question requiring a decision.', token: '--status-open' },
  SOURCE:   { label: 'Source',   hint: 'Real-world myth being adapted.',        token: '--status-source' },
});

/* ------------------------------------------------------- development tier */

export const DEV_TIER = Object.freeze({
  CANON: 'canon',       // part of the world
  EXERCISE: 'exercise', // live idea material, binding on nothing
  SEALED: 'sealed',     // quarantined: out of search and link suggestions
});

export const DEV_TIER_ORDER = Object.freeze(['canon', 'exercise', 'sealed']);

/* -------------------------------------------------------------- cast tier */

export const CAST_TIER = Object.freeze({
  PRINCIPAL: 'principal',
  INSTRUMENT: 'instrument',
  RECORD: 'record',
});

export const CAST_TIER_ORDER = Object.freeze(['principal', 'instrument', 'record']);

/** The author is deliberately capping Principals. Advisory, never enforced. */
export const PRINCIPAL_CAP = 8;

/* ------------------------------------------------------- continuity modes */

/* Seven kinds of continuity between people, plus the ordinary relations.
 * Do not extend this list. */
export const CONTINUITY_MODE = Object.freeze({
  TRANSMIGRATION: 'transmigration',
  SIGNATURE_RECURRENCE: 'signature_recurrence',
  HEREDITARY_SIGNATURE: 'hereditary_signature',
  FRAGMENT_CARRIAGE: 'fragment_carriage',
  COMPOSITE: 'composite',
  PERSISTENCE: 'persistence',
  OFFICE: 'office',
});

export const ORDINARY_RELATION = Object.freeze({
  PARENT: 'parent',
  CHILD: 'child',
  SIBLING: 'sibling',
  SPOUSE: 'spouse',
  ALLY: 'ally',
  ENEMY: 'enemy',
  MENTOR: 'mentor',
});

export const RELATION_META = Object.freeze({
  transmigration:       { label: 'Transmigration',       group: 'continuity', line: 'solid',      hint: 'Same soul, new body, no memory carried.' },
  signature_recurrence: { label: 'Signature Recurrence', group: 'continuity', line: 'dashed',     hint: 'Same cosmic role, different soul entirely.' },
  hereditary_signature: { label: 'Hereditary Signature', group: 'continuity', line: 'double',     hint: 'Descent; a trait carried by blood, not a rebirth.' },
  fragment_carriage:    { label: 'Fragment Carriage',    group: 'continuity', line: 'dotted',     hint: 'A piece of one soul lodged inside another; carries memory.' },
  composite:            { label: 'Composite',            group: 'continuity', line: 'braided',    hint: 'Many souls bundled in one vessel or object.' },
  persistence:          { label: 'Persistence',          group: 'continuity', line: 'thick',      hint: 'Never died; preserved rather than renewed.' },
  office:               { label: 'Office / Title',       group: 'continuity', line: 'dash-dot',   hint: 'A name and function inherited, no soul or blood relation.' },
  parent:               { label: 'Parent',  group: 'ordinary', line: 'plain', hint: '', inverse: 'child' },
  child:                { label: 'Child',   group: 'ordinary', line: 'plain', hint: '', inverse: 'parent' },
  sibling:              { label: 'Sibling', group: 'ordinary', line: 'plain', hint: '', inverse: 'sibling' },
  spouse:               { label: 'Spouse',  group: 'ordinary', line: 'plain', hint: '', inverse: 'spouse' },
  ally:                 { label: 'Ally',    group: 'ordinary', line: 'plain', hint: '', inverse: 'ally' },
  enemy:                { label: 'Enemy',   group: 'ordinary', line: 'plain', hint: '', inverse: 'enemy' },
  mentor:               { label: 'Mentor',  group: 'ordinary', line: 'plain', hint: '' },
});

export const RELATION_MODES = Object.freeze(Object.keys(RELATION_META));
export const CONTINUITY_MODES = Object.freeze(Object.values(CONTINUITY_MODE));

/* ------------------------------------------------------------ page types */

export const PAGE_TYPE = Object.freeze({
  CHARACTER: 'character',
  REGION: 'region',
  EVENT: 'event',
  SCENE: 'scene',
  SYSTEM: 'system',
  IMAGE: 'image',
});

export const PAGE_TYPE_ORDER = Object.freeze(['character', 'region', 'event', 'scene', 'system', 'image']);

/** Symbols an event may be drawn with on the timeline. */
export const EVENT_SYMBOL = Object.freeze([
  'battle', 'birth', 'death', 'ruling', 'scene', 'catastrophe', 'founding',
]);

/* --------------------------------------------------------------- helpers */

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export function isStatus(v) { return has(STATUS, v); }
export function isDevTier(v) { return DEV_TIER_ORDER.includes(v); }
export function isCastTier(v) { return CAST_TIER_ORDER.includes(v); }
export function isRelationMode(v) { return has(RELATION_META, v); }
export function isPageType(v) { return PAGE_TYPE_ORDER.includes(v); }

/** Crypto-random id with a readable type prefix. */
export function newId(prefix = 'id') {
  const bytes = new Uint8Array(9);
  (globalThis.crypto || {}).getRandomValues
    ? globalThis.crypto.getRandomValues(bytes)
    : bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
  let s = '';
  for (const b of bytes) s += b.toString(36).padStart(2, '0');
  return `${prefix}_${s.slice(0, 14)}`;
}

const now = () => new Date().toISOString();

/* ---------------------------------------------------------------- blocks */

/* A page body is an ordered list of blocks so that status can be carried at
 * block level — a CANON page with three OPEN paragraphs inside it. */
export function makeBlock(patch = {}) {
  return {
    id: patch.id || newId('blk'),
    kind: patch.kind || 'paragraph', // paragraph | heading | quote | table | speech | direction
    text: patch.text ?? '',
    level: patch.level ?? null,      // headings only
    speaker: patch.speaker ?? null,  // dialogue only
    status: isStatus(patch.status) ? patch.status : null, // null = inherit page
    anchor: patch.anchor ?? null,    // slug used by [[Page#Heading]]
    ruling: patch.ruling ?? null,    // set when an OPEN block is resolved
    resolvedAt: patch.resolvedAt ?? null,
  };
}

/* ----------------------------------------------------------------- pages */

export function makePage(patch = {}) {
  const type = isPageType(patch.type) ? patch.type : PAGE_TYPE.CHARACTER;
  const ts = now();
  const page = {
    id: patch.id || newId('pg'),
    type,
    title: patch.title ?? 'Untitled',
    aliases: [...(patch.aliases || [])],
    status: isStatus(patch.status) ? patch.status : STATUS.PROPOSED,
    devTier: isDevTier(patch.devTier) ? patch.devTier : DEV_TIER.CANON,
    summary: patch.summary ?? '',
    blocks: (patch.blocks || []).map(makeBlock),
    coverImageId: patch.coverImageId ?? null,
    links: [...(patch.links || [])],   // outgoing, recomputed from body on save
    tags: [...(patch.tags || [])],
    galleryImageIds: [...(patch.galleryImageIds || [])],
    createdAt: patch.createdAt || ts,
    updatedAt: patch.updatedAt || ts,
  };

  if (type === PAGE_TYPE.CHARACTER) {
    page.castTier = isCastTier(patch.castTier) ? patch.castTier : CAST_TIER.RECORD;
    page.themeMusic = patch.themeMusic
      ? { title: patch.themeMusic.title ?? '', url: patch.themeMusic.url ?? '' }
      : { title: '', url: '' };
    page.portraitImageId = patch.portraitImageId ?? null;
  }

  if (type === PAGE_TYPE.REGION) {
    page.era = patch.era ?? '';
    page.rulingFaction = patch.rulingFaction ?? '';
    // Map pin coordinates are fractions (0..1) of the map image, so the pin
    // survives the map being re-uploaded at a different resolution.
    page.mapPin = patch.mapPin ? { mapImageId: patch.mapPin.mapImageId, x: patch.mapPin.x, y: patch.mapPin.y } : null;
  }

  if (type === PAGE_TYPE.EVENT) {
    // Canonical years only. Display conversion happens at render time.
    page.yearStart = patch.yearStart ?? null;
    page.yearEnd = patch.yearEnd ?? null;   // null = a point, not a span
    page.approximate = !!patch.approximate;
    page.eraId = patch.eraId ?? null;
    page.symbol = EVENT_SYMBOL.includes(patch.symbol) ? patch.symbol : 'scene';
    page.linkedPageIds = [...(patch.linkedPageIds || [])];
  }

  if (type === PAGE_TYPE.SCENE) {
    page.yearStart = patch.yearStart ?? null;
    page.charactersPresent = [...(patch.charactersPresent || [])];
    page.notes = patch.notes ?? '';
    page.finished = !!patch.finished;
  }

  return page;
}

export function makeRelationship(patch = {}) {
  if (!isRelationMode(patch.mode)) {
    throw new Error(`Unknown relationship mode: ${patch.mode}. The vocabulary is closed.`);
  }
  return {
    id: patch.id || newId('rel'),
    fromId: patch.fromId,
    toId: patch.toId,
    mode: patch.mode,
    note: patch.note ?? '',
    // 'directed' reads from → to; 'mutual' reads either way.
    direction: patch.direction === 'mutual' ? 'mutual' : 'directed',
    createdAt: patch.createdAt || now(),
  };
}

export function makeEra(patch = {}) {
  return {
    id: patch.id || newId('era'),
    name: patch.name ?? 'Untitled era',
    colour: patch.colour ?? '#4a6f6a',
    startYear: patch.startYear ?? 0,   // canonical
    endYear: patch.endYear ?? 0,       // canonical
    createdAt: patch.createdAt || now(),
  };
}

export function makeReckoning(patch = {}) {
  return {
    id: patch.id || newId('rkn'),
    name: patch.name ?? 'Untitled reckoning',
    abbr: patch.abbr ?? '',
    // Canonical year of this reckoning's year zero.
    offsetFromCanonicalZero: patch.offsetFromCanonicalZero ?? 0,
    createdAt: patch.createdAt || now(),
  };
}

export function makeImage(patch = {}) {
  return {
    id: patch.id || newId('img'),
    blob: patch.blob ?? null,
    mime: patch.mime ?? (patch.blob && patch.blob.type) ?? 'image/png',
    filename: patch.filename ?? '',
    caption: patch.caption ?? '',
    tags: [...(patch.tags || [])],
    linkedPageIds: [...(patch.linkedPageIds || [])],
    width: patch.width ?? null,
    height: patch.height ?? null,
    createdAt: patch.createdAt || now(),
  };
}
