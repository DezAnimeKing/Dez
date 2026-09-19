// Offline shell for Dezk. The app is a handful of static files, so they are
// pre-cached on install and served cache-first; anything under /api/ always
// goes to the network, because stale sync responses would be worse than none.

const VERSION = "dezk-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/favicon.svg",
  "./assets/icon.svg",
  "./styles/tokens.css",
  "./styles/base.css",
  "./styles/layout.css",
  "./styles/components.css",
  "./styles/views.css",
  "./src/main.js",
  "./src/router.js",
  "./src/lib/dom.js",
  "./src/lib/date.js",
  "./src/lib/icons.js",
  "./src/lib/id.js",
  "./src/lib/parse.js",
  "./src/store/state.js",
  "./src/store/seed.js",
  "./src/store/selectors.js",
  "./src/store/actions.js",
  "./src/store/templates.js",
  "./src/store/entities.js",
  "./src/store/sync.js",
  "./src/ui/shell.js",
  "./src/ui/controls.js",
  "./src/ui/dialogs.js",
  "./src/ui/drawer.js",
  "./src/ui/menu.js",
  "./src/ui/modal.js",
  "./src/ui/palette.js",
  "./src/ui/quickadd.js",
  "./src/ui/syncui.js",
  "./src/ui/timer.js",
  "./src/ui/toast.js",
  "./src/views/parts.js",
  "./src/views/today.js",
  "./src/views/tasks.js",
  "./src/views/project.js",
  "./src/views/projects.js",
  "./src/views/calendar.js",
  "./src/views/page.js",
  "./src/views/habits.js",
  "./src/views/notes.js",
  "./src/views/review.js",
  "./src/views/settings.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      // One missing file should not sink the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((path) => cache.add(path))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return; // never cache sync traffic
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: url.pathname.endsWith("/") }).then((cached) => {
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached || caches.match("./index.html"));
      // Cache first so the app opens instantly, but refresh in the background.
      return cached || fresh;
    })
  );
});
