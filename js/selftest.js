/* Data-layer self-test.
 *
 * Stage 1's whole claim is "this will not lose your work". That claim needs
 * to be checkable by the author, on the author's own device and browser, at
 * any time — so the test suite ships inside the app.
 *
 * It takes a full export before it starts and restores it in a finally
 * block, so running it against a real world is safe.
 */

import * as store from './store.js';
import * as db from './db.js';
import * as backup from './backup.js';
import { makePage, makeRelationship, STATUS, DEV_TIER, CAST_TIER } from './schema.js';
import { parseBatch } from './markdown.js';
import {
  DEFAULT_RECKONINGS, toDisplayYear, toCanonicalYear, convertYear,
  formatYear, parseYearInput, withinRange,
} from './reckoning.js';

const FALL = DEFAULT_RECKONINGS[0];
const UNHOMING = DEFAULT_RECKONINGS[1];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}\n      expected ${e}\n      actual   ${a}`);
}

async function assertThrows(fn, message) {
  try { await fn(); } catch { return; }
  throw new Error(message);
}

const bytesOf = async (blob) => [...new Uint8Array(await blob.arrayBuffer())];

/* ------------------------------------------------------------- the tests */

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('reckonings convert both ways without a second stored year', () => {
  assertEqual(toDisplayYear(666, FALL), 666, 'Fall 666 should display as 666 in Fall');
  assertEqual(toDisplayYear(666, UNHOMING), 616, 'Fall 666 should display as 616 in Unhoming');
  assertEqual(toCanonicalYear(616, UNHOMING), 666, 'Unhoming 616 should store as canonical 666');
  assertEqual(convertYear(666, FALL, UNHOMING), 616, 'Fall 666 should relabel to Unhoming 616');
  assertEqual(convertYear(616, UNHOMING, FALL), 666, 'Unhoming 616 should relabel to Fall 666');
  assertEqual(toDisplayYear(50, UNHOMING), 0, 'The Unhoming itself is Unhoming year 0');
  assertEqual(convertYear(-30, FALL, UNHOMING), -80, 'Years before the origin convert too');
});

test('a year survives a round trip through any reckoning', () => {
  for (const year of [-100, 0, 1, 50, 449, 666, 10_000]) {
    for (const rkn of [FALL, UNHOMING, { offsetFromCanonicalZero: -317 }]) {
      assertEqual(toCanonicalYear(toDisplayYear(year, rkn), rkn), year,
        `canonical ${year} should survive a round trip through offset ${rkn.offsetFromCanonicalZero}`);
    }
  }
});

test('the author can type dates in any reckoning', () => {
  assertEqual(parseYearInput('616', UNHOMING), { yearStart: 666, yearEnd: null, approximate: false },
    'Unhoming 616 typed in should store as canonical 666');
  assertEqual(parseYearInput('c. 450', FALL), { yearStart: 450, yearEnd: null, approximate: true },
    '"c. 450" should be approximate');
  assertEqual(parseYearInput('450–616', FALL), { yearStart: 450, yearEnd: 616, approximate: false },
    'An en-dash span should parse as a span');
  assertEqual(parseYearInput('~450 to 616', UNHOMING), { yearStart: 500, yearEnd: 666, approximate: true },
    'An approximate span typed in Unhoming should store canonically');
  assertEqual(parseYearInput('not a year', FALL), null, 'Nonsense should parse to null, not to 0');
});

test('dates render as points, spans and approximations', () => {
  assertEqual(formatYear({ yearStart: 666 }, FALL), '666 FR', 'A point should render bare');
  assertEqual(formatYear({ yearStart: 666 }, UNHOMING), '616 UR', 'The same point relabels in Unhoming');
  assertEqual(formatYear({ yearStart: 450, yearEnd: 616 }, FALL), '450–616 FR', 'A span should render with an en-dash');
  assertEqual(formatYear({ yearStart: 450, approximate: true }, FALL), 'c. 450 FR', 'Approximate dates keep their "c."');
  assertEqual(formatYear({ yearStart: null }, FALL), 'undated', 'An undated event should say so');
});

test('range isolation includes events that overlap the window', () => {
  assert(withinRange({ yearStart: 450, yearEnd: 616 }, 600, 700), 'A span overlapping the window is inside it');
  assert(!withinRange({ yearStart: 450, yearEnd: 616 }, 700, 800), 'A span ending before the window is outside it');
  assert(withinRange({ yearStart: 666 }, null, null), 'An open-ended window includes everything dated');
});

test('the relationship vocabulary is closed', async () => {
  await assertThrows(() => makeRelationship({ fromId: 'a', toId: 'b', mode: 'reincarnation' }),
    'An invented mode should be rejected');
  const rel = makeRelationship({ fromId: 'a', toId: 'b', mode: 'fragment_carriage' });
  assertEqual(rel.mode, 'fragment_carriage', 'A listed mode should be accepted');
});

test('a page written is a page read back', async () => {
  const written = await store.createPage({
    type: 'character', title: 'Self-test subject', status: STATUS.PROPOSED,
    castTier: CAST_TIER.PRINCIPAL, aliases: ['The Understudy'],
    themeMusic: { title: 'A borrowed song', url: '' },
    blocks: [{ kind: 'paragraph', text: 'Body text.', status: STATUS.OPEN }],
  });
  const read = await store.getPage(written.id);
  assertEqual(read, written, 'The stored page should match what was written, field for field');
  assertEqual(read.blocks[0].status, STATUS.OPEN, 'Block-level status should persist independently of the page');
  await store.remove('pages', written.id);
  await store.purgeTrash((await store.listTrash()).find((t) => t.originalId === written.id).id);
});

test('editing stamps updatedAt and keeps identity', async () => {
  const page = await store.createPage({ type: 'region', title: 'Somewhere', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' });
  const edited = await store.updatePage(page.id, { title: 'Somewhere else', id: 'hijacked', type: 'character' });
  assertEqual(edited.id, page.id, 'A patch must not change a page id');
  assertEqual(edited.type, 'region', 'A patch must not change a page type');
  assertEqual(edited.createdAt, page.createdAt, 'createdAt should not move');
  assert(edited.updatedAt > page.updatedAt, 'updatedAt should advance on edit');
  await store.remove('pages', page.id);
});

test('autosave coalesces keystrokes into one write', async () => {
  const page = await store.createPage({ type: 'system', title: 'Draft' });
  store.savePageSoon(page.id, { summary: 'a' }, 30);
  store.savePageSoon(page.id, { summary: 'ab' }, 30);
  const saved = await store.savePageSoon(page.id, { summary: 'abc' }, 30);
  assertEqual(saved.summary, 'abc', 'The last keystroke should win');
  assertEqual((await store.getPage(page.id)).summary, 'abc', 'And it should be what is on disk');
  await store.remove('pages', page.id);
});

test('flush() writes queued edits immediately', async () => {
  const page = await store.createPage({ type: 'system', title: 'Unflushed' });
  store.savePageSoon(page.id, { summary: 'pending' }, 5000);
  await store.flush();
  assertEqual((await store.getPage(page.id)).summary, 'pending', 'A queued edit must survive a flush, not a timer');
  await store.remove('pages', page.id);
});

test('deletion goes to the trash and comes back', async () => {
  const page = await store.createPage({ type: 'character', title: 'Doomed' });
  await store.remove('pages', page.id);
  assertEqual(await store.getPage(page.id), undefined, 'A deleted page should leave the pages store');
  const entry = (await store.listTrash()).find((t) => t.originalId === page.id);
  assert(entry, 'A deleted page should be in the trash');
  const restored = await store.restore(entry.id);
  assertEqual(restored.title, 'Doomed', 'The restored page should be the same page');
  assertEqual((await store.listTrash()).find((t) => t.id === entry.id), undefined, 'Restoring should empty that trash entry');
  await store.remove('pages', page.id);
});

test('undo reverses a deletion', async () => {
  const page = await store.createPage({ type: 'character', title: 'Undo me' });
  await store.remove('pages', page.id);
  assert(store.canUndo(), 'A deletion should push an undo entry');
  await store.undo();
  assertEqual((await store.getPage(page.id))?.title, 'Undo me', 'Undo should put the page back');
  await store.remove('pages', page.id);
});

test('images are stored as blobs and come back byte-identical', async () => {
  const source = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 42])], { type: 'image/png' });
  const image = await store.addImage(source, { caption: 'self-test pixel' });
  const read = await store.getImage(image.id);
  assert(read.blob instanceof Blob, 'An image must be stored as a Blob, not as base64 text');
  assertEqual(await bytesOf(read.blob), await bytesOf(source), 'The bytes must survive storage exactly');
  assertEqual(read.blob.type, 'image/png', 'The mime type must survive storage');
  await store.remove('images', image.id);
});

test('export and re-import restore the world exactly, images included', async () => {
  await store.reset();
  const hero = await store.createPage({ type: 'character', title: 'Round Trip', status: STATUS.CANON, castTier: CAST_TIER.PRINCIPAL });
  const ghost = await store.createPage({ type: 'character', title: 'Second Vessel', devTier: DEV_TIER.SEALED });
  await store.createRelationship({ fromId: hero.id, toId: ghost.id, mode: 'transmigration', note: 'no memory carried' });
  await store.createEra({ name: 'The Long Silence', startYear: 450, endYear: 666 });
  const pixels = new Blob([new Uint8Array([1, 2, 3, 4, 250, 251, 252])], { type: 'image/png' });
  const image = await store.addImage(pixels, { caption: 'exported pixel' });
  await store.createPage({ type: 'event', title: 'The Unhoming', yearStart: 50, symbol: 'catastrophe' });

  const payload = JSON.parse(await backup.exportJSON());
  assertEqual(payload.format, 'compendium-export', 'The export should declare its format');
  assertEqual(payload.counts.pages, 3, 'The export should count what it carries');

  await store.reset();
  assertEqual((await store.listPages()).length, 0, 'The reset world should be empty before import');

  await backup.importSnapshot(payload, { mode: 'replace' });
  const pages = await store.listPages();
  assertEqual(pages.length, 3, 'Every page should come back');
  assertEqual(pages.find((p) => p.id === hero.id)?.title, 'Round Trip', 'Pages come back with their ids intact');
  assertEqual(pages.find((p) => p.id === ghost.id)?.devTier, 'sealed', 'The sealed tier survives a round trip');
  assertEqual((await store.listRelationships())[0].mode, 'transmigration', 'Typed relationships survive a round trip');
  assertEqual((await store.listEras()).length, 1, 'Eras survive a round trip');
  assertEqual((await store.listReckonings()).length, 2, 'Both reckonings survive a round trip');

  const restoredImage = await store.getImage(image.id);
  assert(restoredImage?.blob instanceof Blob, 'An imported image must be a Blob again, not an envelope');
  assertEqual(await bytesOf(restoredImage.blob), await bytesOf(pixels), 'Image bytes must survive export and import');
  assertEqual(restoredImage.caption, 'exported pixel', 'Captions survive too');
});

test('a truncated or foreign backup is refused, not half-restored', async () => {
  const page = await store.createPage({ type: 'character', title: 'Still here' });
  const payload = JSON.parse(await backup.exportJSON());

  await assertThrows(() => backup.importSnapshot({ format: 'notion-export', schemaVersion: 1, data: {} }),
    'A foreign file should be refused');
  await assertThrows(() => backup.importSnapshot({ ...payload, schemaVersion: 999 }),
    'An export from a newer schema should be refused');

  const truncated = structuredClone(payload);
  truncated.data.pages = truncated.data.pages.slice(0, -1);
  await assertThrows(() => backup.importSnapshot(truncated),
    'An export whose counts do not match its contents should be refused');

  assertEqual((await store.getPage(page.id))?.title, 'Still here',
    'A refused import must leave the existing world untouched');
  await store.remove('pages', page.id);
});

test('a fresh world seeds both reckonings and nothing else', async () => {
  await store.reset();
  const reckonings = await store.listReckonings();
  assertEqual(reckonings.map((r) => r.name).sort(), ['Fall Reckoning', 'Unhoming Reckoning'], 'Both reckonings should be seeded');
  assertEqual(reckonings.find((r) => r.name === 'Unhoming Reckoning').offsetFromCanonicalZero, 50,
    'The Unhoming falls at Fall +50');
  assertEqual((await store.listPages()).length, 0, 'A fresh world has no pages');
});

test('a third reckoning needs no code change', async () => {
  const added = await store.createReckoning({ name: 'Kindling Reckoning', abbr: 'KR', offsetFromCanonicalZero: -120 });
  assertEqual(convertYear(666, FALL, added), 786, 'A newly defined reckoning relabels existing years immediately');
  await store.remove('reckonings', added.id);
});

test('sealed pages are walled off until the setting reveals them', async () => {
  await store.reset();
  await store.createPage({ type: 'character', title: 'In the world' });
  await store.createPage({ type: 'character', title: 'Quarantined', devTier: DEV_TIER.SEALED });

  const visible = await store.queryPages({ type: 'character' });
  assertEqual(visible.map((p) => p.title), ['In the world'], 'A sealed page should not appear in a list');
  assertEqual((await store.queryPages({ type: 'character', query: 'quarantined' })).length, 0,
    'A sealed page should not be findable by search');
  assertEqual((await store.queryPages({ type: 'character', tier: DEV_TIER.SEALED })).map((p) => p.title), ['Quarantined'],
    'Asking for the sealed tier explicitly should still show it');

  assertEqual((await store.recent()).map((p) => p.title), ['In the world'],
    'A sealed page should not surface in "recently edited" either');

  await store.updateWorld({ revealSealed: true });
  assertEqual((await store.queryPages({ type: 'character' })).length, 2, 'Revealing sealed content should show it everywhere');
  assertEqual((await store.recent()).length, 2, 'Including in "recently edited"');
  await store.updateWorld({ revealSealed: false });
});

test('search reaches into block text, aliases and summaries', async () => {
  await store.reset();
  await store.createPage({
    type: 'character', title: 'The First Vessel', aliases: ['She Who Was Kept'],
    summary: 'Kept in a jar of river water.',
    blocks: [{ kind: 'paragraph', text: 'The oxblood thread runs through her.' }],
  });
  const hit = async (q) => (await store.queryPages({ query: q })).length;
  assertEqual(await hit('understudy'), 0, 'A word that appears nowhere should find nothing');
  assertEqual(await hit('she who was kept'), 1, 'An alias should be searchable');
  assertEqual(await hit('river water'), 1, 'A summary should be searchable');
  assertEqual(await hit('oxblood thread'), 1, 'Block text should be searchable');
  assertEqual(await hit('OXBLOOD'), 1, 'Search should ignore case');
});

test('a markdown batch lands as real pages with real statuses', async () => {
  await store.reset();
  const parsed = parseBatch([{
    filename: 'cosmology.md',
    text: '# Cosmology [CANON]\n\nSettled.\n\n## Open ground [OPEN]\n\nWhat breaks a Composite?',
  }], { type: 'system', existingTitles: await store.existingTitles() });

  const created = await store.importPages(parsed.map((r) => r.page));
  assertEqual(created.length, 1, 'One file should become one page');
  const stored = await store.getPage(created[0].id);
  assertEqual(stored.title, 'Cosmology', 'The H1 becomes the title');
  assertEqual(stored.status, 'CANON', 'The tag on the H1 rules the page');
  assertEqual(stored.blocks.at(-1).status, 'OPEN', 'The tagged section rules its blocks');
  assert(!stored.blocks.some((b) => b.text.includes('[')), 'Status tags are stripped from the prose');
  assertEqual(stored.blocks.filter((b) => b.status === 'OPEN').length, 2,
    'Both the section heading and its prose carry the section\'s status');
  assertEqual((await store.stats()).openQuestions, 1,
    'But only the prose counts as an open question — a heading is a section marker, not a ruling');

  await store.updatePage(created[0].id, { devTier: DEV_TIER.SEALED });
  const sealedStats = await store.stats();
  assertEqual(sealedStats.openQuestions, 0, 'Sealing a page withdraws its open questions from the count');
  assertEqual(sealedStats.sections.system.total, 0, 'And withdraws it from its section total');
  assertEqual(sealedStats.sections.system.sealed, 1, 'While still being counted as sealed');
});

/* ------------------------------------------------------------- the runner */

export async function run({ onResult } = {}) {
  await store.flush().catch(() => {});
  const safety = await backup.exportSnapshot({ note: 'automatic safety copy taken before the self-test' });
  const results = [];

  try {
    for (const { name, fn } of tests) {
      try {
        await fn();
        const result = { name, ok: true };
        results.push(result);
        onResult?.(result);
      } catch (err) {
        const result = { name, ok: false, error: err.message };
        results.push(result);
        onResult?.(result);
      }
    }
  } finally {
    // Whatever happened above, the author's world goes back exactly as it was.
    await backup.importSnapshot(safety, { mode: 'replace' });
    await store.init();
  }

  return { results, passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
}

export const testCount = tests.length;
