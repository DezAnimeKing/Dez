/* A page: read it, or edit it.
 *
 * Reading is the default, because most visits are reading — the author has
 * long prose here. Editing is one tap away and autosaves; nothing is ever
 * "submitted".
 */

import * as store from '../store.js';
import {
  el, frag, button, field, select, statusPill, statusControl,
  openSheet, confirmSheet, toast, autogrow, relativeTime,
} from '../ui.js';
import { go, back, path } from '../router.js';
import {
  STATUS_META, CAST_TIER_ORDER, DEV_TIER_ORDER, PAGE_TYPE, makeBlock,
} from '../schema.js';
import { slugify } from '../markdown.js';
import {
  renderText, attachLinkAutocomplete, backlinksSection, revealAnchor,
} from './linking.js';

const titleCase = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const BLOCK_KINDS = [['paragraph', 'Paragraph'], ['heading', 'Heading'], ['quote', 'Quote'], ['list', 'List'], ['table', 'Table'], ['code', 'Code']];

const editing = new Set(); // page ids currently open in edit mode

/** Is this page still the one on screen? */
const onThisPage = (id) => path().startsWith(`/page/${id}`);

export async function render(container, id, anchor = null) {
  const [page, graph] = await Promise.all([store.getPage(id), store.linkGraph()]);
  // This view re-renders itself after edits, so it may finish after the
  // author has already navigated elsewhere. Paint only if still on it.
  if (!onThisPage(id)) return;
  container.replaceChildren();

  if (!page) {
    const missing = el('div', 'sheet');
    missing.append(el('p', null, 'That page is not here. It may have been deleted — check the trash in Settings.'));
    missing.append(button('Back to contents', { className: 'btn', onClick: () => go('/') }));
    container.append(missing);
    return;
  }

  // A page created a moment ago and never titled opens straight into editing.
  if (!page.title) editing.add(page.id);
  const isEditing = editing.has(page.id);

  const save = (patch) => store.savePageSoon(page.id, patch);
  const rerender = () => render(container, id);

  container.append(header(page, { isEditing, rerender, container }));
  container.append(isEditing ? editor(page, save, rerender) : reader(page, rerender, graph));

  const backlinks = await backlinksSection(page.id);
  if (backlinks && onThisPage(id)) container.append(backlinks);

  // Arriving from [[Page#Heading]]: go to the heading and mark it.
  if (anchor && !isEditing) requestAnimationFrame(() => revealAnchor(anchor));
}

/* ---------------------------------------------------------------- header */

function header(page, { isEditing, rerender, container }) {
  const head = el('header', 'book__header page__header');

  const crumbs = el('div', 'row page__crumbs');
  crumbs.append(button('‹ Back', { className: 'btn btn--quiet', onClick: () => back('/') }));
  crumbs.append(el('span', 'faint mono', `${page.type} · edited ${relativeTime(page.updatedAt)}`));
  head.append(crumbs);

  if (!isEditing) {
    head.append(el('h1', 'page__title', page.title || 'Untitled'));
    if (page.aliases?.length) head.append(el('p', 'page__aliases dim', page.aliases.join(' · ')));
  }

  const row = el('div', 'row page__actions');
  row.append(statusControl(page.status, async (status) => {
    await store.updatePage(page.id, { status });
    rerender();
  }));
  row.append(button(isEditing ? 'Done' : 'Edit', {
    className: isEditing ? 'btn btn--primary' : 'btn',
    onClick: async () => {
      if (isEditing) { editing.delete(page.id); await store.flush(); }
      else editing.add(page.id);
      render(container, page.id);
    },
  }));
  row.append(button('⋯', { className: 'btn btn--icon', title: 'More', onClick: () => moreSheet(page, rerender) }));
  head.append(row);

  return head;
}

function moreSheet(page, rerender) {
  const options = [
    {
      label: page.devTier === 'sealed' ? 'Unseal this page' : 'Seal this page',
      hint: page.devTier === 'sealed'
        ? 'Return it to the world, and to search.'
        : 'Quarantine it: out of search and out of link suggestions.',
      onSelect: async () => {
        await store.updatePage(page.id, { devTier: page.devTier === 'sealed' ? 'canon' : 'sealed' });
        rerender();
      },
    },
    {
      label: page.devTier === 'exercise' ? 'Mark as canon material' : 'Mark as exercise',
      hint: 'Exercise material is live ideas, binding on nothing.',
      onSelect: async () => {
        await store.updatePage(page.id, { devTier: page.devTier === 'exercise' ? 'canon' : 'exercise' });
        rerender();
      },
    },
    {
      label: 'Delete', className: 'sheet-option sheet-option--danger',
      hint: 'Goes to the trash, and can be undone.',
      onSelect: async () => {
        const sure = await confirmSheet(`Delete "${page.title || 'Untitled'}"?`, {
          hint: 'It goes to the trash in Settings, where you can restore it.',
        });
        if (!sure) return;
        await store.remove('pages', page.id);
        go('/');
        toast(`Deleted "${page.title || 'Untitled'}"`, {
          actionLabel: 'Undo',
          onAction: async () => { await store.undo(); go(`/page/${page.id}`); },
        });
      },
    },
  ];
  openSheet(page.title || 'Untitled', options);
}

/* ---------------------------------------------------------------- reader */

function reader(page, rerender, graph) {
  const body = el('article', 'prose');

  const meta = el('dl', 'meta-grid');
  const addMeta = (label, value) => {
    if (!value) return;
    meta.append(el('dt', 'mono', label), el('dd', null, value));
  };
  if (page.type === PAGE_TYPE.CHARACTER) {
    addMeta('Cast', titleCase(page.castTier || 'record'));
    addMeta('Theme', page.themeMusic?.title);
  }
  if (page.type === PAGE_TYPE.REGION) {
    addMeta('Era', page.era);
    addMeta('Ruled by', page.rulingFaction);
  }
  if (page.devTier !== 'canon') addMeta('Development', titleCase(page.devTier));
  if (page.tags?.length) addMeta('Tags', page.tags.join(', '));
  if (meta.children.length) body.append(meta);

  // The markdown importer derives a summary from the opening paragraph, so
  // suppress the lead when it would simply repeat the first block.
  const firstProse = page.blocks?.find((b) => b.kind === 'paragraph')?.text?.replace(/\s+/g, ' ').trim();
  const summary = page.summary?.replace(/\s+/g, ' ').trim();
  const echoesBody = summary && firstProse && (firstProse === summary || firstProse.startsWith(summary.replace(/…$/, '')));
  if (summary && !echoesBody) {
    const lead = el('p', 'prose__lead');
    lead.append(renderText(page.summary, graph));
    body.append(lead);
  }

  if (!page.blocks?.length) {
    body.append(el('p', 'faint', 'Nothing written here yet. Tap Edit to begin — typing [[ links to another page.'));
    return body;
  }

  for (const block of page.blocks) {
    const node = renderBlock(block, graph);
    const effective = block.status || page.status;
    node.classList.add('block', `block--${effective}`);
    if (block.status) node.dataset.status = block.status;

    if (block.status && block.status !== page.status) {
      const tag = el('div', 'block__tag');
      tag.append(statusPill(block.status));
      if (block.status === 'OPEN' || block.status === 'PROPOSED') {
        tag.append(button('Make canon', {
          className: 'btn btn--promote btn--tiny',
          onClick: async () => {
            const blocks = page.blocks.map((b) => (b.id === block.id ? { ...b, status: 'CANON' } : b));
            await store.updatePage(page.id, { blocks });
            rerender();
          },
        }));
      }
      body.append(tag);
    }
    body.append(node);
  }
  return body;
}

function renderBlock(block, graph) {
  const text = block.text ?? '';
  // Blocks that are prose get their [[links]]; code keeps its literal text.
  const linked = (node, value = text) => {
    node.append(graph ? renderText(value, graph) : document.createTextNode(value));
    return node;
  };
  switch (block.kind) {
    case 'heading': {
      const level = Math.min(Math.max(block.level || 2, 2), 6);
      const node = el(`h${level}`, 'prose__heading', text);
      if (block.anchor) node.id = block.anchor;
      return node;
    }
    case 'quote': return linked(el('blockquote'));
    case 'code': return el('pre', null, text.replace(/^```\w*\n?|```$/g, ''));
    case 'list': {
      const ordered = /^\s*\d+[.)]/.test(text);
      const list = el(ordered ? 'ol' : 'ul', 'prose__list');
      for (const line of text.split('\n')) {
        const item = line.replace(/^\s*(?:[-*+]|\d+[.)])\s*/, '').trim();
        if (item) list.append(linked(el('li'), item));
      }
      return list;
    }
    case 'table': return renderTable(text, graph);
    case 'speech': {
      const line = el('p', 'prose__speech');
      line.append(el('span', 'prose__speaker', `${block.speaker || ''} `), document.createTextNode(text));
      return line;
    }
    case 'direction': return el('p', 'prose__direction', text);
    default: return linked(el('p'));
  }
}

function renderTable(text, graph) {
  const wrap = el('div', 'table-scroll');
  const table = el('table', 'prose__table');
  const rows = text.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('|'));
  rows.forEach((line, index) => {
    const cells = line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return; // the separator row
    const tr = el('tr');
    for (const cell of cells) {
      const td = el(index === 0 ? 'th' : 'td');
      td.append(graph ? renderText(cell, graph) : document.createTextNode(cell));
      tr.append(td);
    }
    table.append(tr);
  });
  wrap.append(table);
  return wrap;
}

/* ---------------------------------------------------------------- editor */

function editor(page, save, rerender) {
  const form = el('div', 'editor stack');
  let blocks = (page.blocks || []).map((b) => ({ ...b }));
  const saveBlocks = () => save({ blocks });

  const titleField = field('Title', page.title, (value) => save({ title: value }), { placeholder: 'Untitled' });
  titleField.input.classList.add('field--title');
  form.append(titleField);
  if (!page.title) queueMicrotask(() => titleField.input.focus({ preventScroll: true }));

  form.append(field('Aliases, comma separated', (page.aliases || []).join(', '),
    (value) => save({ aliases: value.split(',').map((s) => s.trim()).filter(Boolean) })));

  const summaryField = field('One-line summary', page.summary, (value) => save({ summary: value }),
    { multiline: true, placeholder: 'What this page is, in a sentence. [[ links ]] work here too.' });
  attachLinkAutocomplete(summaryField.input, { excludeId: page.id, onCommit: (value) => save({ summary: value }) });
  form.append(summaryField);

  if (page.type === PAGE_TYPE.CHARACTER) {
    form.append(select('Cast tier', CAST_TIER_ORDER.map((t) => [t, titleCase(t)]), page.castTier || 'record',
      (value) => save({ castTier: value })));
    form.append(field('Theme music', page.themeMusic?.title || '',
      (value) => save({ themeMusic: { ...(page.themeMusic || {}), title: value } }),
      { placeholder: 'Shared songs mark soul-tethers.' }));
    form.append(field('Theme music link', page.themeMusic?.url || '',
      (value) => save({ themeMusic: { ...(page.themeMusic || {}), url: value } })));
  }

  if (page.type === PAGE_TYPE.REGION) {
    form.append(field('Era of relevance', page.era || '', (value) => save({ era: value })));
    form.append(field('Ruling faction', page.rulingFaction || '', (value) => save({ rulingFaction: value })));
  }

  form.append(select('Development tier', DEV_TIER_ORDER.map((t) => [t, titleCase(t)]), page.devTier,
    (value) => save({ devTier: value })));

  form.append(field('Tags, comma separated', (page.tags || []).join(', '),
    (value) => save({ tags: value.split(',').map((s) => s.trim()).filter(Boolean) })));

  const blockList = el('div', 'stack');
  form.append(el('h2', 'section__heading', 'Body'), blockList);

  function paintBlocks() {
    blockList.replaceChildren();
    blocks.forEach((block, index) => blockList.append(blockEditor(block, index)));
    if (!blocks.length) blockList.append(el('p', 'faint', 'No blocks yet. Add one below.'));
  }

  function blockEditor(block, index) {
    const wrap = el('div', `block-edit block--${block.status || page.status}`);

    const bar = el('div', 'row block-edit__bar');
    bar.append(button(BLOCK_KINDS.find(([k]) => k === block.kind)?.[1] || 'Paragraph', {
      className: 'chip',
      onClick: () => openSheet('Block kind', BLOCK_KINDS.map(([value, label]) => ({
        label, selected: block.kind === value,
        onSelect: () => {
          block.kind = value;
          if (value === 'heading') { block.level ||= 2; block.anchor = slugify(block.text); }
          saveBlocks();
          paintBlocks();
        },
      }))),
    }));

    bar.append(statusControl(block.status, (status) => {
      block.status = status;
      if (status) block.resolvedAt = new Date().toISOString();
      saveBlocks();
      paintBlocks();
    }, { inheritLabel: `Inherit page (${STATUS_META[page.status].label})` }));

    const move = el('div', 'row block-edit__move');
    move.append(button('↑', {
      className: 'btn btn--icon btn--quiet', title: 'Move up', disabled: index === 0,
      onClick: () => { blocks.splice(index - 1, 0, blocks.splice(index, 1)[0]); saveBlocks(); paintBlocks(); },
    }));
    move.append(button('↓', {
      className: 'btn btn--icon btn--quiet', title: 'Move down', disabled: index === blocks.length - 1,
      onClick: () => { blocks.splice(index + 1, 0, blocks.splice(index, 1)[0]); saveBlocks(); paintBlocks(); },
    }));
    move.append(button('✕', {
      className: 'btn btn--icon btn--quiet', title: 'Remove this block',
      onClick: async () => {
        const removed = blocks.splice(index, 1)[0];
        saveBlocks();
        paintBlocks();
        toast('Block removed', {
          actionLabel: 'Undo',
          onAction: () => { blocks.splice(index, 0, removed); saveBlocks(); paintBlocks(); },
        });
      },
    }));
    bar.append(move);
    wrap.append(bar);

    const area = el('textarea', 'field field--block');
    area.value = block.text;
    area.rows = 2;
    area.setAttribute('aria-label', `${block.kind} block ${index + 1}`);
    area.addEventListener('input', () => {
      block.text = area.value;
      if (block.kind === 'heading') block.anchor = slugify(area.value);
      autogrow(area);
      saveBlocks();
    });
    attachLinkAutocomplete(area, {
      excludeId: page.id,
      onCommit: (value) => { block.text = value; saveBlocks(); },
    });
    queueMicrotask(() => autogrow(area));
    wrap.append(area);
    return wrap;
  }

  paintBlocks();

  const add = el('div', 'row');
  add.append(button('Add paragraph', {
    className: 'btn',
    onClick: () => { blocks.push(makeBlock({ kind: 'paragraph' })); saveBlocks(); paintBlocks(); },
  }));
  add.append(button('Add heading', {
    className: 'btn',
    onClick: () => { blocks.push(makeBlock({ kind: 'heading', level: 2 })); saveBlocks(); paintBlocks(); },
  }));
  form.append(add);

  form.append(button('Done editing', {
    className: 'btn btn--primary section',
    onClick: async () => { editing.delete(page.id); await store.flush(); rerender(); },
  }));

  return form;
}
