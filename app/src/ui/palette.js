import { h, mount, qsa, trapFocus } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { store } from "../store/state.js";
import { router } from "../router.js";
import { searchAll } from "../store/selectors.js";
import { setSetting } from "../store/actions.js";

let open = null;

export function closePalette() {
  if (!open) return false;
  open.scrim.remove();
  open.node.remove();
  open.release?.();
  document.removeEventListener("keydown", open.onKey, true);
  open.previous?.focus?.();
  open = null;
  return true;
}

export const paletteOpen = () => Boolean(open);

function baseCommands() {
  return [
    { group: "Create", title: "New task", icon: "plus", hint: "N", run: async () => (await import("./quickadd.js")).openQuickAdd() },
    { group: "Create", title: "New project", icon: "board", hint: "P", run: async () => (await import("./dialogs.js")).openNewProject() },
    { group: "Create", title: "New page", icon: "layers", run: async () => (await import("./dialogs.js")).openNewPage() },
    { group: "Create", title: "New note", icon: "note", run: async () => {
        const { createNote } = await import("../store/actions.js");
        const id = createNote({ title: "" });
        router.navigate(`#/notes?note=${id}`);
      } },
    { group: "Create", title: "New habit", icon: "repeat", run: async () => (await import("./dialogs.js")).openHabitDialog() },
    { group: "Go to", title: "Today", icon: "home", href: "#/today" },
    { group: "Go to", title: "Upcoming", icon: "arrow-right", href: "#/upcoming" },
    { group: "Go to", title: "All tasks", icon: "check-square", href: "#/tasks" },
    { group: "Go to", title: "Inbox", icon: "inbox", href: "#/inbox" },
    { group: "Go to", title: "Projects", icon: "board", href: "#/projects" },
    { group: "Go to", title: "Calendar", icon: "calendar", href: "#/calendar" },
    { group: "Go to", title: "Pages", icon: "layers", href: "#/pages" },
    { group: "Go to", title: "Habits", icon: "repeat", href: "#/habits" },
    { group: "Go to", title: "Notes", icon: "note", href: "#/notes" },
    { group: "Go to", title: "Review", icon: "chart", href: "#/review" },
    { group: "Go to", title: "Settings", icon: "settings", href: "#/settings" },
    {
      group: "Do", title: "Toggle light / dark theme", icon: "moon",
      run: () => setSetting("theme", store.state.settings.theme === "dark" ? "light" : "dark"),
    },
    { group: "Do", title: "Start or pause the focus timer", icon: "timer", hint: "F", run: async () => (await import("./timer.js")).toggle() },
    { group: "Do", title: "Undo last change", icon: "reset", run: () => store.undo() },
    { group: "Do", title: "Export data as JSON", icon: "download", run: async () => (await import("../views/settings.js")).exportData() },
    { group: "Do", title: "Keyboard shortcuts", icon: "command", hint: "?", run: async () => (await import("./dialogs.js")).openShortcuts() },
  ];
}

function collect(query) {
  const state = store.state;
  const q = query.trim().toLowerCase();
  const commands = baseCommands();

  if (!q) {
    const recentProjects = state.projects.filter((p) => !p.archived).slice(0, 4).map((project) => ({
      group: "Projects", title: project.name, icon: "board", href: `#/projects/${project.id}`,
    }));
    const pages = state.pages.slice(0, 4).map((page) => ({
      group: "Pages", title: page.name, icon: page.icon || "note", href: `#/pages/${page.id}`,
    }));
    return [...commands.filter((c) => c.group === "Create"), ...recentProjects, ...pages, ...commands.filter((c) => c.group !== "Create")];
  }

  const matched = commands.filter((command) => command.title.toLowerCase().includes(q));
  const results = searchAll(state, q).map((result) => ({
    group: result.kind === "task" ? "Tasks" : result.kind === "record" ? "Entries" : `${result.kind[0].toUpperCase()}${result.kind.slice(1)}s`,
    title: result.title, sub: result.sub, icon: result.icon, href: result.href,
  }));
  return [...results, ...matched];
}

export function openPalette(initialQuery = "") {
  if (open) { open.input.focus(); open.input.select(); return; }
  const previous = document.activeElement;
  let items = [];
  let active = 0;

  const list = h("div", { class: "palette__list", role: "listbox" });
  const input = h("input", {
    class: "palette__input", placeholder: "Search tasks, projects, entries — or run a command",
    value: initialQuery, "aria-label": "Search",
    onInput: () => refresh(),
  });

  const run = (item) => {
    closePalette();
    if (item.href) router.navigate(item.href);
    else item.run?.();
  };

  const refresh = () => {
    items = collect(input.value);
    active = 0;
    draw();
  };

  const draw = () => {
    const nodes = [];
    let group = null;
    items.forEach((item, index) => {
      if (item.group !== group) {
        group = item.group;
        nodes.push(h("div", { class: "palette__group" }, group));
      }
      nodes.push(
        h(
          "button",
          {
            class: "palette__item", role: "option", dataset: { active: String(index === active), index: String(index) },
            onClick: () => run(item),
            onMousemove: () => { if (active !== index) { active = index; paint(); } },
          },
          h("span", { class: "palette__icon" }, icon(item.icon || "circle", 15)),
          h("span", { class: "u-col u-grow", style: { gap: "1px", minWidth: 0 } },
            h("span", { class: "u-truncate", style: { fontSize: "13.5px" } }, item.title),
            item.sub ? h("span", { class: "u-dim u-truncate", style: { fontSize: "11.5px" } }, item.sub) : null),
          item.hint ? h("span", { class: "kbd" }, item.hint) : null
        )
      );
    });
    if (!items.length) {
      nodes.push(h("div", { class: "empty", style: { padding: "26px 12px" } },
        h("div", { class: "empty__title" }, "Nothing matches"),
        h("p", { class: "empty__text" }, "Try a different word, or press Escape to close.")));
    }
    mount(list, ...nodes);
  };

  const paint = () => {
    for (const node of qsa(".palette__item", list)) {
      const on = Number(node.dataset.index) === active;
      node.dataset.active = String(on);
      if (on) node.scrollIntoView({ block: "nearest" });
    }
  };

  const onKey = (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closePalette(); return; }
    if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
      event.preventDefault();
      active = Math.min(items.length - 1, active + 1);
      paint();
    } else if (event.key === "ArrowUp" || (event.key === "p" && event.ctrlKey)) {
      event.preventDefault();
      active = Math.max(0, active - 1);
      paint();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (items[active]) run(items[active]);
    }
  };

  const scrim = h("div", { class: "scrim", onClick: () => closePalette() });
  const node = h(
    "div", { class: "palette", role: "dialog", "aria-modal": "true", "aria-label": "Command palette" },
    h("div", { class: "palette__search" }, icon("search", 17), input),
    list,
    h(
      "div", { class: "palette__foot" },
      h("span", null, h("kbd", null, "↑"), " ", h("kbd", null, "↓"), " to move"),
      h("span", null, h("kbd", null, "↵"), " to open"),
      h("span", null, h("kbd", null, "esc"), " to close")
    )
  );

  document.addEventListener("keydown", onKey, true);
  document.getElementById("overlays").append(scrim, node);
  const release = trapFocus(node);
  open = { node, scrim, onKey, previous, input, release };
  refresh();
  input.focus();
  input.select();
}
