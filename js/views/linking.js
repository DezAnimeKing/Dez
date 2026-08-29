/* The linking UI: inline links with previews, the `[[` autocomplete, and
 * the backlinks list.
 *
 * Kept apart from the page view because all three are wanted again by the
 * story editor and the timeline's event panel later on.
 */

import * as store from '../store.js';
import { el, button } from '../ui.js';
import { go } from '../router.js';
import {
  tokenise, resolveLink, suggest, headingsOf, activeLinkAt, completeLink, previewOf,
} from '../links.js';

/* ------------------------------------------------------- inline rendering */

/**
 * Text with [[links]] → a fragment where each link is tappable, and a
 * broken one looks broken rather than looking like prose.
 */
export function renderText(text, graph) {
  const fragment = document.createDocumentFragment();
  for (const token of tokenise(text)) {
    if (token.type === 'text') { fragment.append(document.createTextNode(token.text)); continue; }

    const resolved = resolveLink(graph.index, token);
    if (!resolved.page) {
      const broken = el('span', 'wikilink wikilink--broken', token.label || token.target);
      broken.title = `Nothing here is called “${token.target}”.`;
      fragment.append(broken);
      continue;
    }

    const link = el('a', `wikilink${resolved.broken === 'anchor' ? ' wikilink--anchor-broken' : ''}`);
    link.href = `#/page/${resolved.page.id}${token.anchor && !resolved.broken ? `/${slugFor(resolved.page, token.anchor)}` : ''}`;
    link.textContent = token.label || resolved.page.title;
    if (resolved.broken === 'anchor') link.title = `“${resolved.page.title}” has no heading called “${token.anchor}”.`;
    attachPreview(link, resolved.page, token.anchor);
    fragment.append(link);
  }
  return fragment;
}

function slugFor(page, anchor) {
  const wanted = String(anchor).toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
  const heading = (page.blocks || []).find((b) => b.kind === 'heading' && (b.anchor === wanted || b.text?.toLowerCase() === String(anchor).toLowerCase()));
  return heading?.anchor || wanted;
}

/* ------------------------------------------------------------- preview */

let previewNode = null;
let previewTimer = null;

function closePreview() {
  previewNode?.remove();
  previewNode = null;
  clearTimeout(previewTimer);
}

/** Hover on a pointer, long-press on a touch screen. Never navigates. */
function attachPreview(anchorEl, page, anchor) {
  const open = () => {
    closePreview();
    const card = el('div', 'link-preview');
    card.append(el('div', 'link-preview__title', page.title));
    const meta = [page.type, page.status];
    if (anchor) meta.push(`› ${anchor}`);
    card.append(el('div', 'link-preview__meta mono', meta.join(' · ')));
    const text = previewOf(page, { anchor });
    card.append(el('p', 'link-preview__body', text || 'This page has nothing in it yet.'));

    document.body.append(card);
    previewNode = card;

    const rect = anchorEl.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    card.style.width = `${width}px`;
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    const above = rect.top > window.innerHeight / 2;
    card.style.left = `${left}px`;
    if (above) card.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    else card.style.top = `${rect.bottom + 8}px`;
  };

  anchorEl.addEventListener('mouseenter', () => { previewTimer = setTimeout(open, 350); });
  anchorEl.addEventListener('mouseleave', closePreview);
  anchorEl.addEventListener('touchstart', () => { previewTimer = setTimeout(open, 450); }, { passive: true });
  anchorEl.addEventListener('touchend', () => clearTimeout(previewTimer), { passive: true });
  anchorEl.addEventListener('click', closePreview);
}

addEventListener('scroll', closePreview, { passive: true });
addEventListener('hashchange', closePreview);

/* -------------------------------------------------------- autocomplete */

/**
 * Attach `[[` completion to a textarea or input. Typing `[[` opens a list
 * of pages; typing `#` after a title switches it to that page's headings.
 */
export function attachLinkAutocomplete(input, { excludeId = null, onCommit } = {}) {
  let menu = null;
  let items = [];
  let cursor = 0;

  const close = () => { menu?.remove(); menu = null; items = []; cursor = 0; };

  async function update() {
    const active = activeLinkAt(input.value, input.selectionStart);
    if (!active) { close(); return; }

    const { pages } = await store.linkGraph();
    const revealSealed = store.getWorld().revealSealed;

    if (active.anchorQuery != null) {
      const target = suggest(pages, active.query, { limit: 1, excludeId, revealSealed })[0];
      items = target
        ? headingsOf(target.page, active.anchorQuery).map((heading) => ({
            label: heading.text,
            hint: `heading in ${target.page.title}`,
            apply: () => completeLink(input.value, active, { title: target.page.title, anchor: heading.text }),
          }))
        : [];
    } else {
      items = suggest(pages, active.query, { excludeId, revealSealed }).map((hit) => ({
        label: hit.name,
        hint: hit.isAlias ? `alias of ${hit.page.title}` : `${hit.page.type} · ${hit.page.status.toLowerCase()}`,
        apply: () => completeLink(input.value, active, { title: hit.name }),
      }));
      if (active.query.trim() && !items.some((i) => i.label.toLowerCase() === active.query.trim().toLowerCase())) {
        items.push({
          label: `Link to “${active.query.trim()}” anyway`,
          hint: 'No page has that name yet — the link will read as broken until one does.',
          apply: () => completeLink(input.value, active, { title: active.query.trim() }),
        });
      }
    }

    if (!items.length) { close(); return; }
    cursor = 0;
    paint();
  }

  function paint() {
    if (!menu) {
      menu = el('div', 'autocomplete');
      menu.setAttribute('role', 'listbox');
      input.parentElement.style.position ||= 'relative';
      input.insertAdjacentElement('afterend', menu);
    }
    menu.replaceChildren();
    items.forEach((item, index) => {
      const option = el('button', `autocomplete__item${index === cursor ? ' autocomplete__item--on' : ''}`);
      option.type = 'button';
      option.setAttribute('role', 'option');
      option.append(el('span', 'autocomplete__label', item.label));
      if (item.hint) option.append(el('span', 'autocomplete__hint mono', item.hint));
      // mousedown, not click: the input must not lose the caret first.
      option.addEventListener('mousedown', (event) => { event.preventDefault(); commit(index); });
      option.addEventListener('touchstart', (event) => { event.preventDefault(); commit(index); }, { passive: false });
      menu.append(option);
    });
  }

  function commit(index) {
    const item = items[index];
    if (!item) return;
    const { text, caret } = item.apply();
    input.value = text;
    input.setSelectionRange(caret, caret);
    close();
    input.focus();
    onCommit?.(text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  input.addEventListener('input', update);
  input.addEventListener('click', update);
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', (event) => {
    if (!menu) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      cursor = (cursor + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      paint();
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      commit(cursor);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  return close;
}

/* ------------------------------------------------------------ backlinks */

/** "Linked from" — every page that points here, built for the page view. */
export async function backlinksSection(pageId) {
  const entries = await store.backlinksFor(pageId);
  if (!entries.length) return null;

  const section = el('section', 'section backlinks');
  section.append(el('h2', 'section__heading', `Linked from (${entries.length})`));
  const list = el('ul', 'list');

  for (const entry of entries) {
    const li = el('li');
    const link = el('a', 'link-plain');
    link.href = `#/page/${entry.from.id}`;
    link.append(el('div', null, entry.from.title || 'Untitled'));
    const meta = [entry.from.type];
    if (entry.anchor) meta.push(`→ ${entry.anchor}`);
    link.append(el('div', 'faint mono', meta.join(' · ')));
    li.append(link);
    list.append(li);
  }
  section.append(list);
  return section;
}

/* ------------------------------------------------- arriving at an anchor */

/** Scroll to a heading a link aimed at, and mark it briefly on arrival. */
export function revealAnchor(anchor) {
  if (!anchor) return;
  const target = document.getElementById(anchor);
  if (!target) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  target.classList.remove('anchor-arrived');
  void target.offsetWidth; // restart the mark if the same anchor is hit twice
  target.classList.add('anchor-arrived');
  setTimeout(() => target.classList.remove('anchor-arrived'), 2400);
}
