// Tiny hyperscript over real DOM nodes. No virtual DOM, no dependencies.

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set(["svg", "path", "circle", "rect", "line", "g", "polyline", "polygon", "ellipse", "text"]);

export function h(tag, props = null, ...children) {
  if (typeof tag === "function") return tag({ ...(props || {}), children });
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "class" || key === "className") {
        el.setAttribute("class", Array.isArray(value) ? value.filter(Boolean).join(" ") : value);
      } else if (key === "style" && typeof value === "object") {
        Object.assign(el.style, value);
      } else if (key === "dataset") {
        for (const [dk, dv] of Object.entries(value)) {
          if (dv !== null && dv !== undefined) el.dataset[dk] = String(dv);
        }
      } else if (key === "ref" && typeof value === "function") {
        value(el);
      } else if (key.startsWith("on") && typeof value === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === "html") {
        el.innerHTML = value;
      } else if (key === "value" && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) {
        el.value = value;
      } else if (key === "checked" || key === "disabled" || key === "selected" || key === "autofocus") {
        el[key] = Boolean(value);
        if (value === true) el.setAttribute(key, "");
      } else {
        el.setAttribute(key, value === true ? "" : String(value));
      }
    }
  }
  append(el, children);
  return el;
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function frag(...children) {
  return append(document.createDocumentFragment(), children);
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(node, ...children) {
  return append(clear(node), children);
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Debounce that also exposes .flush() so pending edits aren't lost on close. */
export function debounce(fn, wait = 260) {
  let timer = null;
  let lastArgs = null;
  const wrapped = (...args) => {
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...lastArgs); }, wait);
  };
  wrapped.flush = () => {
    if (timer) { clearTimeout(timer); timer = null; fn(...lastArgs); }
  };
  wrapped.cancel = () => { clearTimeout(timer); timer = null; };
  return wrapped;
}

/** Focus + place the caret at the end of an input/textarea. */
export function focusEnd(el) {
  if (!el) return;
  el.focus();
  const len = el.value?.length ?? 0;
  try { el.setSelectionRange(len, len); } catch { /* not a text input */ }
}

/** Trap Tab inside a container while it is open. */
export function trapFocus(container) {
  const selector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const onKey = (event) => {
    if (event.key !== "Tab") return;
    const nodes = qsa(selector, container).filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  container.addEventListener("keydown", onKey);
  return () => container.removeEventListener("keydown", onKey);
}
