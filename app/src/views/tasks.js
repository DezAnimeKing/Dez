import { h } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { router } from "../router.js";
import { showMenu } from "../ui/menu.js";
import { taskRow, inlineAdd, groupHeader } from "./parts.js";
import { emptyState } from "../ui/controls.js";
import { openQuickAdd } from "../ui/quickadd.js";
import { setSetting } from "../store/actions.js";
import { activeTasks, openTasks, isDone, sortTasks, projectById, upcomingTasks, inboxTasks, allTags, PRIORITIES, priorityRank } from "../store/selectors.js";
import { todayKey, diffDays, shiftKey } from "../lib/date.js";

const GROUPINGS = [
  { id: "date", name: "Date", icon: "calendar" },
  { id: "project", name: "Project", icon: "board" },
  { id: "priority", name: "Priority", icon: "flag" },
  { id: "tag", name: "Tag", icon: "tag" },
  { id: "none", name: "No grouping", icon: "list" },
];

const SCOPES = {
  tasks: { title: "All tasks", crumb: "Tasks", icon: "check-square" },
  upcoming: { title: "Upcoming", crumb: "Upcoming", icon: "arrow-right" },
  inbox: { title: "Inbox", crumb: "Inbox", icon: "inbox" },
  tags: { title: "Tag", crumb: "Tags", icon: "tag" },
};

function scopeTasks(state, scope, param) {
  switch (scope) {
    case "upcoming":
      return upcomingTasks(state, 30);
    case "inbox":
      return sortTasks(inboxTasks(state), state);
    case "tags":
      return sortTasks(activeTasks(state).filter((task) => (task.tags || []).includes(param)), state);
    default:
      return sortTasks(activeTasks(state), state);
  }
}

function dateBucket(task, state) {
  if (isDone(state, task)) return { key: "zz-done", label: "Completed" };
  if (!task.due) return { key: "zy-someday", label: "No date" };
  const delta = diffDays(task.due);
  if (delta < 0) return { key: "a-overdue", label: "Overdue" };
  if (delta === 0) return { key: "b-today", label: "Today" };
  if (delta === 1) return { key: "c-tomorrow", label: "Tomorrow" };
  if (delta <= 7) return { key: "d-week", label: "This week" };
  if (delta <= 30) return { key: "e-month", label: "This month" };
  return { key: "f-later", label: "Later" };
}

function groupTasks(state, tasks, grouping) {
  const groups = new Map();
  const push = (key, label, task, order = 0) => {
    if (!groups.has(key)) groups.set(key, { label, tasks: [], order });
    groups.get(key).tasks.push(task);
  };

  for (const task of tasks) {
    if (grouping === "date") {
      const bucket = dateBucket(task, state);
      push(bucket.key, bucket.label, task);
    } else if (grouping === "project") {
      const project = projectById(state, task.projectId);
      push(project?.id || "zz-inbox", project?.name || "Inbox", task);
    } else if (grouping === "priority") {
      const priority = PRIORITIES.find((p) => p.id === task.priority) || PRIORITIES[3];
      push(`${priorityRank(task.priority)}-${priority.id}`, priority.name, task);
    } else if (grouping === "tag") {
      const tags = task.tags?.length ? task.tags : ["__none"];
      for (const tag of tags) push(tag, tag === "__none" ? "No tag" : `#${tag}`, task);
    } else {
      push("all", "All", task);
    }
  }

  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, group]) => ({ key, ...group }));
}

export function tasksView({ state, route }) {
  const scope = route.parts[0] === "tags" ? "tags" : SCOPES[route.parts[0]] ? route.parts[0] : "tasks";
  const param = route.parts[1] || null;
  const query = route.query;
  const grouping = query.group || (scope === "inbox" ? "none" : "date");
  const filterProject = query.project || null;
  const filterPriority = query.priority || null;
  const search = (query.q || "").toLowerCase();
  const showDone = state.settings.showCompleted;

  let tasks = scopeTasks(state, scope, param);
  if (!showDone) tasks = tasks.filter((task) => !isDone(state, task));
  if (filterProject) tasks = tasks.filter((task) => (filterProject === "none" ? !task.projectId : task.projectId === filterProject));
  if (filterPriority) tasks = tasks.filter((task) => task.priority === filterPriority);
  if (search) {
    tasks = tasks.filter((task) =>
      `${task.title} ${task.notes} ${(task.tags || []).join(" ")}`.toLowerCase().includes(search));
  }

  const groups = groupTasks(state, tasks, grouping);
  const project = filterProject && filterProject !== "none" ? projectById(state, filterProject) : null;

  const filterChip = (label, iconName, active, onClick) =>
    h("button", { class: ["btn", "btn--sm", active && "btn--primary"].filter(Boolean).join(" "), onClick }, icon(iconName, 14), label);

  const bar = h(
    "div", { class: "filterbar" },
    filterChip(
      GROUPINGS.find((g) => g.id === grouping)?.name || "Group",
      "layers", false,
      (event) => showMenu(event.currentTarget, GROUPINGS.map((option) => ({
        label: option.name, icon: option.icon, active: option.id === grouping,
        onClick: () => router.setQuery({ group: option.id }),
      })))
    ),
    filterChip(
      project ? project.name : filterProject === "none" ? "Inbox" : "Project",
      "board", Boolean(filterProject),
      (event) => showMenu(event.currentTarget, [
        { label: "Any project", icon: "grid", active: !filterProject, onClick: () => router.setQuery({ project: null }) },
        { label: "Inbox only", icon: "inbox", active: filterProject === "none", onClick: () => router.setQuery({ project: "none" }) },
        { separator: true },
        ...state.projects.filter((p) => !p.archived).map((p) => ({
          label: p.name, icon: "board", active: filterProject === p.id,
          onClick: () => router.setQuery({ project: p.id }),
        })),
      ])
    ),
    filterChip(
      filterPriority ? PRIORITIES.find((p) => p.id === filterPriority)?.name : "Priority",
      "flag", Boolean(filterPriority),
      (event) => showMenu(event.currentTarget, [
        { label: "Any priority", icon: "minus", active: !filterPriority, onClick: () => router.setQuery({ priority: null }) },
        ...PRIORITIES.map((p) => ({
          label: p.name, icon: "flag", active: filterPriority === p.id,
          onClick: () => router.setQuery({ priority: p.id }),
        })),
      ])
    ),
    h(
      "div", { class: "quickadd", style: { maxWidth: "260px", padding: "2px 10px" } },
      icon("search", 14, "u-dim"),
      h("input", {
        class: "quickadd__input", dataset: { role: "filter" }, placeholder: "Filter these tasks", value: query.q || "",
        onInput: (event) => router.setQuery({ q: event.target.value || null }),
      })
    ),
    h("div", { class: "u-grow" }),
    h(
      "button",
      { class: "btn btn--sm", onClick: () => setSetting("showCompleted", !showDone) },
      icon(showDone ? "eye" : "check-circle", 14),
      showDone ? "Hiding nothing" : "Hide completed"
    )
  );

  const listNodes = [];
  for (const group of groups) {
    if (grouping !== "none") listNodes.push(groupHeader(group.label, group.tasks.length));
    listNodes.push(h("div", { class: "tasklist" }, ...group.tasks.map((task) => taskRow(state, task, { showProject: grouping !== "project" }))));
  }

  const defaults = {};
  if (scope === "upcoming") defaults.due = shiftKey(todayKey(), 1);
  if (scope === "tags" && param) defaults.tags = [param];
  if (filterProject && filterProject !== "none") defaults.projectId = filterProject;

  const body = h(
    "div", { class: "view__inner" },
    bar,
    inlineAdd({ placeholder: "Add a task — try 'Call Sam tomorrow !high #project'", defaults }),
    tasks.length
      ? h("div", null, ...listNodes)
      : emptyState({
          icon: "check-circle",
          title: search || filterProject || filterPriority ? "Nothing matches those filters" : "Nothing here",
          text: search || filterProject || filterPriority
            ? "Loosen a filter, or clear the search box."
            : "Add a task above, or press N from anywhere.",
          action: h("button", { class: "btn btn--sm", onClick: () => openQuickAdd(defaults) }, "Add a task"),
        })
  );

  const config = SCOPES[scope];
  const title = scope === "tags" ? `#${param}` : config.title;

  return {
    topbar: {
      crumbs: [{ label: "Dezk", href: "#/today" }, { label: config.crumb }, ...(scope === "tags" ? [{ label: `#${param}` }] : [])],
      title,
      subtitle: `${tasks.length} shown · ${openTasks(state).length} open in total`,
      tools: [
        scope === "tasks" && allTags(state).length
          ? h(
              "button",
              {
                class: "btn btn--sm",
                onClick: (event) => showMenu(event.currentTarget, allTags(state).map((tag) => ({
                  label: `#${tag.name}`, icon: "tag", hint: String(tag.count),
                  onClick: () => router.navigate(`#/tags/${tag.name}`),
                }))),
              },
              icon("tag", 14), "Tags"
            )
          : null,
        h("button", { class: "btn btn--primary btn--sm", onClick: () => openQuickAdd(defaults) }, icon("plus", 14), "New task"),
      ].filter(Boolean),
    },
    body,
  };
}
