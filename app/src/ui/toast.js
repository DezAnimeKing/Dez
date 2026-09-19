import { h } from "../lib/dom.js";

let host = null;

function ensureHost() {
  if (!host) {
    host = h("div", { class: "toasts", role: "status", "aria-live": "polite" });
    document.getElementById("overlays").appendChild(host);
  }
  return host;
}

/**
 * @param {string} message
 * @param {{action?: {label: string, onClick: () => void}, duration?: number}} options
 */
export function toast(message, options = {}) {
  const { action = null, duration = action ? 6000 : 3200 } = options;
  const node = h(
    "div",
    { class: "toast" },
    h("span", null, message),
    action &&
      h("button", {
        class: "toast__action",
        onClick: () => { action.onClick(); dismiss(); },
      }, action.label)
  );
  const dismiss = () => {
    node.style.transition = "opacity 0.16s ease, translate 0.16s ease";
    node.style.opacity = "0";
    node.style.translate = "0 6px";
    setTimeout(() => node.remove(), 180);
  };
  ensureHost().appendChild(node);
  const timer = setTimeout(dismiss, duration);
  node.addEventListener("pointerenter", () => clearTimeout(timer));
  return dismiss;
}
