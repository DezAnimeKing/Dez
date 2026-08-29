/* Markdown import.
 *
 * The author has a library of .md files from prior work. This turns one of
 * them into a page: headings become blocks that can be linked to and given
 * their own canon status, and the [CANON] / [PROPOSED] / [OPEN] / [SOURCE]
 * tags already scattered through that prose become real status tags.
 *
 * Rules, so the behaviour is predictable rather than clever:
 *   · A tag anywhere in a block sets that block's status and is stripped
 *     from the text.
 *   · A tag on a heading sets the status for that heading's whole section,
 *     until a heading at the same or a higher level starts a new one. A
 *     block carrying its own tag still wins inside that section.
 *   · A tag on the H1, or a `status:` in front matter, sets the page's
 *     status. Blocks that merely inherit it are stored as null — "inherit"
 *     — so re-ruling the page re-rules them with it.
 *   · Nothing is dropped. Anything unrecognised stays as paragraph text.
 */

import {
  STATUS, DEV_TIER, CAST_TIER, PAGE_TYPE, isStatus, isDevTier, isCastTier, isPageType,
} from './schema.js';

const STATUS_TAG = /(?:\*\*|__|\*|_)?\[\s*(CANON|PROPOSED|OPEN|SOURCE)\s*\](?:\*\*|__|\*|_)?/gi;

/** Pull the first status tag out of a line, and strip every tag from it. */
function extractStatus(text) {
  STATUS_TAG.lastIndex = 0;
  const found = STATUS_TAG.exec(text);
  if (!found) return { text, status: null };
  return {
    status: found[1].toUpperCase(),
    text: text.replace(STATUS_TAG, '').replace(/\s{2,}/g, ' ').trim(),
  };
}

export function slugify(text) {
  return String(text).toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/** [[Page]] and [[Page#Heading]], collected now so stage 3 can resolve them. */
export function extractWikiLinks(text) {
  const links = [];
  for (const match of text.matchAll(/\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|[^\]]+)?\]\]/g)) {
    links.push({ target: match[1].trim(), anchor: match[2]?.trim() || null });
  }
  return links;
}

/* ---------------------------------------------------------- front matter */

const LIST_KEYS = new Set(['aliases', 'tags']);

function parseFrontMatter(lines) {
  if (lines[0]?.trim() !== '---') return { meta: {}, rest: lines };
  const close = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (close === -1) return { meta: {}, rest: lines };

  const meta = {};
  let currentKey = null;
  for (const line of lines.slice(1, close)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && currentKey) {
      (meta[currentKey] ||= []).push(item[1].trim().replace(/^["']|["']$/g, ''));
      continue;
    }
    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;
    const key = pair[1].toLowerCase();
    const value = pair[2].trim().replace(/^["']|["']$/g, '');
    currentKey = key;
    if (!value) { meta[key] = LIST_KEYS.has(key) ? [] : ''; continue; }
    const bracketed = /^\[(.*)\]$/.exec(value);
    if (bracketed) meta[key] = bracketed[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    else if (LIST_KEYS.has(key)) meta[key] = value.split(',').map((s) => s.trim()).filter(Boolean);
    else meta[key] = value;
  }
  return { meta, rest: lines.slice(close + 1) };
}

const asList = (value) => (Array.isArray(value) ? value : String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean));

/* ---------------------------------------------------------------- blocks */

/** Group lines into raw blocks, respecting code fences and tables. */
function* rawBlocks(lines) {
  let buffer = [];
  let kind = null;
  let fence = null;

  const flush = function* () {
    if (buffer.length) yield { kind: kind || 'paragraph', lines: buffer };
    buffer = [];
    kind = null;
  };

  for (const line of lines) {
    if (fence) {
      buffer.push(line);
      if (line.trim().startsWith(fence)) { yield* flush(); fence = null; }
      continue;
    }

    const fenceStart = /^\s*(```|~~~)/.exec(line);
    if (fenceStart) {
      yield* flush();
      fence = fenceStart[1];
      kind = 'code';
      buffer.push(line);
      continue;
    }

    if (!line.trim()) { yield* flush(); continue; }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      yield* flush();
      yield { kind: 'heading', level: heading[1].length, lines: [heading[2]] };
      continue;
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { yield* flush(); continue; } // rule

    const lineKind =
      /^\s*>/.test(line) ? 'quote'
      : /^\s*\|/.test(line) ? 'table'
      : /^\s*(?:[-*+]|\d+[.)])\s+/.test(line) ? 'list'
      : 'paragraph';

    if (kind && kind !== lineKind) yield* flush();
    kind = lineKind;
    buffer.push(line);
  }
  yield* flush();
}

const cleanQuote = (text) => text.replace(/^\s*>\s?/gm, '').trim();

/* ----------------------------------------------------------------- pages */

const prettifyFilename = (filename) => String(filename)
  .replace(/\.[^.]+$/, '')
  .replace(/[_-]+/g, ' ')
  .replace(/\s{2,}/g, ' ')
  .trim()
  .replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Markdown text → a page-shaped object ready for makePage(), plus the
 * counts and warnings the import preview shows before anything is written.
 */
export function parseMarkdown(text, {
  filename = '',
  type = PAGE_TYPE.SYSTEM,
  // Both default to on. They are options because they are judgement calls
  // about the author's own conventions, not facts about markdown.
  frontMatter = true,      // honour a YAML block: title, type, status, tier…
  sectionTags = true,      // a tag on a heading rules its whole section
} = {}) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const parsed = parseFrontMatter(lines);
  const meta = frontMatter ? parsed.meta : {};
  const rest = frontMatter ? parsed.rest : lines;
  const warnings = [];
  if (!frontMatter && Object.keys(parsed.meta).length) {
    warnings.push('Front matter left as body text, as asked.');
  }

  const page = {
    type: isPageType(meta.type) ? meta.type : type,
    title: '',
    aliases: asList(meta.aliases),
    tags: asList(meta.tags),
    status: isStatus(String(meta.status || '').toUpperCase()) ? String(meta.status).toUpperCase() : null,
    devTier: null,
    summary: typeof meta.summary === 'string' ? meta.summary : '',
    blocks: [],
    links: [],
  };

  const tier = String(meta.tier || meta.devtier || '').toLowerCase();
  if (tier) {
    if (isDevTier(tier)) page.devTier = tier;
    else warnings.push(`Unknown tier "${tier}" — filed as Canon.`);
  }
  if (meta.type && !isPageType(meta.type)) warnings.push(`Unknown type "${meta.type}" — imported as ${page.type}.`);

  if (page.type === PAGE_TYPE.CHARACTER) {
    const cast = String(meta.cast || meta.casttier || '').toLowerCase();
    if (cast && isCastTier(cast)) page.castTier = cast;
    else if (cast) warnings.push(`Unknown cast tier "${cast}" — filed as Record.`);
    const music = meta.music || meta.theme || meta.thememusic;
    if (music) page.themeMusic = { title: String(music), url: String(meta.musicurl || meta.themeurl || '') };
  }
  if (page.type === PAGE_TYPE.REGION) {
    if (meta.era) page.era = String(meta.era);
    if (meta.faction || meta.rulingfaction) page.rulingFaction = String(meta.faction || meta.rulingfaction);
  }

  // Section status: set by a tagged heading, cleared by the next heading at
  // the same or a shallower level.
  let sectionStatus = null;
  let sectionLevel = 0;
  let titleTaken = false;
  let statusTags = 0;

  for (const raw of rawBlocks(rest)) {
    if (raw.kind === 'heading') {
      const { text: headingText, status } = extractStatus(raw.lines[0].trim());
      if (status) statusTags++;

      // The first H1 is the page's title, not a block in its body.
      if (!titleTaken && raw.level === 1 && !meta.title) {
        titleTaken = true;
        page.title = headingText;
        if (status) page.status ||= status;
        sectionStatus = null;
        sectionLevel = 0;
        page.links.push(...extractWikiLinks(headingText));
        continue;
      }

      if (sectionTags && (raw.level <= sectionLevel || status)) {
        sectionStatus = status;
        sectionLevel = status ? raw.level : 0;
      }
      page.blocks.push({
        kind: 'heading', level: raw.level, text: headingText,
        anchor: slugify(headingText), status: status || null,
      });
      page.links.push(...extractWikiLinks(headingText));
      continue;
    }

    const joined = raw.kind === 'quote' ? cleanQuote(raw.lines.join('\n')) : raw.lines.join('\n').trim();
    if (!joined) continue;
    const { text: body, status } = extractStatus(joined);
    if (status) statusTags++;
    if (!body) continue;

    page.blocks.push({
      kind: raw.kind,
      text: body,
      // Only record a status that differs from what the block would inherit.
      status: status || (sectionStatus && sectionStatus !== page.status ? sectionStatus : null),
    });
    page.links.push(...extractWikiLinks(body));
  }

  page.title = String(meta.title || page.title || prettifyFilename(filename) || 'Untitled').trim();
  page.status ||= STATUS.PROPOSED;
  page.devTier ||= DEV_TIER.CANON;
  if (!page.summary) {
    const firstProse = page.blocks.find((b) => b.kind === 'paragraph');
    if (firstProse) {
      const flat = firstProse.text.replace(/\s+/g, ' ');
      page.summary = flat.length > 240 ? `${flat.slice(0, 237)}…` : flat;
    }
  }
  if (!page.blocks.length) warnings.push('No body content found — the page will be empty.');

  // Deduplicate links, keeping the anchor-bearing form.
  const seen = new Set();
  page.links = page.links.filter((link) => {
    const key = `${link.target}#${link.anchor || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    page,
    stats: {
      blocks: page.blocks.length,
      headings: page.blocks.filter((b) => b.kind === 'heading').length,
      statusTags,
      links: page.links.length,
      words: page.blocks.reduce((n, b) => n + (b.text.trim() ? b.text.trim().split(/\s+/).length : 0), 0),
      byStatus: page.blocks.reduce((acc, b) => {
        if (b.status) acc[b.status] = (acc[b.status] || 0) + 1;
        return acc;
      }, {}),
    },
    warnings,
  };
}

/** Parse a batch, flagging titles that collide with each other or with existing pages. */
export function parseBatch(files, { type, existingTitles = [], frontMatter = true, sectionTags = true } = {}) {
  const taken = new Set(existingTitles.map((t) => t.toLowerCase()));
  return files.map(({ filename, text }) => {
    const result = parseMarkdown(text, { filename, type, frontMatter, sectionTags });
    const key = result.page.title.toLowerCase();
    result.filename = filename;
    result.duplicate = taken.has(key);
    taken.add(key);
    return result;
  });
}
