/* Hash routing. No history library, no build step — the URL is the state,
 * so the back button and a bookmarked page both work. */

const routes = [];
let notFound = null;
let current = null;

export function route(pattern, handler) {
  // "/page/:id" → /^\/page\/([^/]+)$/
  const names = [];
  const source = pattern.replace(/:([A-Za-z]+)/g, (_, name) => { names.push(name); return '([^/]+)'; });
  routes.push({ regex: new RegExp(`^${source}$`), names, handler, pattern });
}

export function fallback(handler) { notFound = handler; }

export function path() {
  return (location.hash.replace(/^#/, '') || '/').split('?')[0];
}

export function go(to, { replace = false } = {}) {
  const hash = `#${to}`;
  if (location.hash === hash) { resolve(); return; }
  if (replace) location.replace(hash);
  else location.hash = hash;
}

export function back(fallbackPath = '/') {
  if (history.length > 1) history.back();
  else go(fallbackPath);
}

export function currentRoute() { return current; }

export function resolve() {
  const here = path();
  for (const { regex, names, handler, pattern } of routes) {
    const match = regex.exec(here);
    if (!match) continue;
    const params = Object.fromEntries(names.map((name, i) => [name, decodeURIComponent(match[i + 1])]));
    current = { pattern, path: here, params };
    handler(params);
    return;
  }
  current = { pattern: null, path: here, params: {} };
  notFound?.(here);
}

export function start() {
  addEventListener('hashchange', resolve);
  resolve();
}
