/* The Contents page — the book's table of contents.
 *
 * Every section, what is in it, and how much of it is settled. Recently
 * edited work surfaces underneath, because that is what the author is
 * usually coming back to.
 */

import * as store from '../store.js';
import { el, frag, button, statusPill, relativeTime, plural } from '../ui.js';
import { go } from '../router.js';
import { STATUS_ORDER, PAGE_TYPE_ORDER } from '../schema.js';

export const SECTIONS = [
  { type: 'region',    path: '/regions',    label: 'Regions',    blurb: 'Places, their eras and who holds them.' },
  { type: 'character', path: '/characters', label: 'Characters', blurb: 'The cast, and how their continuities run.' },
  { type: 'event',     path: '/timeline',   label: 'Timeline',   blurb: 'Two reckonings, one line.', stage: 4 },
  { type: 'scene',     path: '/story',      label: 'Story',      blurb: 'Scenes and two-hander dialogue.', stage: 5 },
  { type: 'system',    path: '/systems',    label: 'Systems',    blurb: 'The rules the world runs on.' },
  { type: 'image',     path: '/gallery',    label: 'Gallery',    blurb: 'Reference art, captioned and linked.', stage: 8 },
];

export async function render(container) {
  const [stats, recent, world] = await Promise.all([store.stats(), store.recent(6), store.getWorld()]);
  container.replaceChildren();

  const header = el('header', 'book__header');
  header.append(el('p', 'book__eyebrow', 'Contents'));
  header.append(el('h1', null, world.title || 'The Compendium'));
  if (world.subtitle) header.append(el('p', 'dim', world.subtitle));
  container.append(header);

  if (stats.openQuestions) {
    const banner = el('div', 'banner banner--open');
    banner.append(el('p', null, `${plural(stats.openQuestions, 'open question')} waiting on a ruling.`));
    banner.append(el('p', 'faint', 'The register that collects them arrives with stage six.'));
    container.append(banner);
  }

  const list = el('ol', 'toc');
  for (const section of SECTIONS) {
    const counts = stats.sections[section.type];
    const item = el('li', 'toc__item');
    const link = el('a', 'toc__link');
    link.href = `#${section.path}`;

    const left = el('div', 'toc__body');
    left.append(el('h2', 'toc__label', section.label));
    left.append(el('p', 'toc__blurb faint', section.blurb));

    const breakdown = el('div', 'row toc__status');
    for (const status of STATUS_ORDER) {
      if (counts[status]) breakdown.append(statusPill(status, ` ${counts[status]}`));
    }
    if (counts.sealed) breakdown.append(el('span', 'pill pill--sealed', `Sealed ${counts.sealed}`));
    if (section.stage && !counts.total) breakdown.append(el('span', 'pill pill--inherit', `Stage ${section.stage}`));
    left.append(breakdown);

    link.append(left, el('div', 'toc__count mono', String(counts.total)));
    item.append(link);
    list.append(item);
  }
  container.append(list);

  if (recent.length) {
    const section = el('section', 'section');
    section.append(el('h2', 'section__heading', 'Recently edited'));
    const ul = el('ul', 'list');
    for (const page of recent) {
      const li = el('li');
      const link = el('a', 'link-plain');
      link.href = `#/page/${page.id}`;
      link.append(el('div', null, page.title));
      link.append(el('div', 'faint mono', `${page.type} · ${relativeTime(page.updatedAt)}`));
      li.append(link, statusPill(page.status));
      ul.append(li);
    }
    section.append(ul);
    container.append(section);
  }

  const actions = el('div', 'row section');
  actions.append(
    button('New character', { className: 'btn btn--primary', onClick: () => newPage('character') }),
    button('New region', { className: 'btn', onClick: () => newPage('region') }),
    button('New system', { className: 'btn', onClick: () => newPage('system') }),
  );
  container.append(actions);

  const footer = el('p', 'faint mono section');
  footer.textContent = `${plural(stats.pages, 'page')} · ${plural(stats.images, 'image')} · ${plural(stats.relationships, 'relationship')}`
    + (stats.lastBackupAt ? ` · backed up ${relativeTime(stats.lastBackupAt)}` : ' · never backed up');
  container.append(footer);
}

async function newPage(type) {
  const page = await store.createPage({ type, title: '' });
  go(`/page/${page.id}`);
}

export { newPage };
