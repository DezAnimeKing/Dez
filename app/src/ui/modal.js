import { h, trapFocus, focusEnd } from "../lib/dom.js";
import { icon } from "../lib/icons.js";

const stack = [];

export function closeTopModal() {
  const top = stack.pop();
  if (!top) return false;
  top.scrim.remove();
  top.node.remove();
  top.release?.();
  document.removeEventListener("keydown", top.onKey, true);
  top.previous?.focus?.();
  top.onClose?.();
  return true;
}

export const modalOpen = () => stack.length > 0;

/**
 * @param {{title?: string, body: Node|Node[], footer?: Node|Node[], wide?: boolean,
 *          onClose?: () => void, initialFocus?: string}} options
 */
export function openModal(options) {
  const { title = "", body, footer = null, wide = false, onClose = null, initialFocus = null } = options;
  const previous = document.activeElement;

  const scrim = h("div", { class: "scrim", onClick: () => closeTopModal() });
  const node = h(
    "div",
    { class: ["modal", wide && "modal--wide"], role: "dialog", "aria-modal": "true", "aria-label": title || "Dialog" },
    title
      ? h(
          "div", { class: "modal__head" },
          h("div", { class: "modal__title u-grow" }, title),
          h("button", { class: "btn btn--ghost btn--icon btn--sm", "aria-label": "Close", onClick: () => closeTopModal() }, icon("x", 16))
        )
      : null,
    h("div", { class: "modal__body" }, ...[].concat(body)),
    footer ? h("div", { class: "modal__foot" }, ...[].concat(footer)) : null
  );

  const onKey = (event) => {
    if (event.key === "Escape" && stack[stack.length - 1]?.node === node) {
      event.preventDefault();
      event.stopPropagation();
      closeTopModal();
    }
  };
  document.addEventListener("keydown", onKey, true);

  const overlays = document.getElementById("overlays");
  overlays.append(scrim, node);
  const release = trapFocus(node);
  stack.push({ node, scrim, onKey, onClose, previous, release });

  const target = initialFocus ? node.querySelector(initialFocus) : node.querySelector("input, textarea, select, button");
  if (target) (target.tagName === "INPUT" || target.tagName === "TEXTAREA" ? focusEnd : (el) => el.focus())(target);
  return { node, close: closeTopModal };
}

export function confirmDialog({ title, message, confirmLabel = "Delete", danger = true, onConfirm }) {
  openModal({
    title,
    body: h("p", { class: "u-muted", style: { fontSize: "13.5px", lineHeight: "1.6" } }, message),
    footer: [
      h("div", { class: "u-grow" }),
      h("button", { class: "btn", onClick: () => closeTopModal() }, "Cancel"),
      h(
        "button",
        {
          class: danger ? "btn btn--danger" : "btn btn--primary",
          onClick: () => { closeTopModal(); onConfirm(); },
        },
        confirmLabel
      ),
    ],
    initialFocus: ".btn--danger, .btn--primary",
  });
}

export function promptDialog({ title, label = "Name", value = "", placeholder = "", confirmLabel = "Save", onConfirm }) {
  let input;
  const submit = () => {
    const next = input.value.trim();
    if (!next) return;
    closeTopModal();
    onConfirm(next);
  };
  openModal({
    title,
    body: h(
      "label", { class: "field" },
      h("span", { class: "field__label" }, label),
      (input = h("input", {
        class: "input", value, placeholder,
        onKeydown: (event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } },
      }))
    ),
    footer: [
      h("div", { class: "u-grow" }),
      h("button", { class: "btn", onClick: () => closeTopModal() }, "Cancel"),
      h("button", { class: "btn btn--primary", onClick: submit }, confirmLabel),
    ],
    initialFocus: "input",
  });
}
