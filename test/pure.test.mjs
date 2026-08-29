/* Node-runnable tests for the parts of the data layer that do not need a
 * browser. The storage tests live in js/selftest.js and run in the app,
 * against the real IndexedDB.
 *
 *   node --test test/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  makePage, makeBlock, makeRelationship, makeReckoning, makeImage,
  STATUS, DEV_TIER, CAST_TIER, RELATION_MODES, CONTINUITY_MODES, newId,
} from '../js/schema.js';
import {
  DEFAULT_RECKONINGS, toDisplayYear, toCanonicalYear, convertYear,
  formatYear, parseYearInput, withinRange,
} from '../js/reckoning.js';
import { serialise, deserialise, ImportError, backupFilename } from '../js/backup.js';

const FALL = DEFAULT_RECKONINGS[0];
const UNHOMING = DEFAULT_RECKONINGS[1];

/* ------------------------------------------------------------ reckonings */

test('Fall 666 is Unhoming 616', () => {
  assert.equal(toDisplayYear(666, FALL), 666);
  assert.equal(toDisplayYear(666, UNHOMING), 616);
  assert.equal(toCanonicalYear(616, UNHOMING), 666);
  assert.equal(convertYear(666, FALL, UNHOMING), 616);
  assert.equal(convertYear(616, UNHOMING, FALL), 666);
});

test('the Unhoming falls at Fall +50 and is its own year zero', () => {
  assert.equal(UNHOMING.offsetFromCanonicalZero, 50);
  assert.equal(toDisplayYear(50, UNHOMING), 0);
});

test('years round-trip through arbitrary reckonings', () => {
  const reckonings = [FALL, UNHOMING, makeReckoning({ offsetFromCanonicalZero: -317 }), makeReckoning({ offsetFromCanonicalZero: 9001 })];
  for (const year of [-1000, -1, 0, 50, 666, 123456]) {
    for (const r of reckonings) {
      assert.equal(toCanonicalYear(toDisplayYear(year, r), r), year);
    }
  }
});

test('a third reckoning is data, not code', () => {
  const kindling = makeReckoning({ name: 'Kindling Reckoning', abbr: 'KR', offsetFromCanonicalZero: -120 });
  assert.equal(convertYear(666, FALL, kindling), 786);
  assert.equal(formatYear({ yearStart: 666 }, kindling), '786 KR');
});

test('dates parse from any reckoning, including spans and approximations', () => {
  assert.deepEqual(parseYearInput('616', UNHOMING), { yearStart: 666, yearEnd: null, approximate: false });
  assert.deepEqual(parseYearInput('c. 450', FALL), { yearStart: 450, yearEnd: null, approximate: true });
  assert.deepEqual(parseYearInput('circa 450', FALL), { yearStart: 450, yearEnd: null, approximate: true });
  assert.deepEqual(parseYearInput('450–616', FALL), { yearStart: 450, yearEnd: 616, approximate: false });
  assert.deepEqual(parseYearInput('450-616', FALL), { yearStart: 450, yearEnd: 616, approximate: false });
  assert.deepEqual(parseYearInput('~450 to 616', UNHOMING), { yearStart: 500, yearEnd: 666, approximate: true });
  assert.deepEqual(parseYearInput('-30', FALL), { yearStart: -30, yearEnd: null, approximate: false });
  assert.deepEqual(parseYearInput('1,200', FALL), { yearStart: 1200, yearEnd: null, approximate: false });
  assert.equal(parseYearInput('', FALL), null);
  assert.equal(parseYearInput('sometime later', FALL), null, 'prose is not a year');
  assert.equal(parseYearInput('October', FALL), null, 'a word containing "to" is not a span');
  assert.equal(parseYearInput('the 666th', FALL), null, 'a half-parsed date is worse than none');
});

test('what the author typed is what the author reads back', () => {
  for (const input of ['666', 'c. 450', '450–616']) {
    const parsed = parseYearInput(input, UNHOMING);
    assert.equal(formatYear(parsed, UNHOMING, { showAbbr: false }), input.replace('c. ', 'c. '));
  }
});

test('dates render as points, spans and approximations', () => {
  assert.equal(formatYear({ yearStart: 666 }, FALL), '666 FR');
  assert.equal(formatYear({ yearStart: 666 }, UNHOMING), '616 UR');
  assert.equal(formatYear({ yearStart: 450, yearEnd: 616 }, FALL), '450–616 FR');
  assert.equal(formatYear({ yearStart: 450, yearEnd: 450 }, FALL), '450 FR');
  assert.equal(formatYear({ yearStart: 700, approximate: true }, FALL), 'c. 700 FR');
  assert.equal(formatYear({ yearStart: -30 }, FALL), '30 before FR');
  assert.equal(formatYear({ yearStart: null }, FALL), 'undated');
});

test('range isolation keeps overlapping spans', () => {
  assert.ok(withinRange({ yearStart: 450, yearEnd: 616 }, 600, 700));
  assert.ok(withinRange({ yearStart: 450, yearEnd: 616 }, 400, 500));
  assert.ok(!withinRange({ yearStart: 450, yearEnd: 616 }, 700, 800));
  assert.ok(!withinRange({ yearStart: 450 }, null, 400));
  assert.ok(!withinRange({ yearStart: null }, null, null));
});

/* ---------------------------------------------------------------- schema */

test('the continuity vocabulary is exactly the seven, plus the ordinary relations', () => {
  assert.deepEqual([...CONTINUITY_MODES].sort(), [
    'composite', 'fragment_carriage', 'hereditary_signature', 'office',
    'persistence', 'signature_recurrence', 'transmigration',
  ]);
  assert.equal(RELATION_MODES.length, 14);
  assert.throws(() => makeRelationship({ fromId: 'a', toId: 'b', mode: 'reincarnation' }), /closed/);
  assert.throws(() => makeRelationship({ fromId: 'a', toId: 'b', mode: '' }), /closed/);
  assert.equal(makeRelationship({ fromId: 'a', toId: 'b', mode: 'office' }).mode, 'office');
});

test('pages default to the safe end of every vocabulary', () => {
  const page = makePage({ type: 'character', title: 'Nameless' });
  assert.equal(page.status, STATUS.PROPOSED, 'nothing becomes canon by accident');
  assert.equal(page.devTier, DEV_TIER.CANON);
  assert.equal(page.castTier, CAST_TIER.RECORD, 'nobody becomes a Principal by accident');
  assert.deepEqual(page.themeMusic, { title: '', url: '' }, 'theme music is a first-class field');
  assert.ok(page.id.startsWith('pg_'));
  assert.equal(page.createdAt, page.updatedAt);
});

test('an unknown status or tier falls back rather than being stored', () => {
  const page = makePage({ type: 'region', status: 'MAYBE', devTier: 'secret', title: 'Elsewhere' });
  assert.equal(page.status, STATUS.PROPOSED);
  assert.equal(page.devTier, DEV_TIER.CANON);
});

test('blocks carry their own status, independent of the page', () => {
  const page = makePage({
    type: 'system', title: 'Cosmology', status: STATUS.CANON,
    blocks: [{ kind: 'paragraph', text: 'Settled.' }, { kind: 'paragraph', text: 'Unsettled.', status: STATUS.OPEN }],
  });
  assert.equal(page.status, STATUS.CANON);
  assert.equal(page.blocks[0].status, null, 'null means "inherit the page"');
  assert.equal(page.blocks[1].status, STATUS.OPEN);
});

test('events store one year, never two that can drift', () => {
  const event = makePage({ type: 'event', title: 'The Unhoming', yearStart: 50 });
  assert.equal(event.yearStart, 50);
  assert.equal(event.yearEnd, null);
  assert.ok(!('year' in event), 'no second year field');
  assert.ok(!('reckoningId' in event), 'events are not tied to the reckoning they were typed in');
});

test('map pins are stored as fractions so a re-uploaded map keeps them', () => {
  const region = makePage({ type: 'region', title: 'The Drowned Quarter', mapPin: { mapImageId: 'img_1', x: 0.42, y: 0.87 } });
  assert.deepEqual(region.mapPin, { mapImageId: 'img_1', x: 0.42, y: 0.87 });
});

test('ids are unique', () => {
  const ids = new Set();
  for (let i = 0; i < 5000; i++) ids.add(newId('pg'));
  assert.equal(ids.size, 5000);
});

/* ---------------------------------------------------------------- backup */

const snapshotWith = (overrides = {}) => ({
  meta: [{ key: 'world', title: 'A World' }],
  pages: [], relationships: [], eras: [], reckonings: [], images: [], trash: [],
  ...overrides,
});

const bytes = async (blob) => [...new Uint8Array(await blob.arrayBuffer())];

test('an export carries images as blobs and restores them byte-identical', async () => {
  const source = new Blob([new Uint8Array([137, 80, 78, 71, 0, 13, 255, 42])], { type: 'image/png' });
  const snapshot = snapshotWith({
    pages: [makePage({ type: 'character', title: 'Round Trip' })],
    images: [makeImage({ blob: source, caption: 'a pixel' })],
  });

  const payload = JSON.parse(JSON.stringify(await serialise(snapshot)));
  assert.equal(payload.format, 'compendium-export');
  assert.equal(payload.counts.images, 1);
  assert.equal(typeof payload.data.images[0].blob.data, 'string', 'the blob travels as base64 in the file only');

  const restored = deserialise(payload);
  assert.ok(restored.images[0].blob instanceof Blob);
  assert.deepEqual(await bytes(restored.images[0].blob), await bytes(source));
  assert.equal(restored.images[0].blob.type, 'image/png');
  assert.deepEqual(restored.pages[0], snapshot.pages[0]);
});

test('nested blobs survive too — an image sitting in the trash', async () => {
  const source = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
  const snapshot = snapshotWith({
    trash: [{ id: 'trash_1', kind: 'images', originalId: 'img_1', deletedAt: 'now', payload: makeImage({ blob: source }) }],
  });
  const restored = deserialise(JSON.parse(JSON.stringify(await serialise(snapshot))));
  assert.deepEqual(await bytes(restored.trash[0].payload.blob), [1, 2, 3]);
});

test('a truncated export is refused rather than half-restored', async () => {
  const snapshot = snapshotWith({ pages: [makePage({ title: 'One' }), makePage({ title: 'Two' })] });
  const payload = await serialise(snapshot);
  payload.data.pages = payload.data.pages.slice(0, 1);
  assert.throws(() => deserialise(payload), ImportError);
});

test('a foreign or future file is refused', async () => {
  assert.throws(() => deserialise({ format: 'notion-export', schemaVersion: 1, data: {} }), ImportError);
  assert.throws(() => deserialise({ format: 'compendium-export', schemaVersion: 99, data: {} }), ImportError);
  assert.throws(() => deserialise({ format: 'compendium-export', schemaVersion: 1 }), ImportError);
  assert.throws(() => deserialise(null), ImportError);
  assert.throws(() => deserialise({ format: 'compendium-export', schemaVersion: 1, data: { pages: 'nope' } }), ImportError);
});

test('an empty world exports and imports cleanly', async () => {
  const restored = deserialise(await serialise(snapshotWith()));
  assert.deepEqual(restored.pages, []);
  assert.deepEqual(restored.meta, [{ key: 'world', title: 'A World' }]);
});

test('backup filenames are datestamped and filesystem-safe', () => {
  const name = backupFilename('The Fall & The Unhoming');
  assert.match(name, /^the-fall-the-unhoming-backup-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/);
  assert.match(backupFilename(''), /^compendium-backup-/);
});
