/* Linking: tokenising, resolution, backlinks, broken links, suggestions and
 * the `[[` completion mechanics. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePage } from '../js/schema.js';
import {
  tokenise, linksIn, buildIndex, resolve, resolveLink, hasAnchor,
  buildBacklinks, brokenLinks, groupBroken, suggest, headingsOf, activeLinkAt,
  completeLink, previewOf,
} from '../js/links.js';

const page = (patch) => makePage(patch);

const world = () => {
  const vessel = page({
    id: 'pg_vessel', type: 'character', title: 'The First Vessel',
    aliases: ['She Who Was Kept'], summary: 'Kept in a jar of river water.',
    blocks: [
      { kind: 'heading', text: 'What she remembers', anchor: 'what-she-remembers' },
      { kind: 'paragraph', text: 'She met [[The Drowned Quarter]] in a dream.' },
    ],
    updatedAt: '2026-01-02T00:00:00.000Z',
  });
  const quarter = page({
    id: 'pg_quarter', type: 'region', title: 'The Drowned Quarter',
    blocks: [
      { kind: 'paragraph', text: 'It sank in a night.' },
      { kind: 'heading', text: 'Ruling', anchor: 'ruling' },
      { kind: 'paragraph', text: 'Held by nobody since [[The First Vessel#What she remembers]].' },
    ],
    updatedAt: '2026-01-03T00:00:00.000Z',
  });
  const sealed = page({ id: 'pg_sealed', type: 'character', title: 'The Sealed One', devTier: 'sealed' });
  return [vessel, quarter, sealed];
};

/* -------------------------------------------------------------- tokenising */

test('prose splits into text and link tokens', () => {
  const tokens = tokenise('She met [[The Drowned Quarter]] once.');
  assert.deepEqual(tokens.map((t) => t.type), ['text', 'link', 'text']);
  assert.equal(tokens[0].text, 'She met ');
  assert.equal(tokens[1].target, 'The Drowned Quarter');
  assert.equal(tokens[1].anchor, null);
  assert.equal(tokens[1].label, 'The Drowned Quarter');
  assert.equal(tokens[2].text, ' once.');
});

test('a heading link carries its anchor and reads as both parts', () => {
  const [link] = tokenise('[[The First Vessel#What she remembers]]').filter((t) => t.type === 'link');
  assert.equal(link.target, 'The First Vessel');
  assert.equal(link.anchor, 'What she remembers');
  assert.equal(link.label, 'The First Vessel › What she remembers');
});

test('a piped link reads as the words the author chose', () => {
  const [link] = tokenise('[[The First Vessel|her]]').filter((t) => t.type === 'link');
  assert.equal(link.target, 'The First Vessel');
  assert.equal(link.label, 'her');
});

test('text without links stays one token, and empty brackets are not a link', () => {
  assert.deepEqual(tokenise('Nothing here.').map((t) => t.type), ['text']);
  assert.equal(linksIn(page({ blocks: [{ kind: 'paragraph', text: '[[]] and [[ ]]' }] })).length, 0);
});

test('a page reports the links in its body and summary, once each', () => {
  const p = page({
    summary: 'See [[Alpha]].',
    blocks: [
      { kind: 'paragraph', text: 'Again [[Alpha]] and [[Beta#Gamma]].' },
      { kind: 'paragraph', text: 'And [[Alpha]] a third time.' },
    ],
  });
  assert.deepEqual(linksIn(p), [
    { target: 'Alpha', anchor: null },
    { target: 'Beta', anchor: 'Gamma' },
  ]);
});

/* --------------------------------------------------------------- resolving */

test('links resolve by title or alias, ignoring case', () => {
  const index = buildIndex(world());
  assert.equal(resolve(index, 'The Drowned Quarter')?.id, 'pg_quarter');
  assert.equal(resolve(index, 'the drowned quarter')?.id, 'pg_quarter');
  assert.equal(resolve(index, 'She Who Was Kept')?.id, 'pg_vessel', 'an alias resolves to its page');
  assert.equal(resolve(index, 'Nobody At All'), null);
});

test('a sealed page still resolves when linked deliberately', () => {
  assert.equal(resolve(buildIndex(world()), 'The Sealed One')?.id, 'pg_sealed');
});

test('a title claimed twice is reported rather than silently picked', () => {
  const index = buildIndex([
    page({ id: 'pg_a', title: 'The Vessel' }),
    page({ id: 'pg_b', title: 'The Vessel' }),
  ]);
  assert.equal(resolve(index, 'The Vessel').id, 'pg_a', 'the first claim holds');
  assert.equal(index.collisions.length, 1);
});

test('a title beats an alias belonging to another page', () => {
  const index = buildIndex([
    page({ id: 'pg_alias', title: 'Something Else', aliases: ['The Vessel'] }),
    page({ id: 'pg_real', title: 'The Vessel' }),
  ]);
  assert.equal(resolve(index, 'The Vessel').id, 'pg_real');
});

test('an anchor must actually exist on the target', () => {
  const [vessel] = world();
  assert.ok(hasAnchor(vessel, 'What she remembers'));
  assert.ok(hasAnchor(vessel, 'what-she-remembers'), 'the slug form matches too');
  assert.ok(!hasAnchor(vessel, 'What she forgot'));
  assert.ok(hasAnchor(vessel, null), 'a link with no anchor needs none');
});

test('a link knows which way it is broken', () => {
  const index = buildIndex(world());
  assert.equal(resolveLink(index, { target: 'The First Vessel', anchor: null }).broken, null);
  assert.equal(resolveLink(index, { target: 'Nowhere', anchor: null }).broken, 'page');
  assert.equal(resolveLink(index, { target: 'The First Vessel', anchor: 'Missing' }).broken, 'anchor');
});

/* --------------------------------------------------------------- backlinks */

test('backlinks are collected from every page that points here', () => {
  const pages = world();
  const backlinks = buildBacklinks(pages);
  assert.deepEqual(backlinks.get('pg_quarter').map((b) => b.from.id), ['pg_vessel']);
  const toVessel = backlinks.get('pg_vessel');
  assert.deepEqual(toVessel.map((b) => [b.from.id, b.anchor]), [['pg_quarter', 'What she remembers']]);
});

test('a page linking to itself is not its own backlink', () => {
  const pages = [page({ id: 'pg_self', title: 'Self', blocks: [{ kind: 'paragraph', text: 'See [[Self]].' }] })];
  assert.equal(buildBacklinks(pages).get('pg_self'), undefined);
});

test('renaming a page breaks the links that named it', () => {
  const pages = world();
  assert.equal(brokenLinks(pages).length, 0);
  pages[1].title = 'The Quarter, Drowned';
  const broken = brokenLinks(pages);
  assert.equal(broken.length, 1);
  assert.equal(broken[0].from.id, 'pg_vessel');
  assert.equal(broken[0].target, 'The Drowned Quarter');
  assert.equal(broken[0].broken, 'page');
});

test('a heading removed from a target breaks the links that aimed at it', () => {
  const pages = world();
  pages[0].blocks = pages[0].blocks.filter((b) => b.kind !== 'heading');
  const broken = brokenLinks(pages);
  assert.equal(broken.length, 1);
  assert.equal(broken[0].broken, 'anchor');
  assert.equal(broken[0].anchor, 'What she remembers');
});

/* ------------------------------------------------------------ suggestions */

test('suggestions rank exact, then prefix, then middle matches', () => {
  const pages = [
    page({ id: 'p1', title: 'Vessel' }),
    page({ id: 'p2', title: 'Vessel of the Fall' }),
    page({ id: 'p3', title: 'The First Vessel' }),
  ];
  assert.deepEqual(suggest(pages, 'vessel').map((s) => s.page.id), ['p1', 'p2', 'p3']);
});

test('suggestions match aliases and say so', () => {
  const hit = suggest(world(), 'she who')[0];
  assert.equal(hit.page.id, 'pg_vessel');
  assert.equal(hit.isAlias, true);
  assert.equal(hit.name, 'She Who Was Kept');
});

test('sealed pages are never suggested, and the page itself is not offered', () => {
  const pages = world();
  assert.ok(!suggest(pages, 'sealed').length, 'a sealed page stays out of link suggestions');
  assert.ok(suggest(pages, 'sealed', { revealSealed: true }).length, 'unless sealed content is revealed');
  assert.ok(!suggest(pages, 'first', { excludeId: 'pg_vessel' }).length, 'a page is not suggested to itself');
});

test('an empty query offers recent pages rather than nothing', () => {
  const suggestions = suggest(world(), '');
  assert.deepEqual(suggestions.map((s) => s.page.id), ['pg_quarter', 'pg_vessel'],
    'most recently edited first, and never the sealed page');
});

test('headings are offered for the part after the hash', () => {
  const [vessel, quarter] = world();
  assert.deepEqual(headingsOf(quarter).map((h) => h.anchor), ['ruling']);
  assert.deepEqual(headingsOf(vessel, 'remember').map((h) => h.text), ['What she remembers']);
  assert.equal(headingsOf(vessel, 'nothing').length, 0);
});

/* ------------------------------------------------------ typing mechanics */

test('the caret inside [[ opens the autocomplete, and outside it does not', () => {
  assert.equal(activeLinkAt('She met [[dro', 13).query, 'dro');
  assert.equal(activeLinkAt('She met [[Done]] and more', 25), null, 'a finished link does not reopen');
  assert.equal(activeLinkAt('No brackets here', 16), null);
  assert.equal(activeLinkAt('[[across\na line', 15), null, 'a link does not span lines');
});

test('a hash in the fragment switches the autocomplete to headings', () => {
  const active = activeLinkAt('see [[The First Vessel#what', 27);
  assert.equal(active.query, 'The First Vessel');
  assert.equal(active.anchorQuery, 'what');
});

test('completing writes a finished link and puts the caret after it', () => {
  const active = activeLinkAt('She met [[dro', 13);
  const result = completeLink('She met [[dro', active, { title: 'The Drowned Quarter' });
  assert.equal(result.text, 'She met [[The Drowned Quarter]]');
  assert.equal(result.caret, result.text.length);
});

test('completing with an anchor keeps the heading, and does not double the brackets', () => {
  const text = 'See [[The First Vessel#what]]';
  const active = activeLinkAt(text, 27);
  const result = completeLink(text, active, { title: 'The First Vessel', anchor: 'What she remembers' });
  assert.equal(result.text, 'See [[The First Vessel#What she remembers]]');
});

test('completing mid-sentence keeps what follows', () => {
  const text = 'She met [[dro in a dream.';
  const result = completeLink(text, activeLinkAt(text, 13), { title: 'The Drowned Quarter' });
  assert.equal(result.text, 'She met [[The Drowned Quarter]] in a dream.');
});

/* --------------------------------------------------------------- previews */

test('a preview shows the summary, or the first prose when there is none', () => {
  const [vessel, quarter] = world();
  assert.equal(previewOf(vessel), 'Kept in a jar of river water.');
  assert.equal(previewOf(quarter), 'It sank in a night.');
});

test('a preview of an anchored link starts at that heading', () => {
  const [, quarter] = world();
  assert.match(previewOf(quarter, { anchor: 'Ruling' }), /^Held by nobody/);
});

test('a long preview is cut, not dumped whole', () => {
  const long = page({ blocks: [{ kind: 'paragraph', text: 'word '.repeat(200) }] });
  const preview = previewOf(long);
  assert.ok(preview.length <= 260);
  assert.ok(preview.endsWith('…'));
});

test('an unclosed or nested [[ resolves to the inner, complete link', () => {
  const links = tokenise('[[The Third [[The Drowned Quarter]]Vessel]]').filter((t) => t.type === 'link');
  assert.deepEqual(links.map((l) => l.target), ['The Drowned Quarter'],
    'the complete link wins rather than swallowing the surrounding text');
});

test('broken links are grouped per page and missing name', () => {
  const from = page({ id: 'pg_from', title: 'The First Vessel' });
  const grouped = groupBroken([
    { from, target: 'The Drowned Quarter', anchor: null, broken: 'page' },
    { from, target: 'The Drowned Quarter', anchor: 'Ruling', broken: 'page' },
    { from, target: 'Cosmology', anchor: 'Modes', broken: 'anchor' },
    { from, target: 'Cosmology', anchor: 'Other', broken: 'anchor' },
  ]);
  assert.equal(grouped.length, 3, 'one row per missing name, but a row per missing heading');
  assert.equal(grouped[0].count, 2, 'and it says how many links that one fix mends');
});
