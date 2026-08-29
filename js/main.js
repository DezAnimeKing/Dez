/* Stage 1 UI: the cover, and a console over the data layer.
 *
 * This console is scaffolding. It exists so the author can see the storage
 * working, take a backup, and run the checks. Stage 2 replaces it with
 * Contents; the modules underneath it stay.
 */

import * as store from './store.js';
import * as db from './db.js';
import * as backup from './backup.js';
import * as selftest from './selftest.js';
import { STATUS_ORDER, PAGE_TYPE_ORDER, STATUS, DEV_TIER, CAST_TIER } from './schema.js';
import { formatYear } from './reckoning.js';

const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/* ------------------------------------------------------- saved indicator */

const SAVER_TEXT = { idle: 'Ready', saving: 'Saving…', saved: 'Saved', error: 'Not saved' };
let savedTimer;

store.on('save-state', (state) => {
  const saver = $('saver');
  saver.dataset.state = state;
  $('saver-text').textContent = SAVER_TEXT[state] || state;
  clearTimeout(savedTimer);
  if (state === 'saved') savedTimer = setTimeout(() => { saver.dataset.state = 'idle'; $('saver-text').textContent = SAVER_TEXT.idle; }, 2200);
});

store.on('error', (err) => note($('backup-line'), `Storage error: ${err.message}`, true));

function note(target, message, bad = false) {
  target.textContent = message;
  target.style.color = bad ? 'var(--oxblood-soft)' : '';
}

/* ------------------------------------------------------------------ cover */

async function paintCover() {
  const world = store.getWorld();
  $('cover-title').textContent = world.title || 'The Compendium';
  $('cover-subtitle').textContent = world.subtitle || '';
  document.title = world.title || 'The Compendium';
  if (world.coverImageId) {
    const url = await store.imageUrl(world.coverImageId);
    if (url) $('cover').style.backgroundImage = `url("${url}")`;
  } else {
    $('cover').style.backgroundImage = '';
  }
}

$('open-book').addEventListener('click', () => {
  $('cover').hidden = true;
  $('book').hidden = false;
  $('world-title').focus({ preventScroll: true });
});

$('cover-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const previous = store.getWorld().coverImageId;
  const image = await store.addImage(file, { caption: 'Cover', tags: ['cover'] });
  await store.updateWorld({ coverImageId: image.id });
  if (previous) await store.remove('images', previous, { label: 'Replace cover image' }).catch(() => {});
  store.releaseImageUrls();
  await paintCover();
  await paintAll();
  event.target.value = '';
});

/* ----------------------------------------------------------------- fields */

function bindField(inputId, key) {
  const input = $(inputId);
  input.addEventListener('input', () => {
    clearTimeout(input._timer);
    document.getElementById('saver').dataset.state = 'saving';
    $('saver-text').textContent = SAVER_TEXT.saving;
    input._timer = setTimeout(async () => {
      await store.updateWorld({ [key]: input.value });
      paintCover();
    }, store.AUTOSAVE_MS);
  });
}

bindField('world-title', 'title');
bindField('world-subtitle', 'subtitle');

/* ----------------------------------------------------------------- counts */

const SECTION_LABEL = {
  character: 'Characters', region: 'Regions', event: 'Timeline',
  scene: 'Story', system: 'Systems', image: 'Image pages',
};

async function paintCounts() {
  const stats = await store.stats();
  const grid = $('counts');
  grid.replaceChildren();

  for (const type of PAGE_TYPE_ORDER) {
    const section = stats.sections[type];
    const cell = el('div', 'count');
    cell.append(el('div', 'count__n', String(section.total)), el('div', 'count__label', SECTION_LABEL[type]));
    const row = el('div', 'row');
    row.style.marginTop = 'var(--gap-2)';
    for (const status of STATUS_ORDER) {
      if (!section[status]) continue;
      row.append(el('span', `pill pill--${status}`, `${status.slice(0, 3)} ${section[status]}`));
    }
    if (section.sealed) row.append(el('span', 'pill faint', `sealed ${section.sealed}`));
    cell.append(row);
    grid.append(cell);
  }

  for (const [label, value] of [
    ['Images', stats.images], ['Relationships', stats.relationships],
    ['Eras', stats.eras], ['Reckonings', stats.reckonings],
    ['Open questions', stats.openQuestions], ['Principals', `${stats.principals}/8`],
  ]) {
    const cell = el('div', 'count');
    cell.append(el('div', 'count__n', String(value)), el('div', 'count__label', label));
    grid.append(cell);
  }

  const usage = await db.estimateUsage();
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  $('storage-line').textContent = usage
    ? `${(usage.usage / 1024 / 1024).toFixed(1)} MB used of ~${(usage.quota / 1024 / 1024).toFixed(0)} MB · storage ${persisted ? 'persistent' : 'best-effort'}`
    : 'Storage: IndexedDB';

  const banner = $('backup-banner');
  const last = stats.lastBackupAt ? new Date(stats.lastBackupAt) : null;
  const stale = !last || (Date.now() - last.getTime()) > 7 * 24 * 3600 * 1000;
  banner.hidden = !(stats.pages > 0 && stale);
  $('backup-banner-text').textContent = last
    ? `Last backup ${last.toLocaleDateString()}. A week is long enough.`
    : 'This world has never been exported. Take a backup and keep it somewhere else.';
}

/* ------------------------------------------------------------ reckonings */

async function paintReckonings() {
  const reckonings = await store.listReckonings();
  const table = $('reckoning-table');
  table.replaceChildren();

  const head = el('tr');
  head.append(el('th', null, 'Canonical'));
  for (const r of reckonings) head.append(el('th', null, `${r.name} (${r.abbr || '—'})`));
  table.append(head);

  const samples = [
    { yearStart: 0 }, { yearStart: 50 },
    { yearStart: 450, yearEnd: 616 }, { yearStart: 666 },
    { yearStart: 700, approximate: true },
  ];
  for (const sample of samples) {
    const row = el('tr');
    row.append(el('td', 'faint', formatYear(sample, { offsetFromCanonicalZero: 0 }, { showAbbr: false })));
    for (const r of reckonings) row.append(el('td', null, formatYear(sample, r)));
    table.append(row);
  }
}

/* ----------------------------------------------------------------- trash */

async function paintTrash() {
  const entries = (await store.listTrash()).sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
  const list = $('trash-list');
  list.replaceChildren();
  $('trash-count').textContent = entries.length ? `${entries.length}` : 'empty';

  if (!entries.length) {
    list.append(el('li', 'faint', 'Nothing deleted. Deletions land here first, never in oblivion.'));
  }

  for (const entry of entries) {
    const li = el('li');
    const left = el('div');
    left.append(el('div', null, entry.title));
    left.append(el('div', 'faint mono', `${entry.kind} · ${new Date(entry.deletedAt).toLocaleString()}`));
    const actions = el('div', 'row');
    const restore = el('button', 'btn btn--quiet', 'Restore');
    restore.addEventListener('click', async () => { await store.restore(entry.id); await paintAll(); });
    const purge = el('button', 'btn btn--quiet', 'Purge');
    purge.style.color = 'var(--oxblood-soft)';
    purge.addEventListener('click', async () => {
      if (!confirm(`Destroy "${entry.title}" for good? This one cannot be undone.`)) return;
      await store.purgeTrash(entry.id);
      await paintAll();
    });
    actions.append(restore, purge);
    li.append(left, actions);
    list.append(li);
  }

  const undoBtn = $('undo-btn');
  undoBtn.disabled = !store.canUndo();
  undoBtn.textContent = store.canUndo() ? `Undo: ${store.peekUndo().label}` : 'Undo';
}

/* --------------------------------------------------------------- actions */

const actions = {
  async export() {
    await store.flush();
    // Stamp the backup time *before* serialising, so a world restored from
    // this file knows when it was last backed up rather than claiming never.
    await store.markBackedUp();
    const json = await backup.exportJSON();
    backup.downloadText(json, backup.backupFilename(store.getWorld().title));
    note($('backup-line'), `Exported ${(json.length / 1024).toFixed(0)} KB at ${new Date().toLocaleTimeString()}.`);
    await paintAll();
  },

  async seed() {
    await seedSample();
    note($('backup-line'), 'Sample records added. Delete them, restore them, export them — then erase the world.');
    await paintAll();
  },

  async undo() {
    const label = await store.undo();
    note($('backup-line'), label ? `Undone: ${label}` : 'Nothing to undo.');
    await paintAll();
  },

  async reset() {
    if (!confirm('Erase every page, image and relationship in this world? Export first if you are unsure.')) return;
    await store.reset();
    store.releaseImageUrls();
    await paintCover();
    await paintAll();
    note($('backup-line'), 'World erased.');
  },

  async selftest(button) {
    const log = $('test-log');
    log.hidden = false;
    log.replaceChildren();
    button.disabled = true;
    const line = (text, cls) => log.append(el('div', cls, text));
    line(`Running ${selftest.testCount} checks…`, 'log__note');

    try {
      const { passed, failed } = await selftest.run({
        onResult: (r) => {
          if (r.ok) line(`  ✓ ${r.name}`, 'log__ok');
          else line(`  ✗ ${r.name}\n      ${r.error}`, 'log__fail');
        },
      });
      line(failed ? `${failed} failed, ${passed} passed.` : `All ${passed} checks passed. Your world was restored unchanged.`,
        failed ? 'log__fail' : 'log__ok');
    } catch (err) {
      line(`Test run crashed: ${err.message}`, 'log__fail');
    } finally {
      button.disabled = false;
      await paintAll();
      await paintCover();
    }
  },
};

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (button) actions[button.dataset.action]?.(button);
});

$('import-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!confirm(`Replace this world with the contents of "${file.name}"? Everything currently stored is overwritten.`)) return;
  try {
    const counts = await backup.importJSON(await backup.readFileAsText(file), { mode: 'replace' });
    await store.init();
    store.releaseImageUrls();
    await paintCover();
    await paintAll();
    note($('backup-line'), `Imported ${counts.pages} pages, ${counts.images} images, ${counts.relationships} relationships.`);
  } catch (err) {
    note($('backup-line'), err.message, true);
  }
});

/* --------------------------------------------------------- sample records */

async function seedSample() {
  const vessel = await store.createPage({
    type: 'character', title: 'The First Vessel', status: STATUS.CANON,
    castTier: CAST_TIER.PRINCIPAL, aliases: ['She Who Was Kept'],
    summary: 'Sample record. Delete it whenever you like.',
    themeMusic: { title: 'Unassigned', url: '' },
    blocks: [
      { kind: 'paragraph', text: 'A settled paragraph.', status: STATUS.CANON },
      { kind: 'paragraph', text: 'Did she carry the memory, or only the wound?', status: STATUS.OPEN },
    ],
  });
  const second = await store.createPage({
    type: 'character', title: 'The Second Vessel', status: STATUS.PROPOSED, castTier: CAST_TIER.INSTRUMENT,
  });
  await store.createRelationship({ fromId: vessel.id, toId: second.id, mode: 'transmigration', note: 'Same soul. No memory carried.' });
  await store.createPage({ type: 'region', title: 'The Drowned Quarter', status: STATUS.PROPOSED, era: 'Late Fall', rulingFaction: 'None' });
  await store.createPage({ type: 'event', title: 'The Unhoming', status: STATUS.CANON, yearStart: 50, symbol: 'catastrophe' });
  await store.createPage({ type: 'event', title: 'The Long Silence', status: STATUS.SOURCE, yearStart: 450, yearEnd: 616, symbol: 'ruling' });
  await store.createPage({ type: 'event', title: 'A remembered burning', status: STATUS.PROPOSED, yearStart: 666, approximate: true, symbol: 'battle' });
  await store.createEra({ name: 'The Long Silence', colour: '#4d8b83', startYear: 450, endYear: 616 });
}

/* ------------------------------------------------------------------ boot */

async function paintAll() {
  await Promise.all([paintCounts(), paintReckonings(), paintTrash()]);
}

async function boot() {
  $('test-count').textContent = String(selftest.testCount);
  try {
    const world = await store.init();
    $('world-title').value = world.title;
    $('world-subtitle').value = world.subtitle;
    await paintCover();
    await paintAll();
  } catch (err) {
    document.body.prepend(Object.assign(el('div', 'banner'), { textContent: `The Compendium could not open its storage: ${err.message}` }));
  }
}

// Nothing queued may be lost to a closed tab.
addEventListener('pagehide', () => { store.flush(); });
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.flush(); });

boot();
