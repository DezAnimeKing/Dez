import { h, mount, trapFocus, debounce, focusEnd } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { store } from "../store/state.js";
import { router } from "../router.js";
import { showMenu } from "./menu.js";
import { toast } from "./toast.js";
import { confirmDialog } from "./modal.js";
import { updateTask, deleteTask, duplicateTask, toggleTask, addSubtask, toggleSubtask, removeSubtask, updateSubtask, addComment, removeComment, updateRecord, deleteRecord, addSelectOption } from "../store/actions.js";
import { taskById, projectById, isDone, pageById, primaryField, fieldOption, recordTitle, subtaskProgress, PRIORITIES } from "../store/selectors.js";
import { checkbox, tagChip, progressBar, rating, openDateMenu, openPriorityMenu, openProjectMenu, SWATCHES } from "./controls.js";
import { formatDay, relativeTime, formatTime } from "../lib/date.js";
import { start as startTimer, setTask as setTimerTask } from "./timer.js";

let current = null;

export const drawerKey = () => current?.key || null;

/** Mirror the open panel in the URL, without re-navigating to the same hash. */
function syncQuery(key, value) {
  const existing = router.current.query[key] || null;
  if (existing === (value || null)) return;
  router.setQuery({ [key]: value || null });
}

export function closeDrawer({ syncRoute = true } = {}) {
  if (!current) return false;
  current.flush?.();
  current.unsubscribe?.();
  current.release?.();
  document.removeEventListener("keydown", current.onKey, true);
  current.scrim.remove();
  current.node.remove();
  const previous = current.previous;
  const wasKind = current.kind;
  current = null;
  if (syncRoute) {
    const patch = {};
    if (wasKind === "task") patch.task = null;
    if (wasKind === "record") patch.record = null;
    if (Object.keys(patch).length) router.setQuery(patch);
  }
  previous?.focus?.();
  return true;
}

export const drawerOpen = () => Boolean(current);

function openDrawer({ key, kind, render, onFlush = null }) {
  if (current?.key === key) return;
  closeDrawer({ syncRoute: false });
  const previous = document.activeElement;
  const scrim = h("div", { class: "scrim", onClick: () => closeDrawer() });
  const node = h("div", { class: "drawer", role: "dialog", "aria-modal": "false", "aria-label": "Details" });

  const paint = () => {
    // Never redraw under the user's cursor while they are typing in the panel.
    const active = document.activeElement;
    if (node.contains(active) && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
    const scrollTop = node.querySelector(".drawer__body")?.scrollTop ?? 0;
    const content = render();
    if (!content) { closeDrawer(); return; }
    mount(node, ...[].concat(content));
    const body = node.querySelector(".drawer__body");
    if (body) body.scrollTop = scrollTop;
  };

  const onKey = (event) => {
    if (event.key === "Escape" && !document.querySelector(".modal") && !document.querySelector(".menu")) {
      event.preventDefault();
      closeDrawer();
    }
  };
  document.addEventListener("keydown", onKey, true);
  document.getElementById("overlays").append(scrim, node);
  const release = trapFocus(node);
  const unsubscribe = store.subscribe(paint);
  current = { key, kind, node, scrim, onKey, previous, unsubscribe, release, flush: onFlush };
  paint();
}

/* ============================ task drawer ============================ */

export function openTaskDrawer(taskId) {
  syncQuery("task", taskId);
  const saveNotes = debounce((value) => updateTask(taskId, { notes: value }), 400);

  openDrawer({
    key: `task:${taskId}`,
    kind: "task",
    onFlush: () => saveNotes.flush(),
    render: () => {
      const state = store.state;
      const task = taskById(state, taskId);
      if (!task) return null;
      const project = projectById(state, task.projectId);
      const done = isDone(state, task);
      const progress = subtaskProgress(task);

      const row = (label, control) => h("div", { class: "drawer__row" }, h("span", { class: "field__label" }, label), control);

      const metaButton = (children, onClick) =>
        h("button", { class: "btn btn--sm", style: { justifyContent: "flex-start", width: "100%" }, onClick }, ...children);

      return [
        h(
          "div", { class: "drawer__head" },
          checkbox(done, () => toggleTask(taskId), { round: true, label: "Toggle complete" }),
          h("span", { class: "u-grow u-dim", style: { fontSize: "12px" } }, done ? "Completed" : "Task"),
          h(
            "button",
            {
              class: "btn btn--ghost btn--icon btn--sm", "aria-label": "Task actions",
              onClick: (event) =>
                showMenu(event.currentTarget, [
                  { label: "Start focus on this", icon: "timer", onClick: () => { setTimerTask(taskId); startTimer(taskId); toast("Focus timer started"); } },
                  { label: task.starred ? "Remove star" : "Star task", icon: "star", onClick: () => updateTask(taskId, { starred: !task.starred }) },
                  { label: "Duplicate", icon: "copy", onClick: () => { const id = duplicateTask(taskId); if (id) openTaskDrawer(id); } },
                  { separator: true },
                  {
                    label: "Delete task", icon: "trash", danger: true,
                    onClick: () => {
                      const run = () => { closeDrawer(); deleteTask(taskId); toast("Task deleted", { action: { label: "Undo", onClick: () => store.undo() } }); };
                      if (store.state.settings.confirmDelete) {
                        confirmDialog({ title: "Delete this task?", message: `"${task.title}" will be removed.`, onConfirm: run });
                      } else run();
                    },
                  },
                ], { align: "end" }),
            },
            icon("more-v", 16)
          ),
          h("button", { class: "btn btn--ghost btn--icon btn--sm", "aria-label": "Close", onClick: () => closeDrawer() }, icon("x", 16))
        ),
        h(
          "div", { class: "drawer__body" },
          h("textarea", {
            class: "input input--title", rows: "2", value: task.title,
            style: { resize: "none", lineHeight: "1.35" },
            "aria-label": "Task title",
            onInput: (event) => {
              event.target.style.height = "auto";
              event.target.style.height = `${event.target.scrollHeight}px`;
            },
            onChange: (event) => updateTask(taskId, { title: event.target.value.trim() || "Untitled task" }),
          }),

          h(
            "div", { class: "u-col", style: { gap: "8px" } },
            row("Project", metaButton(
              [project ? h("span", { class: "nav-item__swatch", style: { background: project.color } }) : icon("inbox", 15),
               h("span", { class: "u-truncate" }, project ? project.name : "Inbox")],
              (event) => openProjectMenu(event.currentTarget, state, task.projectId, (id) => {
                const columns = id ? projectById(state, id)?.columns : null;
                updateTask(taskId, { projectId: id, status: columns?.some((c) => c.id === task.status) ? task.status : (columns?.[0]?.id || "todo") });
              })
            )),
            row("Due", metaButton(
              [icon("calendar", 15), h("span", null, task.due ? formatDay(task.due) : "No date")],
              (event) => openDateMenu(event.currentTarget, task.due, (value) => updateTask(taskId, { due: value }))
            )),
            row("Time", h("input", {
              class: "input", type: "time", value: task.time || "",
              onChange: (event) => updateTask(taskId, { time: event.target.value || null }),
            })),
            row("Priority", metaButton(
              [icon("flag", 15), h("span", null, PRIORITIES.find((p) => p.id === task.priority)?.name || "None")],
              (event) => openPriorityMenu(event.currentTarget, task.priority, (value) => updateTask(taskId, { priority: value }))
            )),
            row("Status", h(
              "select",
              {
                class: "select",
                onChange: (event) => updateTask(taskId, {
                  status: event.target.value,
                  completedAt: event.target.value === (project?.columns || []).find((c) => c.isDone)?.id ? new Date().toISOString() : null,
                }),
              },
              ...(project?.columns || [{ id: "todo", name: "To do" }, { id: "doing", name: "In progress" }, { id: "done", name: "Done", isDone: true }])
                .map((column) => h("option", { value: column.id, selected: column.id === task.status }, column.name))
            ))
          ),

          h(
            "div", { class: "field" },
            h("span", { class: "field__label" }, "Tags"),
            h(
              "div", { class: "u-row", style: { flexWrap: "wrap", gap: "6px" } },
              ...(task.tags || []).map((tag) =>
                tagChip(tag, () => updateTask(taskId, { tags: task.tags.filter((t) => t !== tag) }))),
              h("input", {
                class: "input input--ghost", style: { width: "110px" }, placeholder: "+ tag",
                onKeydown: (event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  const value = event.target.value.trim().toLowerCase().replace(/^[#+]/, "");
                  if (value && !task.tags.includes(value)) updateTask(taskId, { tags: [...task.tags, value] });
                  event.target.value = "";
                },
              })
            )
          ),

          h(
            "div", { class: "field" },
            h("span", { class: "field__label" }, "Notes"),
            h("textarea", {
              class: "textarea", value: task.notes || "", placeholder: "Anything worth remembering when you pick this up.",
              onInput: (event) => saveNotes(event.target.value),
              onBlur: () => saveNotes.flush(),
            })
          ),

          h(
            "div", { class: "field" },
            h(
              "div", { class: "u-row" },
              h("span", { class: "field__label u-grow" }, `Subtasks${progress.total ? ` · ${progress.done}/${progress.total}` : ""}`),
              progress.total ? h("span", { class: "u-dim", style: { fontSize: "11.5px" } }, `${progress.pct}%`) : null
            ),
            progress.total ? progressBar(progress.pct, { thin: true }) : null,
            h(
              "div", { class: "u-col", style: { gap: "2px", marginTop: "6px" } },
              ...(task.subtasks || []).map((subtask) =>
                h(
                  "div", { class: "u-row", style: { gap: "8px" } },
                  checkbox(subtask.done, () => toggleSubtask(taskId, subtask.id), { label: subtask.title }),
                  h("input", {
                    class: "input input--ghost u-grow",
                    style: subtask.done ? { color: "var(--ink-3)", textDecoration: "line-through" } : null,
                    value: subtask.title,
                    onChange: (event) => updateSubtask(taskId, subtask.id, { title: event.target.value.trim() || subtask.title }),
                  }),
                  h("button", { class: "btn btn--ghost btn--icon btn--sm", "aria-label": "Remove subtask", onClick: () => removeSubtask(taskId, subtask.id) }, icon("x", 14))
                )
              ),
              h("input", {
                class: "input input--ghost", placeholder: "+ Add a step",
                onKeydown: (event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  const value = event.target.value.trim();
                  if (!value) return;
                  addSubtask(taskId, value);
                  event.target.value = "";
                  requestAnimationFrame(() => {
                    const inputs = current?.node.querySelectorAll('input[placeholder="+ Add a step"]');
                    focusEnd(inputs?.[inputs.length - 1]);
                  });
                },
              })
            )
          ),

          h(
            "div", { class: "field" },
            h("span", { class: "field__label" }, `Log${task.comments?.length ? ` · ${task.comments.length}` : ""}`),
            h(
              "div", { class: "u-col", style: { gap: "8px" } },
              ...(task.comments || []).map((comment) =>
                h(
                  "div", { class: "u-row", style: { alignItems: "flex-start", gap: "8px" } },
                  h("span", { class: "dot", style: { marginTop: "7px" } }),
                  h("div", { class: "u-grow" },
                    h("div", { style: { fontSize: "13px", lineHeight: "1.55", whiteSpace: "pre-wrap" } }, comment.body),
                    h("div", { class: "u-dim", style: { fontSize: "11px" } }, relativeTime(comment.at))),
                  h("button", { class: "btn btn--ghost btn--icon btn--sm", "aria-label": "Delete note", onClick: () => removeComment(taskId, comment.id) }, icon("x", 13))
                )
              ),
              h("textarea", {
                class: "textarea", style: { minHeight: "58px" }, placeholder: "Add a note to the log — Enter to save",
                onKeydown: (event) => {
                  if (event.key !== "Enter" || event.shiftKey) return;
                  event.preventDefault();
                  const value = event.target.value.trim();
                  if (!value) return;
                  addComment(taskId, value);
                  event.target.value = "";
                },
              })
            )
          ),

          h("div", { class: "u-dim", style: { fontSize: "11.5px" } },
            `Created ${relativeTime(task.createdAt)}${task.completedAt ? ` · completed ${relativeTime(task.completedAt)}` : ""}`)
        ),
        h(
          "div", { class: "drawer__foot" },
          h("button", { class: "btn btn--primary u-grow", onClick: () => { setTimerTask(taskId); startTimer(taskId); toast("Focus timer started"); } },
            icon("timer", 15), "Focus on this"),
          h("button", { class: "btn", onClick: () => closeDrawer() }, "Done")
        ),
      ];
    },
  });
}

/* ============================ record drawer ============================ */

export function openRecordDrawer(pageId, recordId) {
  if (router.current.parts[0] === "pages" && router.current.parts[1] === pageId) {
    syncQuery("record", recordId);
  }
  const saveValue = debounce((fieldId, value) => updateRecord(pageId, recordId, { [fieldId]: value }, { silent: true }), 400);

  openDrawer({
    key: `record:${recordId}`,
    kind: "record",
    onFlush: () => saveValue.flush(),
    render: () => {
      const state = store.state;
      const page = pageById(state, pageId);
      const record = page?.records.find((r) => r.id === recordId);
      if (!page || !record) return null;
      const titleField = primaryField(page);

      return [
        h(
          "div", { class: "drawer__head" },
          icon(page.icon || "note", 16),
          h("span", { class: "u-grow u-dim", style: { fontSize: "12px" } }, page.name),
          h(
            "button",
            {
              class: "btn btn--ghost btn--icon btn--sm", "aria-label": "Entry actions",
              onClick: (event) =>
                showMenu(event.currentTarget, [
                  {
                    label: "Delete entry", icon: "trash", danger: true,
                    onClick: () => {
                      const run = () => { closeDrawer(); deleteRecord(pageId, recordId); toast("Entry deleted", { action: { label: "Undo", onClick: () => store.undo() } }); };
                      if (store.state.settings.confirmDelete) {
                        confirmDialog({ title: "Delete this entry?", message: `"${recordTitle(page, record)}" will be removed from ${page.name}.`, onConfirm: run });
                      } else run();
                    },
                  },
                ], { align: "end" }),
            },
            icon("more-v", 16)
          ),
          h("button", { class: "btn btn--ghost btn--icon btn--sm", "aria-label": "Close", onClick: () => closeDrawer() }, icon("x", 16))
        ),
        h(
          "div", { class: "drawer__body" },
          ...page.fields.map((field) =>
            h(
              "label", { class: "field" },
              h("span", { class: "field__label" }, field.name + (field.id === titleField?.id ? " · title" : "")),
              fieldEditor(page, record, field, saveValue)
            )
          ),
          h("div", { class: "u-dim", style: { fontSize: "11.5px" } },
            `Added ${relativeTime(record.createdAt)} · edited ${relativeTime(record.updatedAt)}`)
        ),
        h("div", { class: "drawer__foot" }, h("button", { class: "btn btn--primary u-grow", onClick: () => closeDrawer() }, "Done")),
      ];
    },
  });
}

function fieldEditor(page, record, field, saveValue) {
  const value = record.values?.[field.id];
  const commit = (next) => updateRecord(page.id, record.id, { [field.id]: next });

  switch (field.type) {
    case "longtext":
      return h("textarea", {
        class: "textarea", style: { minHeight: "120px" }, value: value || "",
        placeholder: `Write ${field.name.toLowerCase()}…`,
        onInput: (event) => saveValue(field.id, event.target.value),
        onBlur: () => saveValue.flush(),
      });
    case "number":
      return h("input", {
        class: "input", type: "number", value: value ?? "",
        onChange: (event) => commit(event.target.value === "" ? null : Number(event.target.value)),
      });
    case "date":
      return h("input", { class: "input", type: "date", value: value || "", onChange: (event) => commit(event.target.value || null) });
    case "checkbox":
      return h(
        "button",
        {
          class: "switch", role: "switch", type: "button", "aria-checked": String(Boolean(value)),
          onClick: () => commit(!value),
        }
      );
    case "rating":
      return rating(value || 0, { onPick: (next) => commit(next) });
    case "url":
      return h(
        "div", { class: "u-row", style: { gap: "6px" } },
        h("input", { class: "input u-grow", type: "url", value: value || "", placeholder: "https://", onChange: (event) => commit(event.target.value || null) }),
        value ? h("a", { class: "btn btn--icon", href: value, target: "_blank", rel: "noreferrer noopener", "aria-label": "Open link" }, icon("external", 15)) : null
      );
    case "select":
      return h(
        "div", { class: "u-row", style: { flexWrap: "wrap", gap: "6px" } },
        ...(field.options || []).map((option) =>
          h(
            "button",
            {
              class: "chip chip--button",
              style: value === option.id
                ? { background: `${option.color}26`, color: option.color, boxShadow: `inset 0 0 0 1px ${option.color}55` }
                : null,
              onClick: () => commit(value === option.id ? null : option.id),
            },
            option.name
          )
        ),
        h(
          "button",
          {
            class: "chip chip--button",
            onClick: () => {
              const name = prompt(`New option for ${field.name}`);
              if (!name) return;
              const id = addSelectOption(page.id, field.id, name, SWATCHES[(field.options?.length || 0) % SWATCHES.length]);
              commit(id);
            },
          },
          icon("plus", 12)
        )
      );
    case "tags": {
      const list = Array.isArray(value) ? value : [];
      return h(
        "div", { class: "u-row", style: { flexWrap: "wrap", gap: "6px" } },
        ...list.map((tag) => tagChip(tag, () => commit(list.filter((t) => t !== tag)))),
        h("input", {
          class: "input input--ghost", style: { width: "110px" }, placeholder: "+ tag",
          onKeydown: (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            const next = event.target.value.trim().toLowerCase().replace(/^[#+]/, "");
            if (next && !list.includes(next)) commit([...list, next]);
            event.target.value = "";
          },
        })
      );
    }
    default:
      return h("input", {
        class: "input", value: value || "", placeholder: field.name,
        onChange: (event) => commit(event.target.value),
      });
  }
}

/** Small read-only renderer used by table, board and gallery views. */
export function fieldValueNode(page, record, field) {
  const value = record.values?.[field.id];
  if (value === null || value === undefined || value === "") return h("span", { class: "u-dim" }, "—");
  switch (field.type) {
    case "select": {
      const option = fieldOption(field, value);
      if (!option) return h("span", { class: "u-dim" }, "—");
      return h("span", { class: "chip", style: { background: `${option.color}26`, color: option.color } }, option.name);
    }
    case "tags":
      return h("span", { class: "u-row", style: { flexWrap: "wrap", gap: "4px" } }, ...(value || []).map((tag) => tagChip(tag)));
    case "checkbox":
      return value ? icon("check", 15) : h("span", { class: "u-dim" }, "—");
    case "rating":
      return rating(value);
    case "date":
      return h("span", { class: "u-mono", style: { fontSize: "12.5px" } }, formatDay(value, { weekday: false }));
    case "url":
      return h("a", { href: value, target: "_blank", rel: "noreferrer noopener", class: "u-row", style: { gap: "4px", color: "var(--accent)" } }, icon("link", 13), "Link");
    case "longtext":
      return h("span", { class: "u-clamp-2", style: { color: "var(--ink-2)" } }, String(value));
    case "number":
      return h("span", { class: "u-mono" }, String(value));
    default:
      return h("span", null, String(value));
  }
}

export { formatTime };
