/* A section's list: search, filters, and every page in it.
 *
 * Sealed pages are absent unless the settings toggle reveals them; the
 * filter row says so rather than leaving the author to wonder where a page
 * went.
 */

import * as store from '../store.js';
import { el, button, statusPill, relativeTime, plural, openSheet } from '../ui.js';
import { go, path } from '../router.js';
import { STATUS_ORDER, STATUS_META, CAST_TIER_ORDER, DEV_TIER_ORDER } from '../schema.js';
import { SECTIONS, newPage } from './contents.js';

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Filter state survives navigating into a page and back out again. */
const state = new Map();

const stateFor = (type) => {
  if (!state.has(type)) state.set(type, { query: '', status: null, castTier: null, tier: null, sort: type === 'character' ? 'cast' : 'title' });
  return state.get(type);
};

export async function render(container, type) {
  const section = SECTIONS.find((s) => s.type === type);
  const filters = stateFor(type);
  container.replaceChildren();

  const header = el('header', 'book__header');
  header.append(el('p', 'book__eyebrow', 'Contents · ' + section.label));
  header.append(el('h1', null, section.label));
  header.append(el('p', 'dim', section.blurb));
  container.append(header);

  const search = el('input', 'field field--search');
  search.type = 'search';
  search.placeholder = `Search ${section.label.toLowerCase()}…`;
  search.value = filters.query;
  search.setAttribute('aria-label', `Search ${section.label}`);
  container.append(search);

  const filterRow = el('div', 'row filters');
  container.append(filterRow);

  const results = el('div');
  container.append(results);

  const actions = el('div', 'row section');
  actions.append(button(`New ${type}`, { className: 'btn btn--primary', onClick: () => newPage(type) }));
  container.append(actions);

  const chip = (label, active, onClick) => {
    const b = button(label, { className: `chip${active ? ' chip--on' : ''}`, onClick });
    b.setAttribute('aria-pressed', String(!!active));
    return b;
  };

  async function paint() {
    filterRow.replaceChildren();

    filterRow.append(chip(filters.status ? STATUS_META[filters.status].label : 'Any status', !!filters.status, () => {
      openSheet('Filter by canon status', [
        { label: 'Any status', selected: !filters.status, onSelect: () => { filters.status = null; paint(); } },
        ...STATUS_ORDER.map((s) => ({
          label: STATUS_META[s].label, hint: STATUS_META[s].hint,
          className: `sheet-option sheet-option--${s}`, selected: filters.status === s,
          onSelect: () => { filters.status = s; paint(); },
        })),
      ]);
    }));

    if (type === 'character') {
      filterRow.append(chip(filters.castTier ? titleCase(filters.castTier) : 'Any tier', !!filters.castTier, () => {
        openSheet('Filter by cast tier', [
          { label: 'Any tier', selected: !filters.castTier, onSelect: () => { filters.castTier = null; paint(); } },
          ...CAST_TIER_ORDER.map((t) => ({
            label: titleCase(t), selected: filters.castTier === t,
            onSelect: () => { filters.castTier = t; paint(); },
          })),
        ]);
      }));
    }

    filterRow.append(chip(filters.tier ? titleCase(filters.tier) : 'Any development', !!filters.tier, () => {
      openSheet('Filter by development tier', [
        { label: 'Any development', selected: !filters.tier, onSelect: () => { filters.tier = null; paint(); } },
        ...DEV_TIER_ORDER.map((t) => ({
          label: titleCase(t),
          hint: t === 'sealed' ? 'Quarantined: out of search and link suggestions.' : '',
          selected: filters.tier === t,
          onSelect: () => { filters.tier = t; paint(); },
        })),
      ]);
    }));

    filterRow.append(chip(`Sort: ${filters.sort}`, false, () => {
      const options = [['title', 'Title'], ['updated', 'Recently edited']];
      if (type === 'character') options.push(['cast', 'Cast tier']);
      openSheet('Sort', options.map(([value, label]) => ({
        label, selected: filters.sort === value,
        onSelect: () => { filters.sort = value; paint(); },
      })));
    }));

    const pages = await store.queryPages({ type, ...filters });
    if (!results.isConnected) return;  // navigated away mid-search
    results.replaceChildren();

    if (!pages.length) {
      const empty = el('div', 'sheet dim');
      empty.append(el('p', null, filters.query || filters.status || filters.castTier || filters.tier
        ? 'Nothing here matches those filters.'
        : `No ${section.label.toLowerCase()} yet.`));
      if (!store.getWorld().revealSealed && !filters.tier) {
        empty.append(el('p', 'faint mono', 'Sealed pages are hidden. Reveal them in Settings.'));
      }
      results.append(empty);
      return;
    }

    const counted = el('p', 'faint mono', plural(pages.length, 'page'));
    results.append(counted);

    const ul = el('ul', 'list list--entries');
    for (const page of pages) {
      const li = el('li');
      const link = el('a', 'link-plain');
      link.href = `#/page/${page.id}`;

      const title = el('div', 'entry__title', page.title || 'Untitled');
      const meta = [];
      if (page.castTier) meta.push(titleCase(page.castTier));
      if (page.aliases?.length) meta.push(page.aliases.join(' · '));
      if (page.era) meta.push(page.era);
      if (page.rulingFaction) meta.push(page.rulingFaction);
      meta.push(relativeTime(page.updatedAt));

      link.append(title, el('div', 'faint mono', meta.join(' · ')));
      if (page.summary) link.append(el('p', 'entry__summary dim', page.summary));

      const right = el('div', 'entry__aside');
      right.append(statusPill(page.status));
      if (page.devTier !== 'canon') right.append(el('span', `pill pill--${page.devTier}`, titleCase(page.devTier)));
      li.append(link, right);
      ul.append(li);
    }
    results.append(ul);
  }

  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { filters.query = search.value; paint(); }, 120);
  });

  await paint();
}

/** Sections whose own views arrive in a later stage. */
export function renderPlaceholder(container, type) {
  const section = SECTIONS.find((s) => s.type === type);
  container.replaceChildren();
  const header = el('header', 'book__header');
  header.append(el('p', 'book__eyebrow', 'Contents · ' + section.label));
  header.append(el('h1', null, section.label));
  container.append(header);

  const sheet = el('div', 'sheet');
  sheet.append(el('p', null, `${section.label} arrives at stage ${section.stage}.`));
  sheet.append(el('p', 'dim', section.type === 'event'
    ? 'The dual-reckoning storage underneath it is already built and tested — what is missing is the line itself.'
    : 'Anything imported into this section is safely stored in the meantime and will appear here when the view lands.'));
  container.append(sheet);

  store.queryPages({ type, sort: 'updated' }).then((pages) => {
    if (!pages.length) return;
    const list = el('ul', 'list');
    for (const page of pages) {
      const li = el('li');
      const link = el('a', 'link-plain');
      link.href = `#/page/${page.id}`;
      link.textContent = page.title || 'Untitled';
      li.append(link, statusPill(page.status));
      list.append(li);
    }
    const section = el('section', 'section');
    section.append(el('h2', 'section__heading', `Already stored (${pages.length})`));
    section.append(list);
    container.append(section);
  });
}
