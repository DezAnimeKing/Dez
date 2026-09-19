import { h, qsa } from "../lib/dom.js";
import { icon } from "../lib/icons.js";

let openMenu = null;

export function closeMenu() {
  if (!openMenu) return;
  openMenu.node.remove();
  document.removeEventListener("pointerdown", openMenu.onOutside, true);
  document.removeEventListener("keydown", openMenu.onKey, true);
  window.removeEventListener("resize", closeMenu);
  window.removeEventListener("scroll", closeMenu, true);
  openMenu = null;
}

/**
 * Items: { label, icon, hint, onClick, danger, active, separator, heading }
 * @param {MouseEvent|HTMLElement} anchor
 */
export function showMenu(anchor, items, { align = "start", width = null } = {}) {
  closeMenu();
  const rect = (anchor instanceof Element ? anchor : anchor.currentTarget || anchor.target).getBoundingClientRect();

  const node = h(
    "div",
    { class: "menu", role: "menu", style: width ? { minWidth: `${width}px` } : null },
    ...items.filter(Boolean).map((item) => {
      if (item.separator) return h("div", { class: "menu__sep" });
      if (item.heading) return h("div", { class: "menu__label" }, item.heading);
      return h(
        "button",
        {
          class: "menu__item", role: "menuitem", type: "button",
          dataset: { danger: item.danger ? "true" : null, active: item.active ? "true" : null },
          onClick: (event) => { event.stopPropagation(); closeMenu(); item.onClick?.(event); },
        },
        item.icon ? icon(item.icon, 15) : null,
        h("span", { class: "u-truncate" }, item.label),
        item.hint ? h("span", { class: "menu__hint" }, item.hint) : null,
        item.active ? icon("check", 14) : null
      );
    })
  );

  document.getElementById("overlays").appendChild(node);
  const menuRect = node.getBoundingClientRect();
  const gap = 6;
  let left = align === "end" ? rect.right - menuRect.width : rect.left;
  let top = rect.bottom + gap;
  left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
  if (top + menuRect.height > window.innerHeight - 8) top = Math.max(8, rect.top - menuRect.height - gap);
  node.style.left = `${left}px`;
  node.style.top = `${top}px`;

  const onOutside = (event) => { if (!node.contains(event.target)) closeMenu(); };
  const onKey = (event) => {
    if (event.key === "Escape") { event.stopPropagation(); closeMenu(); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = qsa(".menu__item", node);
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    buttons[(next + buttons.length) % buttons.length]?.focus();
  };
  document.addEventListener("pointerdown", onOutside, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", closeMenu);
  window.addEventListener("scroll", closeMenu, true);
  openMenu = { node, onOutside, onKey };
  return node;
}
