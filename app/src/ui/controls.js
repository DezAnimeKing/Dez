import { h } from "../lib/dom.js";
import { icon, hasIcon } from "../lib/icons.js";
import { showMenu } from "./menu.js";
import { todayKey, shiftKey, formatDay, diffDays, startOfWeek, toKey, addDays } from "../lib/date.js";
import { PRIORITIES } from "../store/selectors.js";

export const ACCENTS = [
  { id: "lime", name: "Lime", h: 76, s: "82%", l: "63%" },
  { id: "mint", name: "Mint", h: 152, s: "62%", l: "55%" },
  { id: "sky", name: "Sky", h: 205, s: "82%", l: "62%" },
  { id: "violet", name: "Violet", h: 262, s: "78%", l: "68%" },
  { id: "rose", name: "Rose", h: 344, s: "78%", l: "65%" },
  { id: "amber", name: "Amber", h: 36, s: "88%", l: "58%" },
];

export const SWATCHES = ["#c7f051", "#7ee08a", "#7fb2f0", "#b79cf5", "#ef7d7d", "#e8c35a", "#8b929c"];

export function checkbox(checked, onToggle, { round = false, label = "Toggle" } = {}) {
  return h(
    "button",
    {
      class: ["check", round && "check--round"],
      role: "checkbox", type: "button",
      "aria-checked": String(Boolean(checked)),
      "aria-label": label,
      onClick: (event) => { event.stopPropagation(); onToggle(event); },
    },
    icon("check", 12)
  );
}

export function priorityChip(priority, { compact = false } = {}) {
  if (!priority || priority === "none") return null;
  const name = PRIORITIES.find((p) => p.id === priority)?.name || priority;
  return h("span", { class: `chip chip--${priority}` }, icon("flag", 12), compact ? null : name);
}

export function dueChip(due, { time = null, done = false } = {}) {
  if (!due) return null;
  const delta = diffDays(due);
  const overdue = !done && delta < 0;
  const label = formatDay(due) + (time ? ` · ${time}` : "");
  return h(
    "span",
    { class: ["chip", overdue ? "chip--overdue" : delta === 0 && !done ? "chip--accent" : ""] },
    icon("calendar", 12),
    label
  );
}

export function tagChip(tag, onRemove = null) {
  return h(
    "span", { class: "tag" }, tag,
    onRemove
      ? h("button", { class: "chip__x", "aria-label": `Remove ${tag}`, onClick: onRemove, style: { marginLeft: "3px" } }, icon("x", 10))
      : null
  );
}

export function avatar(name, { size = "" } = {}) {
  const initials = String(name || "?").split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
  let hash = 0;
  for (const ch of String(name || "")) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return h(
    "span",
    { class: ["avatar", size && `avatar--${size}`], style: { background: `hsl(${hash} 58% 55%)` }, title: name },
    initials || "?"
  );
}

export function progressBar(pct, { thin = false, color = null } = {}) {
  return h(
    "div", { class: ["progress", thin && "progress--thin"], role: "progressbar", "aria-valuenow": String(Math.round(pct)) },
    h("div", { class: "progress__fill", style: { width: `${Math.max(0, Math.min(100, pct))}%`, background: color || null } })
  );
}

export function ring(pct, { size = 46, stroke = 4, label = null } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return h(
    "div", { class: "ring", style: { width: `${size}px`, height: `${size}px` } },
    h(
      "svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}`, style: { rotate: "-90deg" } },
      h("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: "var(--track)", "stroke-width": stroke }),
      h("circle", {
        cx: size / 2, cy: size / 2, r, fill: "none", stroke: "var(--accent)", "stroke-width": stroke,
        "stroke-linecap": "round", "stroke-dasharray": `${c}`, "stroke-dashoffset": `${c * (1 - clamped / 100)}`,
        style: { transition: "stroke-dashoffset 0.4s var(--ease)" },
      })
    ),
    h("span", { class: "ring__text" }, label ?? `${Math.round(clamped)}%`)
  );
}

export function emptyState({ icon: iconName = "sparkles", title, text, action = null }) {
  return h(
    "div", { class: "empty" },
    h("div", { class: "empty__art" }, icon(iconName, 28)),
    h("div", { class: "empty__title" }, title),
    text ? h("p", { class: "empty__text" }, text) : null,
    action
  );
}

export function iconTile(name, { size = 30, color = null } = {}) {
  return h(
    "span",
    {
      class: "palette__icon",
      style: { width: `${size}px`, height: `${size}px`, color: color || null, background: color ? `${color}22` : null },
    },
    icon(hasIcon(name) ? name : "note", Math.round(size * 0.55))
  );
}

/* ---------------- pickers ---------------- */

export function openDateMenu(anchor, value, onPick) {
  const weekend = toKey(addDays(startOfWeek(new Date(), 1), 5));
  const items = [
    { label: "Today", icon: "sun", hint: formatDay(todayKey(), { weekday: false }), onClick: () => onPick(todayKey()) },
    { label: "Tomorrow", icon: "arrow-right", hint: formatDay(shiftKey(todayKey(), 1), { weekday: false }), onClick: () => onPick(shiftKey(todayKey(), 1)) },
    diffDays(weekend) > 0
      ? { label: "This weekend", icon: "calendar", hint: formatDay(weekend, { weekday: false }), onClick: () => onPick(weekend) }
      : null,
    { label: "Next week", icon: "calendar", hint: formatDay(shiftKey(todayKey(), 7), { weekday: false }), onClick: () => onPick(shiftKey(todayKey(), 7)) },
    { separator: true },
    { label: "Pick a date…", icon: "calendar", onClick: () => openDatePicker(anchor, value, onPick) },
    value ? { label: "Clear date", icon: "x", onClick: () => onPick(null) } : null,
  ];
  showMenu(anchor, items.filter(Boolean));
}

function openDatePicker(anchor, value, onPick) {
  const input = h("input", {
    type: "date", class: "input", value: value || todayKey(),
    onChange: (event) => { if (event.target.value) onPick(event.target.value); },
  });
  const node = showMenu(anchor, [{ heading: "Pick a date" }]);
  const wrapper = h("div", { style: { padding: "4px" } }, input);
  node.appendChild(wrapper);
  requestAnimationFrame(() => { input.focus(); input.showPicker?.(); });
}

export function openPriorityMenu(anchor, value, onPick) {
  showMenu(
    anchor,
    PRIORITIES.map((p) => ({
      label: p.name, icon: p.id === "none" ? "minus" : "flag",
      active: value === p.id, onClick: () => onPick(p.id),
    }))
  );
}

export function openProjectMenu(anchor, state, value, onPick, { allowNone = true } = {}) {
  const items = [];
  if (allowNone) items.push({ label: "Inbox (no project)", icon: "inbox", active: !value, onClick: () => onPick(null) });
  const grouped = new Map();
  for (const project of state.projects.filter((p) => !p.archived)) {
    const key = project.categoryId || "__none";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(project);
  }
  for (const [categoryId, projects] of grouped) {
    const category = state.categories.find((c) => c.id === categoryId);
    items.push({ heading: category ? category.name : "Projects" });
    for (const project of projects) {
      items.push({ label: project.name, icon: "board", active: value === project.id, onClick: () => onPick(project.id) });
    }
  }
  showMenu(anchor, items);
}

export function openIconMenu(anchor, value, onPick) {
  const names = ["note", "book", "book-open", "eye", "target", "flame", "star", "bookmark", "layers", "folder", "users", "globe", "zap", "image", "clock", "calendar", "check-square", "chart", "mood", "tag"];
  const grid = h(
    "div",
    { style: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "4px", padding: "4px" } },
    ...names.map((name) =>
      h(
        "button",
        {
          class: "btn btn--ghost btn--icon", "aria-label": name,
          style: value === name ? { background: "var(--accent-soft)", color: "var(--accent)" } : null,
          onClick: () => { onPick(name); },
        },
        icon(name, 17)
      )
    )
  );
  const node = showMenu(anchor, [{ heading: "Page icon" }], { width: 210 });
  node.appendChild(grid);
  grid.addEventListener("click", () => setTimeout(() => node.remove(), 0));
}

export function colorPicker(value, onPick) {
  return h(
    "div", { class: "swatches" },
    ...SWATCHES.map((color) =>
      h("button", {
        class: "swatch", style: { background: color },
        "aria-pressed": String(value === color), "aria-label": color,
        onClick: () => onPick(color),
      })
    )
  );
}

export function rating(value, { onPick = null, max = 5 } = {}) {
  return h(
    "span", { class: ["rating", onPick && "rating--interactive"] },
    ...Array.from({ length: max }, (_, i) =>
      h(
        "span",
        {
          class: "rating__star", dataset: { on: i < (value || 0) ? "true" : "false" },
          role: onPick ? "button" : null,
          onClick: onPick ? (event) => { event.stopPropagation(); onPick(i + 1 === value ? 0 : i + 1); } : null,
        },
        icon("star", 14)
      )
    )
  );
}
