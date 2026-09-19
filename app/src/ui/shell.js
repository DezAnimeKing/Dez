import { h, mount } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { router } from "../router.js";
import { store } from "../store/state.js";
import { setSetting } from "../store/actions.js";
import { showMenu } from "./menu.js";
import {
  openTasks, dueTodayTasks, overdueTasks, inboxTasks, upcomingTasks,
  projectProgress, activeHabits,
} from "../store/selectors.js";
import { openPalette } from "./palette.js";
import { openNewProject, openNewPage } from "./dialogs.js";
import { openQuickAdd } from "./quickadd.js";
import { syncPill } from "./syncui.js";

const RAIL = [
  { href: "#/today", icon: "home", label: "Today" },
  { href: "#/tasks", icon: "check-square", label: "Tasks" },
  { href: "#/projects", icon: "board", label: "Projects" },
  { href: "#/calendar", icon: "calendar", label: "Calendar" },
  { href: "#/pages", icon: "layers", label: "Pages" },
  { href: "#/habits", icon: "repeat", label: "Habits" },
  { href: "#/notes", icon: "note", label: "Notes" },
  { href: "#/review", icon: "chart", label: "Review" },
];

/** Runtime-only UI state (not persisted). */
export const ui = {
  mobileNav: false,
  isNarrow: () => window.matchMedia("(max-width: 1080px)").matches,
  sidebarVisible() { return this.isNarrow() ? this.mobileNav : store.state.settings.sidebarOpen; },
  toggleSidebar() {
    if (this.isNarrow()) this.mobileNav = !this.mobileNav;
    else setSetting("sidebarOpen", !store.state.settings.sidebarOpen);
  },
  closeMobileNav() {
    if (!this.mobileNav) return false;
    this.mobileNav = false;
    return true;
  },
};

const isActive = (href) => {
  const current = router.current.path;
  if (href === "#/today") return current === "#/today";
  const base = href.replace(/^#\//, "").split("/")[0];
  return router.current.parts[0] === base;
};

function railButton({ href, icon: iconName, label, badge = 0 }) {
  return h(
    "a",
    {
      class: "rail__btn", href, title: label, "aria-label": label,
      "aria-current": isActive(href) ? "true" : null,
    },
    icon(iconName, 19),
    badge > 0 ? h("span", { class: "rail__dot" }) : null
  );
}

export function renderRail(state) {
  const overdue = overdueTasks(state).length;
  return h(
    "nav", { class: "rail", "aria-label": "Sections" },
    h("a", { class: "rail__logo", href: "#/today", "aria-label": "Dezk home" }, icon("layers", 18)),
    h(
      "div", { class: "rail__group" },
      ...RAIL.map((item) => railButton({ ...item, badge: item.href === "#/today" ? overdue : 0 }))
    ),
    h("div", { class: "rail__spacer" }),
    h(
      "div", { class: "rail__group" },
      h("button", { class: "rail__btn", title: "Search (Ctrl K)", "aria-label": "Search", onClick: () => openPalette() }, icon("search", 19)),
      h("a", { class: "rail__btn", href: "#/settings", title: "Settings", "aria-label": "Settings", "aria-current": isActive("#/settings") ? "true" : null }, icon("settings", 19)),
      h(
        "button",
        {
          class: "rail__btn", title: "Toggle theme", "aria-label": "Toggle theme",
          onClick: () => setSetting("theme", state.settings.theme === "dark" ? "light" : "dark"),
        },
        icon(state.settings.theme === "dark" ? "moon" : "sun", 19)
      )
    )
  );
}

function navItem({ href, label, iconName = null, count = null, swatch = null, hash = false, tone = null }) {
  return h(
    "a",
    { class: "nav-item", href, "aria-current": router.current.path === href.split("?")[0] ? "page" : null },
    swatch ? h("span", { class: "nav-item__swatch", style: { background: swatch } }) : null,
    iconName ? icon(iconName, 16) : null,
    hash ? h("span", { class: "nav-item__hash" }, "#") : null,
    h("span", { class: "u-truncate u-grow" }, label),
    count !== null && count !== undefined && count !== 0
      ? h("span", { class: "nav-item__count", dataset: { tone } }, String(count))
      : null
  );
}

function section(id, title, children, { onAdd = null, addLabel = "Add" } = {}) {
  const openKey = `dezk.section.${id}`;
  let open = localStorage.getItem(openKey) !== "closed";
  const list = h("div", { class: "nav-section__list" }, ...children);
  const node = h(
    "div", { class: "nav-section", dataset: { open: String(open) } },
    h(
      "div", { class: "u-row", style: { gap: "0" } },
      h(
        "button",
        {
          class: "nav-section__head u-grow",
          onClick: () => {
            open = !open;
            node.dataset.open = String(open);
            try { localStorage.setItem(openKey, open ? "open" : "closed"); } catch { /* ignore */ }
          },
        },
        icon("chevron-down", 13),
        title
      ),
      onAdd
        ? h("button", { class: "nav-section__add", "aria-label": addLabel, title: addLabel, onClick: onAdd, style: { padding: "6px" } }, icon("plus", 14))
        : null
    ),
    list
  );
  return node;
}

export function renderSidebar(state) {
  const today = dueTodayTasks(state).length + overdueTasks(state).length;
  const projects = state.projects.filter((p) => !p.archived);
  const favorites = projects.filter((p) => p.favorite);
  const byCategory = new Map();
  for (const project of projects.filter((p) => !p.favorite)) {
    const key = project.categoryId || "__none";
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(project);
  }

  const projectNodes = [];
  if (favorites.length) {
    projectNodes.push(h("div", { class: "nav-section__head", style: { paddingTop: "2px" } }, icon("star", 12), "Favourites"));
    for (const project of favorites) {
      projectNodes.push(navItem({
        href: `#/projects/${project.id}`, label: project.name, swatch: project.color,
        count: projectProgress(state, project.id).total - projectProgress(state, project.id).done,
      }));
    }
  }
  for (const [categoryId, list] of byCategory) {
    const category = state.categories.find((c) => c.id === categoryId);
    projectNodes.push(
      h("div", { class: "nav-section__head", style: { paddingTop: "2px" } }, category ? category.name : "Unsorted")
    );
    for (const project of list) {
      const progress = projectProgress(state, project.id);
      projectNodes.push(navItem({
        href: `#/projects/${project.id}`, label: project.name, swatch: project.color,
        count: progress.total - progress.done,
      }));
    }
  }
  projectNodes.push(navItem({ href: "#/projects", label: "All projects", iconName: "grid" }));

  const pageNodes = state.pages.map((page) =>
    navItem({ href: `#/pages/${page.id}`, label: page.name, iconName: page.icon || "note", count: page.records?.length || 0 })
  );
  pageNodes.push(
    h("button", { class: "nav-item", onClick: () => openNewPage() }, icon("plus", 16), h("span", { class: "u-grow" }, "New page"))
  );

  const closeOnNavigate = (event) => {
    if (ui.isNarrow() && event.target.closest("a[href^='#/']")) {
      ui.mobileNav = false;
      requestAnimationFrame(() => store.emit());
    }
  };

  return h(
    "aside", { class: "sidebar", "aria-label": "Navigation", onClick: closeOnNavigate },
    h(
      "div", { class: "sidebar__head" },
      h("div", { class: "sidebar__title" }, "Dezk"),
      h(
        "button",
        { class: "btn btn--ghost btn--icon btn--sm", "aria-label": "Hide sidebar", title: "Hide sidebar (\\)",
          onClick: () => { ui.toggleSidebar(); store.emit(); } },
        icon("panel", 16)
      )
    ),
    h(
      "button", { class: "side-search", onClick: () => openPalette() },
      icon("search", 15),
      h("span", null, "Search"),
      h("kbd", null, navigator.platform?.includes("Mac") ? "⌘K" : "Ctrl K")
    ),
    h(
      "div", { class: "sidebar__body" },
      section("plan", "Plan", [
        navItem({ href: "#/today", label: "Today", iconName: "home", count: today, tone: "accent" }),
        navItem({ href: "#/upcoming", label: "Upcoming", iconName: "arrow-right", count: upcomingTasks(state).length }),
        navItem({ href: "#/calendar", label: "Calendar", iconName: "calendar" }),
        navItem({ href: "#/inbox", label: "Inbox", iconName: "inbox", count: inboxTasks(state).length }),
        navItem({ href: "#/tasks", label: "All tasks", iconName: "check-square", count: openTasks(state).length }),
      ]),
      section("projects", "Projects", projectNodes, { onAdd: () => openNewProject(), addLabel: "New project" }),
      section("pages", "Pages", pageNodes, { onAdd: () => openNewPage(), addLabel: "New page" }),
      section("track", "Track", [
        navItem({ href: "#/habits", label: "Habits", iconName: "repeat", count: activeHabits(state).length }),
        navItem({ href: "#/notes", label: "Notes", iconName: "note", count: state.notes.length }),
        navItem({ href: "#/review", label: "Review", iconName: "chart" }),
      ])
    ),
    h(
      "div", { class: "sidebar__foot" },
      syncPill(),
      h("button", { class: "btn btn--primary btn--block", onClick: () => openQuickAdd() }, icon("plus", 16), "New task")
    )
  );
}

/**
 * @param {{crumbs?: Array, title: Node|string, subtitle?: string, tools?: Array, status?: string}} config
 */
export function renderTopbar(config) {
  const { crumbs = [], title, subtitle = null, tools = [], status = null, titleExtra = null } = config;
  return h(
    "header", { class: "topbar" },
    h(
      "div", { class: "topbar__crumbs" },
      ui.sidebarVisible()
        ? null
        : h("button", { class: "btn btn--ghost btn--icon btn--sm", "aria-label": "Show sidebar", title: "Show sidebar (\\)", onClick: () => { ui.toggleSidebar(); store.emit(); } }, icon("panel", 15)),
      ...crumbs.flatMap((crumb, index) => [
        index > 0 ? h("span", null, "/") : null,
        crumb.href ? h("a", { href: crumb.href }, crumb.label) : h("span", null, crumb.label),
      ]),
      status ? h("div", { class: "topbar__status u-dim" }, h("span", { class: "dot dot--live" }), status) : null
    ),
    h(
      "div", { class: "topbar__main" },
      h("div", { class: "u-col" },
        h("h1", { class: "topbar__title" }, title, titleExtra),
        subtitle ? h("div", { class: "topbar__sub" }, subtitle) : null),
      tools.length ? h("div", { class: "topbar__tools" }, ...tools) : null
    )
  );
}

export function viewSwitcher(views, current, onPick) {
  return h(
    "button",
    {
      class: "btn btn--sm",
      onClick: (event) =>
        showMenu(event.currentTarget, views.map((v) => ({
          label: v.name, icon: v.icon, active: v.id === current, onClick: () => onPick(v.id),
        }))),
    },
    icon(views.find((v) => v.id === current)?.icon || "grid", 15),
    views.find((v) => v.id === current)?.name || "View",
    icon("chevron-down", 13)
  );
}

export function mountShell(root, { rail, sidebar, main }) {
  return mount(root, rail, sidebar, main);
}
