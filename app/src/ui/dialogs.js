import { h } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { openModal, closeTopModal, confirmDialog } from "./modal.js";
import { toast } from "./toast.js";
import { store } from "../store/state.js";
import { router } from "../router.js";
import {
  createProject, updateProject, deleteProject, createPage, updatePage, deletePage,
  createHabit, updateHabit, deleteHabit, createCategory, deleteCategory, updateCategory,
  addField, updateField, deleteField, addSelectOption, addView, updateView, deleteView,
} from "../store/actions.js";
import { colorPicker, SWATCHES, openIconMenu, iconTile } from "./controls.js";
import { TEMPLATES, FIELD_TYPES, VIEW_TYPES } from "../store/templates.js";
import { pageById, projectById } from "../store/selectors.js";
import { showMenu } from "./menu.js";

/* ---------------- projects ---------------- */

export function openNewProject() {
  const state = store.state;
  let name = "";
  let color = SWATCHES[0];
  let categoryId = state.categories[0]?.id ?? null;
  let swatchRow;

  const nameInput = h("input", {
    class: "input", placeholder: "Project name", autofocus: true,
    onInput: (event) => { name = event.target.value; },
    onKeydown: (event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } },
  });

  const rebuildSwatches = () => {
    const next = colorPicker(color, (picked) => { color = picked; swatchRow.replaceWith(rebuildSwatches()); });
    swatchRow = next;
    return next;
  };

  const categorySelect = h(
    "select",
    { class: "select", onChange: (event) => { categoryId = event.target.value || null; } },
    h("option", { value: "" }, "No category"),
    ...state.categories.map((c) => h("option", { value: c.id, selected: c.id === categoryId }, c.name))
  );

  const submit = () => {
    const finalName = name.trim();
    if (!finalName) { nameInput.focus(); return; }
    const id = createProject({ name: finalName, color, categoryId });
    closeTopModal();
    router.navigate(`#/projects/${id}`);
    toast("Project created");
  };

  openModal({
    title: "New project",
    body: [
      h("label", { class: "field" }, h("span", { class: "field__label" }, "Name"), nameInput),
      h("label", { class: "field" }, h("span", { class: "field__label" }, "Category"), categorySelect),
      h("div", { class: "field" }, h("span", { class: "field__label" }, "Colour"), rebuildSwatches()),
    ],
    footer: [
      h("div", { class: "u-grow" }),
      h("button", { class: "btn", onClick: () => closeTopModal() }, "Cancel"),
      h("button", { class: "btn btn--primary", onClick: submit }, "Create project"),
    ],
    initialFocus: "input",
  });
}

export function openProjectSettings(projectId) {
  const project = projectById(store.state, projectId);
  if (!project) return;
  let color = project.color;
  let swatchRow;

  const nameInput = h("input", { class: "input", value: project.name });
  const descInput = h("textarea", { class: "textarea", value: project.description || "", placeholder: "What is this project for?" });
  const categorySelect = h(
    "select", { class: "select" },
    h("option", { value: "" }, "No category"),
    ...store.state.categories.map((c) => h("option", { value: c.id, selected: c.id === project.categoryId }, c.name))
  );

  const rebuildSwatches = () => {
    const next = colorPicker(color, (picked) => { color = picked; swatchRow.replaceWith(rebuildSwatches()); });
    swatchRow = next;
    return next;
  };

  openModal({
    title: "Project settings",
    body: [
      h("label", { class: "field" }, h("span", { class: "field__label" }, "Name"), nameInput),
      h("label", { class: "field" }, h("span", { class: "field__label" }, "Description"), descInput),
      h("label", { class: "field" }, h("span", { class: "field__label" }, "Category"), categorySelect),
      h("div", { class: "field" }, h("span", { class: "field__label" }, "Colour"), rebuildSwatches()),
    ],
    footer: [
      h(
        "button",
        {
          class: "btn btn--danger",
          onClick: () => {
            closeTopModal();
            confirmDialog({
              title: `Delete "${project.name}"?`,
              message: "The project and its tasks are removed. You can undo this from the toast or with Ctrl+Z.",
              onConfirm: () => {
                deleteProject(project.id);
                router.navigate("#/projects");
                toast("Project deleted", { action: { label: "Undo", onClick: () => store.undo() } });
              },
            });
          },
        },
        icon("trash", 15), "Delete"
      ),
      h("div", { class: "u-grow" }),
      h("button", { class: "btn", onClick: () => closeTopModal() }, "Cancel"),
      h(
        "button",
        {
          class: "btn btn--primary",
          onClick: () => {
            updateProject(project.id, {
              name: nameInput.value.trim() || project.name,
              description: descInput.value,
              categoryId: categorySelect.value || null,
              color,
            });
            closeTopModal();
          },
        },
        "Save"
      ),
    ],
  });
}

export function openCategoryManager() {
  const render = () => {
    const state = store.state;
    return h(
      "div", { class: "u-col", style: { gap: "10px" } },
      ...state.categories.map((category) =>
        h(
          "div", { class: "field-row" },
          h("span", { class: "nav-item__swatch", style: { background: category.color } }),
          h("input", {
            class: "input input--ghost u-grow", value: category.name,
            onChange: (event) => updateCategory(category.id, { name: event.target.value.trim() || category.name }),
          }),
          h(
            "button",
            {
              class: "btn btn--ghost btn--icon btn--sm", "aria-label": "Colour",
              onClick: (event) =>
                showMenu(event.currentTarget, SWATCHES.map((color) => ({
                  label: color, icon: "circle", active: color === category.color,
                  onClick: () => { updateCategory(category.id, { color }); reopen(); },
                }))),
            },
            icon("image", 15)
          ),
          h(
            "button",
            {
              class: "btn btn--ghost btn--icon btn--sm btn--danger", "aria-label": "Delete category",
              onClick: () => { deleteCategory(category.id); reopen(); },
            },
            icon("trash", 15)
          )
        )
      ),
      state.categories.length ? null : h("p", { class: "u-dim", style: { fontSize: "13px" } }, "No categories yet."),
      h(
        "button",
        {
          class: "btn btn--dashed btn--block",
          onClick: () => {
            createCategory("New category", SWATCHES[store.state.categories.length % SWATCHES.length]);
            reopen();
          },
        },
        icon("plus", 15), "Add category"
      )
    );
  };

  const reopen = () => { closeTopModal(); openCategoryManager(); };

  openModal({
    title: "Categories",
    body: render(),
    footer: [h("div", { class: "u-grow" }), h("button", { class: "btn btn--primary", onClick: () => closeTopModal() }, "Done")],
  });
}

/* ---------------- pages ---------------- */

export function openNewPage() {
  let templateId = "journal";
  let name = "";
  let grid;

  const nameInput = h("input", {
    class: "input", placeholder: "Page name",
    onInput: (event) => { name = event.target.value; },
    onKeydown: (event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } },
  });

  const buildGrid = () =>
    h(
      "div",
      { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "10px" } },
      ...TEMPLATES.map((template) =>
        h(
          "button",
          {
            class: "gcard",
            style: templateId === template.id ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : null,
            onClick: () => {
              templateId = template.id;
              if (!name) nameInput.value = template.name === "Blank page" ? "" : template.name;
              const next = buildGrid();
              grid.replaceWith(next);
              grid = next;
            },
          },
          h("div", { class: "u-row" }, iconTile(template.icon, { size: 26 }), h("span", { class: "gcard__title" }, template.name)),
          h("p", { class: "gcard__meta", style: { lineHeight: "1.5" } }, template.blurb)
        )
      )
    );

  const submit = () => {
    const template = TEMPLATES.find((t) => t.id === templateId);
    const id = createPage({ name: (nameInput.value || name).trim() || template.name, templateId });
    closeTopModal();
    router.navigate(`#/pages/${id}`);
    toast("Page created");
  };

  grid = buildGrid();

  openModal({
    title: "New page",
    wide: true,
    body: [
      h("label", { class: "field" },
        h("span", { class: "field__label" }, "Name"),
        nameInput,
        h("span", { class: "field__hint" }, "A page is a small database: fields, views and entries. Pick a starting point.")),
      grid,
    ],
    footer: [
      h("div", { class: "u-grow" }),
      h("button", { class: "btn", onClick: () => closeTopModal() }, "Cancel"),
      h("button", { class: "btn btn--primary", onClick: submit }, "Create page"),
    ],
    initialFocus: "input",
  });
}

export function openPageSettings(pageId) {
  const page = pageById(store.state, pageId);
  if (!page) return;
  let iconName = page.icon;
  const nameInput = h("input", { class: "input", value: page.name });
  const descInput = h("input", { class: "input", value: page.description || "", placeholder: "What this page is for" });
  const iconButton = h(
    "button",
    {
      class: "btn", style: { gap: "8px" },
      onClick: (event) => openIconMenu(event.currentTarget, iconName, (picked) => {
        iconName = picked;
        iconButton.replaceChildren(icon(picked, 16), document.createTextNode("Change icon"));
      }),
    },
    icon(iconName, 16), "Change icon"
  );

  openModal({
    title: "Page settings",
    body: [
      h("label", { class: "field" }, h("span", { class: "field__label" }, "Name"), nameInput),
      h("label", { class: "field" }, h("span", { class: "field__label" }, "Description"), descInput),
      h("div", { class: "field" }, h("span", { class: "field__label" }, "Icon"), iconButton),
    ],
    footer: [
      h(
        "button",
        {
          class: "btn btn--danger",
          onClick: () => {
            closeTopModal();
            confirmDialog({
              title: `Delete "${page.name}"?`,
              message: `This removes the page and its ${page.records.length} entries.`,
              onConfirm: () => {
                deletePage(page.id);
                router.navigate("#/pages");
                toast("Page deleted", { action: { label: "Undo", onClick: () => store.undo() } });
              },
            });
          },
        },
        icon("trash", 15), "Delete"
      ),
      h("div", { class: "u-grow" }),
      h("button", { class: "btn", onClick: () => closeTopModal() }, "Cancel"),
      h(
        "button",
        {
          class: "btn btn--primary",
          onClick: () => {
            updatePage(page.id, { name: nameInput.value.trim() || page.name, description: descInput.value, icon: iconName });
            closeTopModal();
          },
        },
        "Save"
      ),
    ],
  });
}

export function openFieldEditor(pageId) {
  const reopen = () => { closeTopModal(); openFieldEditor(pageId); };
  const page = pageById(store.state, pageId);
  if (!page) return;

  const fieldRow = (field) =>
    h(
      "div", { class: "field-row" },
      icon(FIELD_TYPES.find((t) => t.id === field.type)?.icon || "text", 15),
      h("input", {
        class: "input input--ghost u-grow", value: field.name,
        onChange: (event) => updateField(pageId, field.id, { name: event.target.value.trim() || field.name }),
      }),
      h(
        "select",
        {
          class: "select", style: { width: "130px" },
          onChange: (event) => { updateField(pageId, field.id, { type: event.target.value }); reopen(); },
        },
        ...FIELD_TYPES.map((type) => h("option", { value: type.id, selected: type.id === field.type }, type.name))
      ),
      field.type === "select"
        ? h(
            "button",
            {
              class: "btn btn--ghost btn--icon btn--sm", title: "Options",
              onClick: (event) =>
                showMenu(event.currentTarget, [
                  { heading: "Options" },
                  ...(field.options || []).map((option) => ({ label: option.name, icon: "circle" })),
                  { separator: true },
                  {
                    label: "Add option…", icon: "plus",
                    onClick: () => {
                      const name = prompt("Option name");
                      if (name) { addSelectOption(pageId, field.id, name, SWATCHES[(field.options?.length || 0) % SWATCHES.length]); reopen(); }
                    },
                  },
                ]),
            },
            icon("list", 15)
          )
        : null,
      h(
        "button",
        {
          class: "btn btn--ghost btn--icon btn--sm", title: "Use as the entry title",
          style: field.primary ? { color: "var(--accent)" } : null,
          onClick: () => {
            for (const other of page.fields) updateField(pageId, other.id, { primary: other.id === field.id });
            reopen();
          },
        },
        icon("star", 15)
      ),
      h(
        "button",
        {
          class: "btn btn--ghost btn--icon btn--sm btn--danger", title: "Delete field",
          onClick: () => { deleteField(pageId, field.id); reopen(); },
        },
        icon("trash", 15)
      )
    );

  openModal({
    title: `Fields · ${page.name}`,
    wide: true,
    body: [
      h("div", { class: "u-col", style: { gap: "8px" } }, ...page.fields.map(fieldRow)),
      h(
        "button",
        { class: "btn btn--dashed btn--block", onClick: () => { addField(pageId, {}); reopen(); } },
        icon("plus", 15), "Add field"
      ),
      h("p", { class: "field__hint" }, "The starred field is used as each entry's title. Deleting a field also clears its values."),
    ],
    footer: [h("div", { class: "u-grow" }), h("button", { class: "btn btn--primary", onClick: () => closeTopModal() }, "Done")],
  });
}

export function openViewEditor(pageId, viewId = null) {
  const page = pageById(store.state, pageId);
  if (!page) return;
  const view = viewId ? page.views.find((v) => v.id === viewId) : null;
  let type = view?.type || "table";
  const nameInput = h("input", { class: "input", value: view?.name || "", placeholder: "View name" });
  const groupSelect = h(
    "select", { class: "select" },
    h("option", { value: "" }, "No grouping"),
    ...page.fields.filter((f) => f.type === "select").map((f) => h("option", { value: f.id, selected: view?.groupBy === f.id }, f.name))
  );
  const sortSelect = h(
    "select", { class: "select" },
    h("option", { value: "" }, "Newest first"),
    ...page.fields.map((f) => h("option", { value: f.id, selected: view?.sortBy === f.id }, `By ${f.name}`))
  );
  const dirSelect = h(
    "select", { class: "select" },
    h("option", { value: "desc", selected: (view?.sortDir || "desc") === "desc" }, "Descending"),
    h("option", { value: "asc", selected: view?.sortDir === "asc" }, "Ascending")
  );
  const typeRow = h(
    "div", { class: "u-row", style: { gap: "6px", flexWrap: "wrap" } },
    ...VIEW_TYPES.map((option) => {
      const button = h(
        "button",
        {
          class: "btn btn--sm", dataset: { type: option.id },
          style: type === option.id ? { borderColor: "var(--accent)", color: "var(--accent)" } : null,
          onClick: () => {
            type = option.id;
            for (const node of typeRow.children) {
              const on = node.dataset.type === type;
              node.style.borderColor = on ? "var(--accent)" : "";
              node.style.color = on ? "var(--accent)" : "";
            }
          },
        },
        icon(option.icon, 15), option.name
      );
      return button;
    })
  );

  openModal({
    title: view ? "Edit view" : "New view",
    body: [
      h("label", { class: "field" }, h("span", { class: "field__label" }, "Name"), nameInput),
      h("div", { class: "field" }, h("span", { class: "field__label" }, "Layout"), typeRow),
      h("label", { class: "field" },
        h("span", { class: "field__label" }, "Group by"), groupSelect,
        h("span", { class: "field__hint" }, "Board layouts need a select field to group by.")),
      h("div", { class: "u-row", style: { gap: "10px" } },
        h("label", { class: "field u-grow" }, h("span", { class: "field__label" }, "Sort"), sortSelect),
        h("label", { class: "field", style: { width: "150px" } }, h("span", { class: "field__label" }, "Direction"), dirSelect)),
    ],
    footer: [
      view && page.views.length > 1
        ? h("button", { class: "btn btn--danger", onClick: () => { deleteView(pageId, view.id); closeTopModal(); } }, "Delete view")
        : null,
      h("div", { class: "u-grow" }),
      h("button", { class: "btn", onClick: () => closeTopModal() }, "Cancel"),
      h(
        "button",
        {
          class: "btn btn--primary",
          onClick: () => {
            const patch = {
              name: nameInput.value.trim() || VIEW_TYPES.find((v) => v.id === type).name,
              type,
              groupBy: groupSelect.value || null,
              sortBy: sortSelect.value || null,
              sortDir: dirSelect.value,
            };
            if (view) updateView(pageId, view.id, patch);
            else {
              const id = addView(pageId, patch);
              router.setQuery({ view: id });
            }
            closeTopModal();
          },
        },
        view ? "Save view" : "Add view"
      ),
    ],
    initialFocus: "input",
  });
}

/* ---------------- habits ---------------- */

export function openHabitDialog(habitId = null) {
  const habit = habitId ? store.state.habits.find((x) => x.id === habitId) : null;
  let color = habit?.color || SWATCHES[0];
  let swatchRow;
  const nameInput = h("input", { class: "input", value: habit?.name || "", placeholder: "e.g. Read 20 pages", autofocus: true });
  const targetInput = h("input", { class: "input", type: "number", min: "1", max: "7", value: String(habit?.target || 7) });

  const rebuildSwatches = () => {
    const next = colorPicker(color, (picked) => { color = picked; swatchRow.replaceWith(rebuildSwatches()); });
    swatchRow = next;
    return next;
  };

  const submit = () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    const target = Math.max(1, Math.min(7, Number(targetInput.value) || 7));
    if (habit) updateHabit(habit.id, { name, target, color });
    else createHabit({ name, target, color });
    closeTopModal();
  };

  openModal({
    title: habit ? "Edit habit" : "New habit",
    body: [
      h("label", { class: "field" },
        h("span", { class: "field__label" }, "Habit"),
        nameInput,
        h("span", { class: "field__hint" }, "Name it as an action you can tick off in a day.")),
      h("label", { class: "field" }, h("span", { class: "field__label" }, "Days per week"), targetInput),
      h("div", { class: "field" }, h("span", { class: "field__label" }, "Colour"), rebuildSwatches()),
    ],
    footer: [
      habit
        ? h("button", { class: "btn btn--danger", onClick: () => { deleteHabit(habit.id); closeTopModal(); toast("Habit deleted", { action: { label: "Undo", onClick: () => store.undo() } }); } }, "Delete")
        : null,
      h("div", { class: "u-grow" }),
      h("button", { class: "btn", onClick: () => closeTopModal() }, "Cancel"),
      h("button", { class: "btn btn--primary", onClick: submit }, habit ? "Save" : "Add habit"),
    ],
    initialFocus: "input",
  });
}

/* ---------------- keyboard help ---------------- */

const SHORTCUTS = [
  ["Ctrl / ⌘ + K", "Search and jump anywhere"],
  ["N", "New task"],
  ["P", "New project"],
  ["G then T", "Go to Today"],
  ["G then P", "Go to Projects"],
  ["G then C", "Go to Calendar"],
  ["G then H", "Go to Habits"],
  ["G then N", "Go to Notes"],
  ["G then R", "Go to Review"],
  ["F", "Start or pause the focus timer"],
  ["\\", "Show or hide the sidebar"],
  ["Ctrl / ⌘ + Z", "Undo"],
  ["Ctrl / ⌘ + Shift + Z", "Redo"],
  ["?", "This list"],
  ["Esc", "Close whatever is open"],
];

export function openShortcuts() {
  openModal({
    title: "Keyboard shortcuts",
    body: h(
      "div", { class: "u-col", style: { gap: "2px" } },
      ...SHORTCUTS.map(([keys, what]) =>
        h(
          "div", { class: "u-row", style: { justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--line-soft)" } },
          h("span", { style: { fontSize: "13px" } }, what),
          h("span", { class: "kbd" }, keys)
        )
      )
    ),
    footer: [h("div", { class: "u-grow" }), h("button", { class: "btn btn--primary", onClick: () => closeTopModal() }, "Got it")],
  });
}
