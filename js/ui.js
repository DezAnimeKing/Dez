/* Small DOM helpers and the two shared controls: the status chip and the
 * bottom sheet. Bottom sheets rather than modals — they land under the
 * thumb, not in the middle of the screen. */

import { STATUS_ORDER, STATUS_META } from './schema.js';

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function frag(...nodes) {
  const f = document.createDocumentFragment();
  f.append(...nodes.filter(Boolean));
  return f;
}

export function button(label, { className = 'btn', onClick, title, disabled } = {}) {
  const b = el('button', className, label);
  b.type = 'button';
  if (title) b.title = title;
  if (disabled) b.disabled = true;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

export function field(label, value, onInput, { multiline = false, placeholder = '' } = {}) {
  const wrap = el('label', 'labelled');
  wrap.append(el('span', 'labelled__name mono', label));
  const input = el(multiline ? 'textarea' : 'input', 'field');
  if (!multiline) input.type = 'text';
  input.value = value ?? '';
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.addEventListener('input', () => {
    if (multiline) autogrow(input);
    onInput(input.value);
  });
  if (multiline) queueMicrotask(() => autogrow(input));
  wrap.append(input);
  wrap.input = input;
  return wrap;
}

export function autogrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

export function select(label, options, value, onChange) {
  const wrap = el('label', 'labelled');
  wrap.append(el('span', 'labelled__name mono', label));
  const node = el('select', 'field');
  for (const [optValue, optLabel] of options) {
    const option = el('option', null, optLabel);
    option.value = optValue;
    node.append(option);
  }
  node.value = value ?? '';
  node.addEventListener('change', () => onChange(node.value));
  wrap.append(node);
  return wrap;
}

/* ---------------------------------------------------------- status chip */

export function statusPill(status, extra = '') {
  return el('span', `pill pill--${status}`, `${STATUS_META[status].label}${extra}`);
}

/**
 * The status control. Tapping the chip opens the four options; when the
 * subject is PROPOSED a second button promotes it to CANON in one tap,
 * because that is the move the author makes most.
 */
export function statusControl(status, onChange, { inheritLabel = null } = {}) {
  const wrap = el('div', 'row status-control');
  const current = status || 'inherit';

  const chip = el('button', status ? `pill pill--${status} pill--tappable` : 'pill pill--inherit pill--tappable',
    status ? STATUS_META[status].label : (inheritLabel || 'Inherits'));
  chip.type = 'button';
  chip.setAttribute('aria-label', `Canon status: ${status ? STATUS_META[status].label : 'inherited'}. Change it.`);
  chip.addEventListener('click', () => {
    const options = STATUS_ORDER.map((s) => ({
      label: STATUS_META[s].label,
      hint: STATUS_META[s].hint,
      className: `sheet-option sheet-option--${s}`,
      selected: s === status,
      onSelect: () => onChange(s),
    }));
    if (inheritLabel) {
      options.push({
        label: inheritLabel, hint: 'Follow whatever the page is ruled.',
        selected: !status, onSelect: () => onChange(null),
      });
    }
    openSheet('Canon status', options);
  });
  wrap.append(chip);

  if (current === 'PROPOSED' || current === 'OPEN') {
    wrap.append(button('Make canon', { className: 'btn btn--promote', onClick: () => onChange('CANON') }));
  }
  return wrap;
}

/* ---------------------------------------------------------- bottom sheet */

let openSheetNode = null;

export function openSheet(title, options) {
  closeSheet();
  const scrim = el('div', 'scrim');
  const sheet = el('div', 'bottom-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title);
  sheet.append(el('h2', 'bottom-sheet__title', title));

  for (const option of options) {
    const item = el('button', option.className || 'sheet-option');
    item.type = 'button';
    if (option.selected) item.dataset.selected = 'true';
    item.append(el('span', 'sheet-option__label', option.label));
    if (option.hint) item.append(el('span', 'sheet-option__hint', option.hint));
    item.addEventListener('click', () => { closeSheet(); option.onSelect?.(); });
    sheet.append(item);
  }

  sheet.append(button('Cancel', { className: 'btn btn--quiet sheet-cancel', onClick: closeSheet }));
  scrim.addEventListener('click', (event) => { if (event.target === scrim) closeSheet(); });
  scrim.append(sheet);
  document.body.append(scrim);
  openSheetNode = scrim;
  sheet.querySelector('button')?.focus({ preventScroll: true });
  return scrim;
}

export function closeSheet() {
  openSheetNode?.remove();
  openSheetNode = null;
}

addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSheet(); });

/** Confirmation, as a sheet rather than a browser dialog. */
export function confirmSheet(title, { confirmLabel = 'Delete', hint = '' } = {}) {
  return new Promise((resolve) => {
    const scrim = openSheet(title, [
      { label: confirmLabel, hint, className: 'sheet-option sheet-option--danger', onSelect: () => resolve(true) },
    ]);
    scrim.addEventListener('click', (event) => { if (event.target === scrim) resolve(false); }, { once: true });
    scrim.querySelector('.sheet-cancel').addEventListener('click', () => resolve(false), { once: true });
  });
}

/* ----------------------------------------------------------------- toast */

let toastTimer;

export function toast(message, { actionLabel, onAction, duration = 6000 } = {}) {
  document.getElementById('toast')?.remove();
  const node = el('div', 'toast');
  node.id = 'toast';
  node.setAttribute('role', 'status');
  node.append(el('span', null, message));
  if (actionLabel) {
    node.append(button(actionLabel, {
      className: 'btn btn--quiet toast__action',
      onClick: () => { node.remove(); onAction?.(); },
    }));
  }
  document.body.append(node);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.remove(), duration);
  return node;
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function relativeTime(iso) {
  if (!iso) return '';
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 90) return 'just now';
  const units = [[60, 'minute'], [60, 'hour'], [24, 'day'], [7, 'week'], [4.35, 'month'], [12, 'year']];
  let value = seconds / 60;
  let label = 'minute';
  for (let i = 1; i < units.length; i++) {
    if (value < units[i][0]) break;
    value /= units[i][0];
    label = units[i][1];
  }
  const rounded = Math.round(value);
  return `${rounded} ${label}${rounded === 1 ? '' : 's'} ago`;
}
