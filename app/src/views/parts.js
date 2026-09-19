import { h } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { store } from "../store/state.js";
import { showMenu } from "../ui/menu.js";
import { toast } from "../ui/toast.js";
import { confirmDialog } from "../ui/modal.js";
import { openTaskDrawer } from "../ui/drawer.js";
import {
  checkbox, dueChip, priorityChip, tagChip, progressBar,
  openDateMenu, openPriorityMenu, openProjectMenu,
} from "../ui/controls.js";
import {
  toggleTask, updateTask, deleteTask, duplicateTask, reorderTask, createTask,
} from "../store/actions.js";
import { isDone, projectById, subtaskProgress } from "../store/selectors.js";
import { parseQuickAdd, describeParse } from "../lib/parse.js";
import { todayKey, shiftKey } from "../lib/date.js";
import { setTask as setTimerTask, start as startTimer } from "../ui/timer.js";

export function taskMenuItems(state, task) {
  const done = isDone(state, task);
  return [
    { label: done ? "Mark as not done" : "Mark as done", icon: "check", onClick: () => toggleTask(task.id) },
    { label: "Open details", icon: "external", onClick: () => openTaskDrawer(task.id) },
    { label: "Focus on this", icon: "timer", onClick: () => { setTimerTask(task.id); startTimer(task.id); toast("Focus timer started"); } },
    { separator: true },
    { label: "Today", icon: "sun", onClick: () => updateTask(task.id, { due: todayKey() }) },
    { label: "Tomorrow", icon: "arrow-right", onClick: () => updateTask(task.id, { due: shiftKey(todayKey(), 1) }) },
    { label: "Schedule…", icon: "calendar", onClick: (event) => openDateMenu(event.target, task.due, (value) => updateTask(task.id, { due: value })) },
    { label: "Priority…", icon: "flag", onClick: (event) => openPriorityMenu(event.target, task.priority, (value) => updateTask(task.id, { priority: value })) },
    { label: "Move to…", icon: "board", onClick: (event) => openProjectMenu(event.target, state, task.projectId, (id) => updateTask(task.id, { projectId: id })) },
    { label: task.starred ? "Remove star" : "Star", icon: "star", onClick: () => updateTask(task.id, { starred: !task.starred }) },
    { separator: true },
    { label: "Duplicate", icon: "copy", onClick: () => duplicateTask(task.id) },
    {
      label: "Delete", icon: "trash", danger: true,
      onClick: () => {
        const run = () => { deleteTask(task.id); toast("Task deleted", { action: { label: "Undo", onClick: () => store.undo() } }); };
        if (store.state.settings.confirmDelete) {
          confirmDialog({ title: "Delete this task?", message: `"${task.title}" will be removed.`, onConfirm: run });
        } else run();
      },
    },
  ];
}

/** One line in a list view. */
export function taskRow(state, task, { showProject = true } = {}) {
  const done = isDone(state, task);
  const project = projectById(state, task.projectId);
  const progress = subtaskProgress(task);

  return h(
    "div", { class: "task-row", dataset: { done: String(done), taskId: task.id } },
    checkbox(done, () => toggleTask(task.id), { round: true, label: `Complete ${task.title}` }),
    h(
      "button",
      { class: "task-row__main", onClick: () => openTaskDrawer(task.id) },
      h("span", { class: "task-row__title" }, task.title),
      h(
        "span", { class: "task-row__sub" },
        showProject && project ? h("span", { class: "u-row", style: { gap: "4px" } }, h("span", { class: "nav-item__swatch", style: { background: project.color } }), project.name) : null,
        showProject && !project ? h("span", { class: "u-row", style: { gap: "4px" } }, icon("inbox", 11), "Inbox") : null,
        progress.total ? h("span", { class: "u-row", style: { gap: "4px" } }, icon("check-square", 11), `${progress.done}/${progress.total}`) : null,
        task.comments?.length ? h("span", { class: "u-row", style: { gap: "4px" } }, icon("message", 11), String(task.comments.length)) : null,
        ...(task.tags || []).map((tag) => tagChip(tag))
      )
    ),
    h(
      "div", { class: "task-row__side" },
      task.starred ? icon("star", 14) : null,
      priorityChip(task.priority),
      dueChip(task.due, { time: task.time, done }),
      h(
        "button",
        {
          class: "btn btn--ghost btn--icon btn--sm", "aria-label": `Actions for ${task.title}`,
          onClick: (event) => showMenu(event.currentTarget, taskMenuItems(state, task), { align: "end" }),
        },
        icon("more-v", 15)
      )
    )
  );
}

/** A card on a board. */
export function taskCard(state, task, { onDragStart = null, showProject = true } = {}) {
  const done = isDone(state, task);
  const progress = subtaskProgress(task);
  const project = projectById(state, task.projectId);

  return h(
    "article",
    {
      class: ["tcard", done && "tcard--done"],
      draggable: "true",
      dataset: { taskId: task.id },
      tabindex: "0",
      role: "button",
      "aria-label": task.title,
      onClick: (event) => { if (!event.target.closest("button")) openTaskDrawer(task.id); },
      onKeydown: (event) => { if (event.key === "Enter") openTaskDrawer(task.id); },
      onDragstart: (event) => {
        event.dataTransfer.setData("text/plain", task.id);
        event.dataTransfer.effectAllowed = "move";
        event.currentTarget.dataset.dragging = "true";
        onDragStart?.(task.id);
      },
      onDragend: (event) => { event.currentTarget.dataset.dragging = "false"; },
    },
    h(
      "div", { class: "tcard__top" },
      priorityChip(task.priority),
      dueChip(task.due, { time: task.time, done }),
      h(
        "button",
        {
          class: "tcard__menu", "aria-label": `Actions for ${task.title}`,
          onClick: (event) => { event.stopPropagation(); showMenu(event.currentTarget, taskMenuItems(state, task), { align: "end" }); },
        },
        icon("more-v", 15)
      )
    ),
    h("h3", { class: "tcard__title" }, task.title),
    task.notes ? h("p", { class: "tcard__desc u-clamp-2" }, task.notes) : null,
    progress.total
      ? h("div", { class: "tcard__progress" }, progressBar(progress.pct, { thin: true }), h("b", null, `${progress.done}/${progress.total}`))
      : null,
    h(
      "div", { class: "tcard__foot" },
      showProject && project ? h("span", { class: "chip" }, h("span", { class: "nav-item__swatch", style: { background: project.color } }), project.name) : null,
      ...(task.tags || []).slice(0, 2).map((tag) => tagChip(tag)),
      h(
        "div", { class: "tcard__meta" },
        task.comments?.length ? h("span", null, icon("message", 12), String(task.comments.length)) : null,
        task.subtasks?.length ? h("span", null, icon("check-square", 12), String(task.subtasks.length)) : null,
        task.starred ? icon("star", 12) : null
      )
    )
  );
}

/**
 * Wire a column element for drag & drop. `resolve` maps the drop to
 * { projectId, columnId }.
 */
export function makeDropZone(node, resolve) {
  const clear = () => { node.dataset.dropping = "false"; };

  node.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    node.dataset.dropping = "true";
  });
  node.addEventListener("dragleave", (event) => {
    if (!node.contains(event.relatedTarget)) clear();
  });
  node.addEventListener("drop", (event) => {
    event.preventDefault();
    clear();
    const taskId = event.dataTransfer.getData("text/plain");
    if (!taskId) return;
    const { projectId, columnId } = resolve();
    const cards = [...node.querySelectorAll(".tcard")].filter((card) => card.dataset.taskId !== taskId);
    const beforeCard = cards.find((card) => {
      const rect = card.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    reorderTask(taskId, projectId, columnId, beforeCard?.dataset.taskId || null);
  });
  return node;
}

/** Inline "add a task" input used at the top of lists and inside columns. */
export function inlineAdd({ placeholder = "Add a task…", defaults = {}, compact = false }) {
  let hint;
  const input = h("input", {
    class: "quickadd__input", placeholder, dataset: { role: "quick-add" },
    onInput: (event) => {
      const parsed = parseQuickAdd(event.target.value, { projects: store.state.projects });
      const bits = describeParse(parsed, store.state.projects);
      hint.replaceChildren(...bits.map((bit) => h("span", { class: "chip" }, icon(bit.icon, 12), bit.text)));
    },
    onKeydown: (event) => {
      if (event.key === "Escape") { event.target.value = ""; event.target.blur(); hint.replaceChildren(); return; }
      if (event.key !== "Enter") return;
      event.preventDefault();
      const parsed = parseQuickAdd(event.target.value, { projects: store.state.projects });
      if (!parsed.title) return;
      createTask({
        ...defaults,
        title: parsed.title,
        projectId: parsed.projectId ?? defaults.projectId ?? null,
        priority: parsed.priority !== "none" ? parsed.priority : defaults.priority || "none",
        due: parsed.due ?? defaults.due ?? null,
        time: parsed.time,
        tags: parsed.tags.length ? parsed.tags : defaults.tags || [],
      });
      // The list re-renders around this input; main.js puts the caret back.
      event.target.value = "";
      hint.replaceChildren();
    },
  });

  return h(
    "div", { class: "u-col", style: { gap: "6px", marginBottom: compact ? "0" : "14px" } },
    h("div", { class: "quickadd" }, icon("plus", 15, "u-dim"), input),
    (hint = h("div", { class: "quickadd__hint" }))
  );
}

export function groupHeader(label, count, extra = null) {
  return h(
    "div", { class: "group-head" },
    h("span", null, label),
    count !== null && count !== undefined ? h("span", { class: "group-head__count" }, String(count)) : null,
    extra
  );
}

export function panel(title, body, { tools = null, icon: iconName = null } = {}) {
  return h(
    "section", { class: "panel" },
    h(
      "div", { class: "panel__head" },
      iconName ? icon(iconName, 16) : null,
      h("h2", { class: "panel__title u-grow" }, title),
      tools ? h("div", { class: "panel__tools" }, tools) : null
    ),
    h("div", { class: "panel__body" }, body)
  );
}
