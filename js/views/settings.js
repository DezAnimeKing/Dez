/* Settings: the cover, backups, markdown import, sealed content, the trash,
 * and the data-layer checks. Everything that is about the book rather than
 * in it. */

import * as store from '../store.js';
import * as db from '../db.js';
import * as backup from '../backup.js';
import * as selftest from '../selftest.js';
import { parseBatch } from '../markdown.js';
import { groupBroken } from '../links.js';
import {
  el, button, field, select, statusPill, confirmSheet, openSheet, toast, plural, relativeTime,
} from '../ui.js';
import { go, path } from '../router.js';
import { PAGE_TYPE_ORDER, STATUS_ORDER } from '../schema.js';

const titleCase = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

export async function render(container) {
  const world = store.getWorld();
  const rerender = () => render(container);

  // Built whole, then swapped in one go: a second render that arrives
  // mid-build replaces this one rather than appending alongside it.
  const page = document.createDocumentFragment();
  const header = el('header', 'book__header');
  header.append(el('p', 'book__eyebrow', 'Settings'));
  header.append(el('h1', null, 'The book itself'));
  page.append(header);

  page.append(await worldSection(world, rerender));
  page.append(backupSection(rerender));
  page.append(markdownSection(rerender));
  page.append(sealedSection(world, rerender));
  page.append(await brokenLinksSection(rerender));
  page.append(await trashSection(rerender));
  page.append(selftestSection(rerender));
  page.append(dangerSection(rerender));

  // Settings re-renders itself after edits; if the author has navigated on
  // in the meantime, this render is stale and must not overwrite the view.
  if (path() !== '/settings') return;
  container.replaceChildren(page);
}

const section = (title, ...children) => {
  const node = el('section', 'section');
  node.append(el('h2', 'section__heading', title));
  node.append(...children);
  return node;
};

/* ----------------------------------------------------------------- world */

async function worldSection(world, rerender) {
  const sheet = el('div', 'sheet stack');
  sheet.append(field('Title', world.title, (value) => store.updateWorld({ title: value })));
  sheet.append(field('Subtitle', world.subtitle, (value) => store.updateWorld({ subtitle: value })));

  const cover = el('div', 'row');
  const label = el('label', 'btn');
  label.textContent = world.coverImageId ? 'Replace cover image' : 'Add a cover image';
  const input = el('input', 'visually-hidden');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const previous = world.coverImageId;
    const image = await store.addImage(file, { caption: 'Cover', tags: ['cover'] });
    await store.updateWorld({ coverImageId: image.id });
    if (previous) await store.remove('images', previous, { label: 'Replace cover image' }).catch(() => {});
    store.releaseImageUrls();
    dispatchEvent(new CustomEvent('cover-changed'));
    rerender();
  });
  label.append(input);
  cover.append(label);
  if (world.coverImageId) {
    cover.append(button('Remove cover', {
      className: 'btn btn--quiet',
      onClick: async () => {
        await store.updateWorld({ coverImageId: null });
        dispatchEvent(new CustomEvent('cover-changed'));
        rerender();
      },
    }));
  }
  sheet.append(cover);

  const usage = await db.estimateUsage();
  if (usage) {
    sheet.append(el('p', 'faint mono',
      `${(usage.usage / 1024 / 1024).toFixed(1)} MB used of about ${(usage.quota / 1024 / 1024).toFixed(0)} MB`));
  }
  return section('The world', sheet);
}

/* ---------------------------------------------------------------- backup */

function backupSection(rerender) {
  const sheet = el('div', 'sheet stack');
  const line = el('p', 'faint mono');
  const world = store.getWorld();
  line.textContent = world.lastBackupAt
    ? `Last exported ${relativeTime(world.lastBackupAt)}.`
    : 'This world has never been exported.';

  const row = el('div', 'row');
  row.append(button('Export everything', {
    className: 'btn btn--primary',
    onClick: async () => {
      await store.flush();
      await store.markBackedUp();
      const json = await backup.exportJSON();
      backup.downloadText(json, backup.backupFilename(store.getWorld().title));
      toast(`Exported ${(json.length / 1024).toFixed(0)} KB. Keep it somewhere that is not this device.`);
      rerender();
    },
  }));

  const importLabel = el('label', 'btn');
  importLabel.textContent = 'Restore from a backup…';
  const importInput = el('input', 'visually-hidden');
  importInput.type = 'file';
  importInput.accept = 'application/json,.json';
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    const sure = await confirmSheet(`Restore from "${file.name}"?`, {
      confirmLabel: 'Replace this world',
      hint: 'Everything currently stored is overwritten by the contents of that file.',
    });
    if (!sure) return;
    try {
      const counts = await backup.importJSON(await backup.readFileAsText(file), { mode: 'replace' });
      await store.init();
      store.releaseImageUrls();
      dispatchEvent(new CustomEvent('cover-changed'));
      toast(`Restored ${plural(counts.pages, 'page')} and ${plural(counts.images, 'image')}.`);
      rerender();
    } catch (err) {
      toast(err.message, { duration: 12000 });
    }
  });
  importLabel.append(importInput);
  row.append(importLabel);

  sheet.append(line, row);
  return section('Backup', sheet);
}

/* ------------------------------------------------------- markdown import */

function markdownSection(rerender) {
  const sheet = el('div', 'sheet stack');
  sheet.append(el('p', 'dim', 'Bring in existing .md files. Headings become blocks you can link to, '
    + 'and [CANON] / [PROPOSED] / [OPEN] / [SOURCE] tags in the text become real status tags.'));

  const options = { type: 'system', frontMatter: true, sectionTags: true };
  sheet.append(select('Import these files as', PAGE_TYPE_ORDER.filter((t) => t !== 'image').map((t) => [t, `${titleCase(t)} pages`]),
    options.type, (value) => { options.type = value; }));

  sheet.append(checkbox('Read YAML front matter', options.frontMatter,
    'A --- block at the top sets title, type, status, tier, cast, aliases and tags. Off: it stays as body text.',
    (on) => { options.frontMatter = on; }));

  sheet.append(checkbox('A tag on a heading rules its section', options.sectionTags,
    'On: [OPEN] on a heading marks every block under it until the next heading at that level. Off: it marks only the heading.',
    (on) => { options.sectionTags = on; }));

  const preview = el('div', 'stack');

  const label = el('label', 'btn btn--primary');
  label.textContent = 'Choose .md files…';
  const input = el('input', 'visually-hidden');
  input.type = 'file';
  input.accept = '.md,.markdown,.txt,text/markdown,text/plain';
  input.multiple = true;
  input.addEventListener('change', async () => {
    const files = [...(input.files || [])];
    input.value = '';
    if (!files.length) return;
    const texts = await Promise.all(files.map(async (file) => ({ filename: file.name, text: await file.text() })));
    const results = parseBatch(texts, { ...options, existingTitles: await store.existingTitles() });
    showPreview(results, preview, rerender);
  });
  label.append(input);
  sheet.append(label, preview);

  return section('Import markdown', sheet);
}

/** A labelled checkbox with the explanation the author needs to choose. */
function checkbox(label, value, hint, onChange) {
  const wrap = el('div', 'stack option');
  const toggle = el('label', 'row toggle');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = value;
  box.addEventListener('change', () => onChange(box.checked));
  toggle.append(box, el('span', null, label));
  wrap.append(toggle);
  if (hint) wrap.append(el('p', 'faint option__hint', hint));
  return wrap;
}

function showPreview(results, container, rerender) {
  container.replaceChildren();
  let skipDuplicates = results.some((r) => r.duplicate);

  const totals = results.reduce((acc, r) => {
    acc.blocks += r.stats.blocks;
    acc.tags += r.stats.statusTags;
    acc.links += r.stats.links;
    acc.words += r.stats.words;
    return acc;
  }, { blocks: 0, tags: 0, links: 0, words: 0 });

  const summary = el('div', 'banner');
  summary.append(el('p', null, `${plural(results.length, 'file')}, ${plural(totals.blocks, 'block')}, `
    + `${plural(totals.tags, 'status tag')} found, ${plural(totals.links, 'link')}, `
    + `${totals.words.toLocaleString()} words.`));
  summary.append(el('p', 'faint', 'Nothing is written until you confirm.'));
  container.append(summary);

  const list = el('ul', 'list list--entries');
  for (const result of results) {
    const li = el('li');
    const left = el('div');
    left.append(el('div', 'entry__title', result.page.title));
    const bits = [result.page.type, `${result.stats.blocks} blocks`, `${result.stats.words} words`];
    if (result.stats.links) bits.push(`${result.stats.links} links`);
    left.append(el('div', 'faint mono', `${result.filename} → ${bits.join(' · ')}`));

    const chips = el('div', 'row');
    chips.append(statusPill(result.page.status));
    for (const status of STATUS_ORDER) {
      const n = result.stats.byStatus[status];
      if (n) chips.append(el('span', `pill pill--${status}`, `${n} blocks`));
    }
    if (result.duplicate) chips.append(el('span', 'pill pill--OPEN', 'Title already used'));
    left.append(chips);

    for (const warning of result.warnings) left.append(el('p', 'faint', `⚠ ${warning}`));
    li.append(left);
    list.append(li);
  }
  container.append(list);

  const duplicates = results.filter((r) => r.duplicate);
  if (duplicates.length) {
    const toggle = el('label', 'row toggle');
    const checkbox = el('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.addEventListener('change', () => { skipDuplicates = checkbox.checked; });
    toggle.append(checkbox, el('span', null, `Skip the ${plural(duplicates.length, 'file')} whose title is already used`));
    container.append(toggle);
  }

  const actions = el('div', 'row');
  actions.append(button('Import', {
    className: 'btn btn--primary',
    onClick: async () => {
      const chosen = results.filter((r) => !(skipDuplicates && r.duplicate));
      if (!chosen.length) { toast('Nothing left to import once duplicates are skipped.'); return; }
      const created = await store.importPages(chosen.map((r) => r.page));
      container.replaceChildren();
      toast(`Imported ${plural(created.length, 'page')}.`, {
        actionLabel: 'Undo',
        duration: 12000,
        onAction: async () => {
          for (const page of created) await store.remove('pages', page.id, { label: 'Markdown import' }).catch(() => {});
          toast(`Removed ${plural(created.length, 'page')} to the trash.`);
          rerender();
        },
      });
      rerender();
    },
  }));
  actions.append(button('Cancel', { className: 'btn btn--quiet', onClick: () => container.replaceChildren() }));
  container.append(actions);
}

/* ---------------------------------------------------------------- sealed */

function sealedSection(world, rerender) {
  const sheet = el('div', 'sheet stack');
  const toggle = el('label', 'row toggle');
  const checkbox = el('input');
  checkbox.type = 'checkbox';
  checkbox.checked = !!world.revealSealed;
  checkbox.addEventListener('change', async () => {
    await store.updateWorld({ revealSealed: checkbox.checked });
    rerender();
  });
  toggle.append(checkbox, el('span', null, 'Reveal sealed pages'));
  sheet.append(toggle);
  sheet.append(el('p', 'faint', 'Sealed pages are quarantined: out of every list, out of search, '
    + 'and out of link suggestions when those arrive. This switch reveals them everywhere.'));
  return section('Sealed content', sheet);
}

/* --------------------------------------------------------- broken links */

/**
 * Links that point at nothing — usually a page renamed after it was linked,
 * or a heading that moved. Each one can be opened where it sits, or fixed
 * on the spot by creating the page it was asking for.
 */
async function brokenLinksSection(rerender) {
  const broken = groupBroken(await store.listBrokenLinks());
  const sheet = el('div', 'sheet');

  if (!broken.length) {
    sheet.append(el('p', 'faint', 'Every link points at something.'));
    return section('Broken links', sheet);
  }

  const list = el('ul', 'list');
  for (const entry of broken) {
    const li = el('li');
    const left = el('div');
    left.append(el('div', null, entry.broken === 'anchor'
      ? `${entry.target} › ${entry.anchor}`
      : entry.target));
    const times = entry.count > 1 ? ` · linked ${entry.count} times` : '';
    left.append(el('div', 'faint mono', entry.broken === 'anchor'
      ? `on ${entry.from.title} · that page has no such heading${times}`
      : `on ${entry.from.title} · no page has that name${times}`));

    const actions = el('div', 'row');
    actions.append(button('Open', {
      className: 'btn btn--quiet',
      onClick: () => go(`/page/${entry.from.id}`),
    }));
    if (entry.broken === 'page') {
      actions.append(button('Create it', {
        className: 'btn btn--quiet',
        onClick: () => openSheet(`Create “${entry.target}” as…`,
          PAGE_TYPE_ORDER.filter((t) => t !== 'image').map((type) => ({
            label: `${titleCase(type)} page`,
            onSelect: async () => {
              const page = await store.createPage({ type, title: entry.target });
              toast(`Created “${entry.target}”. The link points at it now.`);
              go(`/page/${page.id}`);
            },
          }))),
      }));
    }
    li.append(left, actions);
    list.append(li);
  }

  sheet.append(list);
  return section(`Broken links (${broken.length})`, sheet);
}

/* ----------------------------------------------------------------- trash */

async function trashSection(rerender) {
  const entries = (await store.listTrash()).sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
  const sheet = el('div', 'sheet');

  if (!entries.length) {
    sheet.append(el('p', 'faint', 'Nothing deleted. Deletions land here first, never in oblivion.'));
  } else {
    const list = el('ul', 'list');
    for (const entry of entries) {
      const li = el('li');
      const left = el('div');
      left.append(el('div', null, entry.title));
      left.append(el('div', 'faint mono', `${entry.kind} · deleted ${relativeTime(entry.deletedAt)}`));
      const actions = el('div', 'row');
      actions.append(button('Restore', {
        className: 'btn btn--quiet',
        onClick: async () => { await store.restore(entry.id); toast(`Restored "${entry.title}"`); rerender(); },
      }));
      actions.append(button('Purge', {
        className: 'btn btn--quiet btn--danger-text',
        onClick: async () => {
          const sure = await confirmSheet(`Destroy "${entry.title}" for good?`, {
            confirmLabel: 'Destroy it', hint: 'This is the one action that cannot be undone.',
          });
          if (!sure) return;
          await store.purgeTrash(entry.id);
          rerender();
        },
      }));
      li.append(left, actions);
      list.append(li);
    }
    sheet.append(list);
  }
  return section(`Trash${entries.length ? ` (${entries.length})` : ''}`, sheet);
}

/* ------------------------------------------------------------- self-test */

function selftestSection(rerender) {
  const sheet = el('div', 'sheet stack');
  sheet.append(el('p', 'dim', 'Runs the data layer against this browser’s own storage. It takes a full '
    + 'backup first and restores it afterwards, so it is safe to run on a real world.'));
  const log = el('pre', 'log');
  log.hidden = true;

  sheet.append(button(`Run ${selftest.testCount} checks`, {
    className: 'btn',
    onClick: async (event) => {
      const btn = event.currentTarget;
      btn.disabled = true;
      log.hidden = false;
      log.replaceChildren(el('div', 'log__note', `Running ${selftest.testCount} checks…`));
      try {
        const { passed, failed } = await selftest.run({
          onResult: (r) => log.append(el('div', r.ok ? 'log__ok' : 'log__fail',
            r.ok ? `  ✓ ${r.name}` : `  ✗ ${r.name}\n      ${r.error}`)),
        });
        log.append(el('div', failed ? 'log__fail' : 'log__ok',
          failed ? `${failed} failed, ${passed} passed.` : `All ${passed} checks passed. Your world was restored unchanged.`));
      } catch (err) {
        log.append(el('div', 'log__fail', `Test run crashed: ${err.message}`));
      } finally {
        btn.disabled = false;
        dispatchEvent(new CustomEvent('cover-changed'));
      }
    },
  }));
  sheet.append(log);
  return section('Self-test', sheet);
}

/* ---------------------------------------------------------------- danger */

function dangerSection(rerender) {
  const sheet = el('div', 'sheet');
  sheet.append(button('Erase this world', {
    className: 'btn btn--danger',
    onClick: async () => {
      const sure = await confirmSheet('Erase every page, image and relationship?', {
        confirmLabel: 'Erase everything', hint: 'Export first if there is any doubt. This empties the trash too.',
      });
      if (!sure) return;
      await store.reset();
      store.releaseImageUrls();
      dispatchEvent(new CustomEvent('cover-changed'));
      go('/');
      toast('World erased.');
    },
  }));
  return section('Danger', sheet);
}
