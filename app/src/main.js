import { h, mount } from "./lib/dom.js";
import { store } from "./store/state.js";
import { router, startRouter } from "./router.js";
import { renderRail, renderSidebar, renderTopbar, ui } from "./ui/shell.js";
import { ACCENTS } from "./ui/controls.js";
import { openPalette, paletteOpen } from "./ui/palette.js";
import { openQuickAdd } from "./ui/quickadd.js";
import { openNewProject, openShortcuts } from "./ui/dialogs.js";
import { modalOpen } from "./ui/modal.js";
import { closeMenu } from "./ui/menu.js";
import { drawerOpen, closeDrawer, drawerKey, openTaskDrawer, openRecordDrawer } from "./ui/drawer.js";
import { toast } from "./ui/toast.js";
import { toggle as toggleTimer } from "./ui/timer.js";
import { start as startSync } from "./store/sync.js";

import { todayView } from "./views/today.js";
import { tasksView } from "./views/tasks.js";
import { projectView } from "./views/project.js";
import { projectsView } from "./views/projects.js";
import { calendarView } from "./views/calendar.js";
import { pageView, pagesIndexView } from "./views/page.js";
import { habitsView } from "./views/habits.js";
import { notesView } from "./views/notes.js";
import { reviewView } from "./views/review.js";
import { settingsView } from "./views/settings.js";

const app = document.getElementById("app");
const scrollMemory = new Map();

const ROUTES = {
  today: todayView,
  tasks: tasksView,
  upcoming: tasksView,
  inbox: tasksView,
  tags: tasksView,
  projects: (ctx) => (ctx.route.parts[1] ? projectView(ctx) : projectsView(ctx)),
  pages: (ctx) => (ctx.route.parts[1] ? pageView(ctx) : pagesIndexView(ctx)),
  calendar: calendarView,
  habits: habitsView,
  notes: notesView,
  review: reviewView,
  settings: settingsView,
};

/* ---------------- theme ---------------- */

function applyTheme(state) {
  const root = document.documentElement;
  root.dataset.theme = state.settings.theme === "light" ? "light" : "dark";
  const accent = ACCENTS.find((a) => a.id === state.settings.accent) || ACCENTS[0];
  root.style.setProperty("--accent-h", String(accent.h));
  root.style.setProperty("--accent-s", accent.s);
  root.style.setProperty("--accent-l", accent.l);
}

/* ---------------- focus & scroll preservation ---------------- */

function pathOf(node, root) {
  const path = [];
  let current = node;
  while (current && current !== root) {
    const parent = current.parentNode;
    if (!parent) return null;
    path.push([...parent.children].indexOf(current));
    current = parent;
  }
  return current === root ? path.reverse() : null;
}

function nodeAt(root, path) {
  let current = root;
  for (const index of path) {
    current = current?.children?.[index];
    if (!current) return null;
  }
  return current;
}

function captureFocus() {
  const active = document.activeElement;
  if (!active || !app.contains(active)) return null;
  const path = pathOf(active, app);
  if (!path) return null;
  const isText = active.tagName === "INPUT" || active.tagName === "TEXTAREA";
  return {
    path,
    start: isText ? active.selectionStart : null,
    end: isText ? active.selectionEnd : null,
    value: isText ? active.value : null,
  };
}

function restoreFocus(snapshot) {
  if (!snapshot) return;
  const node = nodeAt(app, snapshot.path);
  if (!node || typeof node.focus !== "function") return;
  node.focus({ preventScroll: true });
  if (snapshot.start !== null && typeof node.setSelectionRange === "function") {
    if (snapshot.value !== null && node.value !== snapshot.value) return;
    try { node.setSelectionRange(snapshot.start, snapshot.end); } catch { /* not selectable */ }
  }
}

/* ---------------- render ---------------- */

let renderScheduled = false;

function render() {
  renderScheduled = false;
  const state = store.state;
  const route = router.current;
  applyTheme(state);

  const previousView = app.querySelector(".view");
  if (previousView) scrollMemory.set(scrollMemory.lastKey || route.path, previousView.scrollTop);
  const focusSnapshot = captureFocus();

  closeMenu();
  const factory = ROUTES[route.name] || todayView;
  let result;
  try {
    result = factory({ state, route });
  } catch (error) {
    console.error("Dezk: view failed to render.", error);
    result = {
      topbar: { crumbs: [{ label: "Dezk" }], title: "Something went wrong" },
      body: h("div", { class: "view__inner" },
        h("p", { class: "u-muted" }, "This screen could not be drawn. The details are in the browser console."),
        h("button", { class: "btn", onClick: () => location.reload() }, "Reload")),
    };
  }

  const view = h("main", { class: ["view", result.wide && "view--wide"].filter(Boolean).join(" ") }, result.body);
  const main = h("div", { class: "main" }, renderTopbar(result.topbar), view);

  const sidebarVisible = ui.sidebarVisible();
  app.dataset.sidebar = sidebarVisible ? "open" : "collapsed";
  app.removeAttribute("aria-busy");
  mount(
    app,
    renderRail(state),
    sidebarVisible ? renderSidebar(state) : h("div", { class: "sidebar", hidden: true }),
    main,
    sidebarVisible && ui.isNarrow()
      ? h("div", { class: "sidebar-scrim", onClick: () => { ui.closeMobileNav(); store.emit(); } })
      : null
  );

  const restored = scrollMemory.get(route.path);
  if (restored) view.scrollTop = restored;
  scrollMemory.lastKey = route.path;
  restoreFocus(focusSnapshot);
  syncDrawer(route);
  document.title = typeof result.topbar.title === "string" ? `${result.topbar.title} · Dezk` : "Dezk";
}

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(render);
}

/** Keep ?task= / ?record= in the URL in step with the open drawer. */
function syncDrawer(route) {
  const wantTask = route.query.task || null;
  const wantRecord = route.parts[0] === "pages" ? route.query.record || null : null;
  const want = wantTask ? `task:${wantTask}` : wantRecord ? `record:${wantRecord}` : null;
  const key = drawerKey();
  if (key === want) return;

  if (wantTask) {
    if (store.state.tasks.some((task) => task.id === wantTask)) openTaskDrawer(wantTask);
    else router.setQuery({ task: null });
    return;
  }
  if (wantRecord) {
    const page = store.state.pages.find((p) => p.id === route.parts[1]);
    if (page?.records.some((record) => record.id === wantRecord)) openRecordDrawer(page.id, wantRecord);
    else router.setQuery({ record: null });
    return;
  }
  // Navigated away from whatever the panel was showing.
  if (drawerOpen()) closeDrawer({ syncRoute: false });
}

/* ---------------- keyboard ---------------- */

let pendingGo = false;
let goTimer = null;

const GO_MAP = {
  t: "#/today", u: "#/upcoming", i: "#/inbox", a: "#/tasks", p: "#/projects",
  c: "#/calendar", g: "#/pages", h: "#/habits", n: "#/notes", r: "#/review", s: "#/settings",
};

function isTyping(event) {
  const target = event.target;
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
  );
}

document.addEventListener("keydown", (event) => {
  const meta = event.metaKey || event.ctrlKey;

  if (meta && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openPalette();
    return;
  }
  if (meta && event.key.toLowerCase() === "z") {
    if (isTyping(event)) return;
    event.preventDefault();
    const label = event.shiftKey ? store.redo() : store.undo();
    toast(label ? `${event.shiftKey ? "Redid" : "Undid"}: ${label.toLowerCase()}` : "Nothing to undo");
    return;
  }
  if (event.key === "Escape") return; // overlays close themselves
  if (isTyping(event) || meta || event.altKey) return;
  if (modalOpen() || paletteOpen()) return;

  const key = event.key.toLowerCase();

  if (pendingGo) {
    pendingGo = false;
    clearTimeout(goTimer);
    if (GO_MAP[key]) {
      event.preventDefault();
      router.navigate(GO_MAP[key]);
      return;
    }
  }

  switch (key) {
    case "g":
      pendingGo = true;
      goTimer = setTimeout(() => { pendingGo = false; }, 1200);
      break;
    case "n":
      event.preventDefault();
      openQuickAdd(defaultsForRoute());
      break;
    case "p":
      event.preventDefault();
      openNewProject();
      break;
    case "f":
      event.preventDefault();
      toggleTimer();
      break;
    case "/":
      event.preventDefault();
      openPalette();
      break;
    case "\\":
      event.preventDefault();
      ui.toggleSidebar();
      store.emit();
      break;
    case "?":
      event.preventDefault();
      openShortcuts();
      break;
    default:
      break;
  }
});

/** A new task started from a project board belongs to that project. */
function defaultsForRoute() {
  const route = router.current;
  if (route.parts[0] === "projects" && route.parts[1]) return { projectId: route.parts[1] };
  if (route.parts[0] === "today") return { due: new Date().toISOString().slice(0, 10) };
  return {};
}

/* ---------------- boot ---------------- */

store.subscribe(scheduleRender);
router.onChange(() => { ui.closeMobileNav(); render(); });

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(scheduleRender, 140);
});

applyTheme(store.state);
store.mutate((state) => { state.meta.lastOpened = new Date().toISOString(); }, { silent: true });
startRouter(store.state.settings.startPage || "#/today");
startSync();

// Offline shell. Only over http(s) — a service worker cannot register on file://.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(new URL("../sw.js", import.meta.url)).catch((error) => {
      console.warn("Dezk: offline support is unavailable here.", error);
    });
  });
}

// Surface a crash rather than leaving a blank screen behind.
window.addEventListener("error", (event) => {
  console.error("Dezk error:", event.error || event.message);
});

if (store.writeFailed) {
  toast("Changes cannot be saved in this browser — export a backup from Settings.");
}
