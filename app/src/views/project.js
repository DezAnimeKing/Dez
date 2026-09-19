import { h } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { router } from "../router.js";
import { showMenu } from "../ui/menu.js";
import { promptDialog, confirmDialog } from "../ui/modal.js";
import { toast } from "../ui/toast.js";
import { taskCard, taskRow, makeDropZone, inlineAdd, groupHeader } from "./parts.js";
import { emptyState, progressBar } from "../ui/controls.js";
import { openQuickAdd } from "../ui/quickadd.js";
import { openProjectSettings } from "../ui/dialogs.js";
import { projectById, tasksForProject, tasksInColumn, projectProgress, isDone } from "../store/selectors.js";
import { addColumn, updateColumn, deleteColumn, updateProject, deleteProject } from "../store/actions.js";
import { store } from "../store/state.js";
import { calendarGrid } from "./calendar.js";

const VIEW_MODES = [
  { id: "board", name: "Board", icon: "board" },
  { id: "list", name: "List", icon: "list" },
  { id: "calendar", name: "Calendar", icon: "calendar" },
];

function columnNode(state, project, column) {
  const tasks = tasksInColumn(state, project.id, column.id);

  const list = h(
    "div", { class: "column__list" },
    ...tasks.map((task) => taskCard(state, task, { showProject: false })),
    tasks.length === 0
      ? h(
          "div",
          { class: "newcard" },
          h("div", { class: "newcard__art" }, icon("layers", 26)),
          h("div", { class: "newcard__title" }, column.isDone ? "Nothing finished yet" : "Nothing here yet"),
          h("p", { class: "newcard__text" },
            column.isDone ? "Cards land here when you tick them off." : "Drag a card across, or add one straight into this column."),
          h(
            "button",
            {
              class: "btn btn--dashed btn--block",
              onClick: () => openQuickAdd({ projectId: project.id, status: column.id }),
            },
            icon("plus", 15), "Add task"
          )
        )
      : null
  );

  makeDropZone(list, () => ({ projectId: project.id, columnId: column.id }));

  return h(
    "div", { class: "column" },
    h(
      "div", { class: "column__head" },
      h("span", { class: "nav-item__swatch", style: { background: column.isDone ? "var(--accent)" : "var(--ink-3)" } }),
      h("span", { class: "column__name" }, column.name),
      h("span", { class: "column__count" }, String(tasks.length)),
      h(
        "div", { class: "column__tools" },
        h(
          "button",
          {
            class: "btn btn--ghost btn--icon btn--sm", "aria-label": `Add task to ${column.name}`,
            onClick: () => openQuickAdd({ projectId: project.id, status: column.id }),
          },
          icon("plus", 15)
        ),
        h(
          "button",
          {
            class: "btn btn--ghost btn--icon btn--sm", "aria-label": `${column.name} options`,
            onClick: (event) =>
              showMenu(event.currentTarget, [
                {
                  label: "Rename column", icon: "pencil",
                  onClick: () => promptDialog({
                    title: "Rename column", value: column.name,
                    onConfirm: (name) => updateColumn(project.id, column.id, { name }),
                  }),
                },
                {
                  label: column.isDone ? "Not the done column" : "Mark as the done column", icon: "check-circle",
                  onClick: () => {
                    for (const other of project.columns) updateColumn(project.id, other.id, { isDone: other.id === column.id ? !column.isDone : false });
                  },
                },
                { separator: true },
                {
                  label: "Delete column", icon: "trash", danger: true,
                  onClick: () => confirmDialog({
                    title: `Delete "${column.name}"?`,
                    message: "Its cards move to the first column — nothing is lost.",
                    confirmLabel: "Delete column",
                    onConfirm: () => deleteColumn(project.id, column.id),
                  }),
                },
              ], { align: "end" }),
          },
          icon("more-v", 15)
        )
      )
    ),
    list,
    tasks.length
      ? h(
          "button",
          { class: "btn btn--dashed btn--block", onClick: () => openQuickAdd({ projectId: project.id, status: column.id }) },
          icon("plus", 15), "Add task"
        )
      : null
  );
}

function boardBody(state, project) {
  return h(
    "div", { class: "board" },
    ...project.columns.map((column) => columnNode(state, project, column)),
    h(
      "div", { class: "column", style: { flex: "0 0 210px", width: "210px" } },
      h(
        "button",
        {
          class: "btn btn--dashed btn--block", style: { height: "40px" },
          onClick: () => promptDialog({
            title: "New column", value: "", placeholder: "e.g. Blocked",
            confirmLabel: "Add column",
            onConfirm: (name) => addColumn(project.id, name),
          }),
        },
        icon("plus", 15), "Add column"
      )
    )
  );
}

function listBody(state, project) {
  const nodes = [];
  for (const column of project.columns) {
    const tasks = tasksInColumn(state, project.id, column.id);
    if (!tasks.length) continue;
    nodes.push(groupHeader(column.name, tasks.length));
    nodes.push(h("div", { class: "tasklist" }, ...tasks.map((task) => taskRow(state, task, { showProject: false }))));
  }
  return h(
    "div", { class: "view__inner" },
    inlineAdd({ placeholder: `Add a task to ${project.name}…`, defaults: { projectId: project.id } }),
    nodes.length
      ? h("div", null, ...nodes)
      : emptyState({ icon: "check-square", title: "No tasks yet", text: "Add the first one above." })
  );
}

export function projectView({ state, route }) {
  const project = projectById(state, route.parts[1]);
  if (!project) {
    return {
      topbar: { crumbs: [{ label: "Projects", href: "#/projects" }], title: "Project not found" },
      body: h("div", { class: "view__inner" }, emptyState({
        icon: "alert", title: "That project is gone",
        text: "It may have been deleted.",
        action: h("a", { class: "btn btn--sm", href: "#/projects" }, "Back to projects"),
      })),
    };
  }

  const mode = route.query.view || "board";
  const progress = projectProgress(state, project.id);
  const tasks = tasksForProject(state, project.id);

  let body;
  if (mode === "list") body = listBody(state, project);
  else if (mode === "calendar") {
    body = h("div", { class: "view__inner" }, calendarGrid(state, { projectId: project.id, month: route.query.month }));
  } else body = boardBody(state, project);

  return {
    wide: mode === "board",
    bare: mode === "board",
    topbar: {
      crumbs: [
        { label: "Projects", href: "#/projects" },
        { label: project.name },
      ],
      status: `${progress.done} of ${progress.total} done`,
      title: h("span", { class: "u-row", style: { gap: "10px" } },
        h("span", { class: "nav-item__swatch", style: { background: project.color, width: "10px", height: "10px" } }),
        project.name),
      titleExtra: h(
        "button",
        { class: "btn btn--ghost btn--icon btn--sm", "aria-label": "Rename project",
          onClick: () => promptDialog({ title: "Rename project", value: project.name, onConfirm: (name) => updateProject(project.id, { name }) }) },
        icon("pencil", 14)
      ),
      subtitle: project.description || `${tasks.filter((t) => !isDone(state, t)).length} open · ${progress.pct}% complete`,
      tools: [
        h("div", { style: { width: "110px", marginRight: "4px" } }, progressBar(progress.pct, { color: project.color })),
        h(
          "button",
          {
            class: "btn btn--sm",
            onClick: (event) => showMenu(event.currentTarget, VIEW_MODES.map((option) => ({
              label: option.name, icon: option.icon, active: option.id === mode,
              onClick: () => router.setQuery({ view: option.id === "board" ? null : option.id }),
            }))),
          },
          icon(VIEW_MODES.find((v) => v.id === mode)?.icon || "board", 14),
          VIEW_MODES.find((v) => v.id === mode)?.name || "Board",
          icon("chevron-down", 13)
        ),
        h(
          "button",
          {
            class: "btn btn--icon btn--sm", "aria-label": project.favorite ? "Unfavourite" : "Favourite",
            style: project.favorite ? { color: "var(--accent)" } : null,
            onClick: () => updateProject(project.id, { favorite: !project.favorite }),
          },
          icon("star", 15)
        ),
        h(
          "button",
          {
            class: "btn btn--icon btn--sm", "aria-label": "Project options",
            onClick: (event) => showMenu(event.currentTarget, [
              { label: "Project settings", icon: "settings", onClick: () => openProjectSettings(project.id) },
              { label: "Add column", icon: "plus", onClick: () => promptDialog({ title: "New column", onConfirm: (name) => addColumn(project.id, name) }) },
              { separator: true },
              {
                label: project.archived ? "Unarchive" : "Archive project", icon: "archive",
                onClick: () => { updateProject(project.id, { archived: !project.archived }); toast(project.archived ? "Project restored" : "Project archived"); },
              },
              {
                label: "Delete project", icon: "trash", danger: true,
                onClick: () => confirmDialog({
                  title: `Delete "${project.name}"?`,
                  message: `This removes the project and its ${tasks.length} tasks.`,
                  onConfirm: () => {
                    deleteProject(project.id);
                    router.navigate("#/projects");
                    toast("Project deleted", { action: { label: "Undo", onClick: () => store.undo() } });
                  },
                }),
              },
            ], { align: "end" }),
          },
          icon("more-v", 15)
        ),
        h("button", { class: "btn btn--primary btn--sm", onClick: () => openQuickAdd({ projectId: project.id }) }, icon("plus", 14), "New task"),
      ],
    },
    body,
  };
}
