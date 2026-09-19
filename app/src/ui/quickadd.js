import { h, mount } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { openModal, closeTopModal } from "./modal.js";
import { toast } from "./toast.js";
import { store } from "../store/state.js";
import { createTask, deleteTask } from "../store/actions.js";
import { parseQuickAdd, describeParse } from "../lib/parse.js";
import { projectById } from "../store/selectors.js";

const HINTS = [
  ["tomorrow", "due date"],
  ["at 9am", "time"],
  ["!high", "priority"],
  ["#project", "project"],
  ["+tag", "tag"],
];

export function parsedChips(parsed, state) {
  const bits = describeParse(parsed, state.projects);
  if (!bits.length) return h("span", { class: "u-dim", style: { fontSize: "11.5px" } }, "Type naturally — dates, #project, !priority and +tags are picked up.");
  return h("div", { class: "u-row", style: { flexWrap: "wrap", gap: "6px" } },
    ...bits.map((bit) => h("span", { class: "chip" }, icon(bit.icon, 12), bit.text)));
}

/**
 * @param {{projectId?: string|null, status?: string, due?: string|null}} defaults
 */
export function openQuickAdd(defaults = {}) {
  const state = store.state;
  let input;
  let preview;
  let lastParsed = null;

  const update = () => {
    lastParsed = parseQuickAdd(input.value, { projects: state.projects });
    mount(preview, parsedChips(lastParsed, state));
  };

  const submit = ({ keepOpen = false } = {}) => {
    const parsed = parseQuickAdd(input.value, { projects: state.projects });
    if (!parsed.title) return;
    const id = createTask({
      title: parsed.title,
      projectId: parsed.projectId ?? defaults.projectId ?? null,
      status: defaults.status || "todo",
      priority: parsed.priority,
      due: parsed.due ?? defaults.due ?? null,
      time: parsed.time,
      tags: parsed.tags,
    });
    const project = projectById(store.state, parsed.projectId ?? defaults.projectId ?? null);
    toast(`Added to ${project ? project.name : "Inbox"}`, {
      action: { label: "Undo", onClick: () => deleteTask(id) },
    });
    if (keepOpen) {
      input.value = "";
      update();
      input.focus();
    } else {
      closeTopModal();
    }
  };

  const defaultProject = projectById(state, defaults.projectId);

  openModal({
    title: "New task",
    body: [
      h(
        "div", { class: "quickadd" },
        icon("plus", 16, "u-dim"),
        (input = h("input", {
          class: "quickadd__input", dataset: { role: "quick-add" },
          placeholder: "Write the task, e.g. Email Sam tomorrow at 9am !high",
          autofocus: true,
          onInput: () => update(),
          onKeydown: (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit({ keepOpen: event.shiftKey || event.metaKey || event.ctrlKey });
            }
          },
        }))
      ),
      (preview = h("div", { class: "quickadd__hint" })),
      h(
        "div", { class: "quickadd__hint", style: { marginTop: "2px" } },
        ...HINTS.map(([token, meaning]) =>
          h("span", { class: "u-row", style: { gap: "4px" } }, h("span", { class: "kbd" }, token), h("span", { class: "u-dim" }, meaning))
        )
      ),
      defaultProject
        ? h("div", { class: "u-dim", style: { fontSize: "12px" } }, `Goes to ${defaultProject.name} unless you type a #project.`)
        : null,
    ],
    footer: [
      h("div", { class: "u-grow u-dim", style: { fontSize: "11.5px" } }, "Shift + Enter keeps this open for the next one"),
      h("button", { class: "btn", onClick: () => closeTopModal() }, "Cancel"),
      h("button", { class: "btn btn--primary", onClick: () => submit() }, "Add task"),
    ],
    initialFocus: ".quickadd__input",
  });
  update();
}
