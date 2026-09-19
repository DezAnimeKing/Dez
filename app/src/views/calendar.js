import { h } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { router } from "../router.js";
import { openTaskDrawer } from "../ui/drawer.js";
import { openQuickAdd } from "../ui/quickadd.js";
import { showMenu } from "../ui/menu.js";
import { updateTask } from "../store/actions.js";
import { activeTasks, isDone, projectById, sortTasks } from "../store/selectors.js";
import { monthMatrix, dowLabels, todayKey, MONTHS } from "../lib/date.js";

function parseMonth(value) {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split("-").map(Number);
    return { year, month: month - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

const monthParam = (year, month) => `${year}-${String(month + 1).padStart(2, "0")}`;

export function calendarGrid(state, { projectId = null, month = null, onDayClick = null } = {}) {
  const { year, month: monthIndex } = parseMonth(month);
  const weekStart = state.settings.weekStart ?? 1;
  const cells = monthMatrix(year, monthIndex, weekStart);

  const tasks = activeTasks(state).filter((task) => task.due && (!projectId || task.projectId === projectId));
  const byDay = new Map();
  for (const task of sortTasks(tasks, state)) {
    if (!byDay.has(task.due)) byDay.set(task.due, []);
    byDay.get(task.due).push(task);
  }

  const grid = h(
    "div", { class: "cal__grid" },
    ...dowLabels(weekStart).map((label) => h("div", { class: "cal__dow" }, label)),
    ...cells.map((cell) => {
      const dayTasks = byDay.get(cell.key) || [];
      const node = h(
        "div",
        {
          class: "cal__cell",
          dataset: { muted: String(!cell.inMonth), today: String(cell.key === todayKey()) },
          onDblclick: () => (onDayClick ? onDayClick(cell.key) : openQuickAdd({ due: cell.key, projectId })),
          onDragover: (event) => { event.preventDefault(); node.style.background = "var(--accent-soft)"; },
          onDragleave: () => { node.style.background = ""; },
          onDrop: (event) => {
            event.preventDefault();
            node.style.background = "";
            const taskId = event.dataTransfer.getData("text/plain");
            if (taskId) updateTask(taskId, { due: cell.key });
          },
        },
        h(
          "div", { class: "u-row" },
          h("span", { class: "cal__num" }, String(cell.date.getDate())),
          dayTasks.length > 3
            ? h("span", { class: "cal__num", style: { marginLeft: "auto" } }, `+${dayTasks.length - 3}`)
            : null
        ),
        ...dayTasks.slice(0, 3).map((task) => {
          const project = projectById(state, task.projectId);
          return h(
            "button",
            {
              class: "cal__pill", draggable: "true",
              dataset: { done: String(isDone(state, task)) },
              title: task.title,
              style: project ? { boxShadow: `inset 2px 0 0 ${project.color}` } : null,
              onClick: (event) => { event.stopPropagation(); openTaskDrawer(task.id); },
              onDragstart: (event) => { event.dataTransfer.setData("text/plain", task.id); event.stopPropagation(); },
            },
            task.time ? h("span", { class: "u-dim" }, `${task.time} `) : null,
            task.title
          );
        }),
        dayTasks.length > 3
          ? h(
              "button",
              {
                class: "cal__pill u-dim",
                onClick: (event) => {
                  event.stopPropagation();
                  showMenu(event.currentTarget, dayTasks.slice(3).map((task) => ({
                    label: task.title, icon: "check-circle", onClick: () => openTaskDrawer(task.id),
                  })));
                },
              },
              `${dayTasks.length - 3} more`
            )
          : null
      );
      return node;
    })
  );

  const go = (delta) => {
    const next = new Date(year, monthIndex + delta, 1);
    router.setQuery({ month: monthParam(next.getFullYear(), next.getMonth()) });
  };

  return h(
    "div", { class: "u-col", style: { gap: "12px" } },
    h(
      "div", { class: "u-row" },
      h("h2", { style: { fontSize: "16px" } }, `${MONTHS[monthIndex]} ${year}`),
      h("div", { class: "u-grow" }),
      h("button", { class: "btn btn--icon btn--sm", "aria-label": "Previous month", onClick: () => go(-1) }, icon("chevron-left", 15)),
      h("button", { class: "btn btn--sm", onClick: () => router.setQuery({ month: null }) }, "Today"),
      h("button", { class: "btn btn--icon btn--sm", "aria-label": "Next month", onClick: () => go(1) }, icon("chevron-right", 15))
    ),
    h("div", { class: "cal" }, grid),
    h("p", { class: "u-dim", style: { fontSize: "11.5px" } }, "Drag a task onto a day to reschedule it. Double-click a day to add one.")
  );
}

export function calendarView({ state, route }) {
  const filterProject = route.query.project || null;
  const project = filterProject ? projectById(state, filterProject) : null;

  return {
    topbar: {
      crumbs: [{ label: "Dezk", href: "#/today" }, { label: "Calendar" }],
      title: "Calendar",
      subtitle: project ? `Filtered to ${project.name}` : "Everything with a date on it",
      tools: [
        h(
          "button",
          {
            class: "btn btn--sm",
            onClick: (event) => showMenu(event.currentTarget, [
              { label: "All projects", icon: "grid", active: !filterProject, onClick: () => router.setQuery({ project: null }) },
              { separator: true },
              ...state.projects.filter((p) => !p.archived).map((p) => ({
                label: p.name, icon: "board", active: filterProject === p.id,
                onClick: () => router.setQuery({ project: p.id }),
              })),
            ]),
          },
          icon("filter", 14), project ? project.name : "All projects"
        ),
        h("button", { class: "btn btn--primary btn--sm", onClick: () => openQuickAdd({ due: todayKey(), projectId: filterProject }) }, icon("plus", 14), "New task"),
      ],
    },
    body: h("div", { class: "view__inner" }, calendarGrid(state, { projectId: filterProject, month: route.query.month })),
  };
}
