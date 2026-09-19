// Hash routing: "#/pages/pg_x?record=r_y" -> { parts: ["pages","pg_x"], query: {record:"r_y"} }

const listeners = new Set();

function parse(hash) {
  const raw = (hash || "").replace(/^#\/?/, "");
  const [pathPart, queryPart] = raw.split("?");
  const parts = pathPart.split("/").filter(Boolean);
  const query = {};
  if (queryPart) {
    for (const [key, value] of new URLSearchParams(queryPart)) query[key] = value;
  }
  return { path: `#/${parts.join("/")}`, parts, query, name: parts[0] || "today" };
}

export const router = {
  current: parse(location.hash),
  navigate(href, { replace = false } = {}) {
    const next = href.startsWith("#") ? href : `#${href.startsWith("/") ? "" : "/"}${href}`;
    if (next === location.hash) { this.current = parse(next); this.emit(); return; }
    if (replace) history.replaceState(null, "", next);
    else location.hash = next;
    if (replace) { this.current = parse(next); this.emit(); }
  },
  /** Change one query param without touching the path. */
  setQuery(patch, { replace = true } = {}) {
    const query = { ...this.current.query, ...patch };
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === "") delete query[key];
    }
    const search = new URLSearchParams(query).toString();
    this.navigate(`${this.current.path}${search ? `?${search}` : ""}`, { replace });
  },
  onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  emit() {
    for (const listener of [...listeners]) listener(this.current);
  },
};

window.addEventListener("hashchange", () => {
  router.current = parse(location.hash);
  router.emit();
});

export function startRouter(fallback = "#/today") {
  if (!location.hash || location.hash === "#" || location.hash === "#/") {
    history.replaceState(null, "", fallback);
  }
  router.current = parse(location.hash);
  router.emit();
}
