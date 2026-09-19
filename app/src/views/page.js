import { h } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { router } from "../router.js";
import { showMenu } from "../ui/menu.js";
import { confirmDialog } from "../ui/modal.js";
import { toast } from "../ui/toast.js";
import { emptyState, rating } from "../ui/controls.js";
import { openRecordDrawer, fieldValueNode } from "../ui/drawer.js";
import { openPageSettings, openFieldEditor, openViewEditor } from "../ui/dialogs.js";
import { createRecord, updateRecord, deleteRecord } from "../store/actions.js";
import { pageById, primaryField, recordTitle, sortRecords } from "../store/selectors.js";
import { formatDay, relativeTime } from "../lib/date.js";
import { VIEW_TYPES } from "../store/templates.js";
import { store } from "../store/state.js";

function matchesSearch(page, record, query) {
  if (!query) return true;
  const haystack = Object.values(record.values || {})
    .map((value) => (Array.isArray(value) ? value.join(" ") : String(value ?? "")))
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function recordMenu(page, record) {
  return [
    { label: "Open", icon: "external", onClick: () => openRecordDrawer(page.id, record.id) },
    { separator: true },
    {
      label: "Delete entry", icon: "trash", danger: true,
      onClick: () => {
        const run = () => { deleteRecord(page.id, record.id); toast("Entry deleted", { action: { label: "Undo", onClick: () => store.undo() } }); };
        if (store.state.settings.confirmDelete) {
          confirmDialog({ title: "Delete this entry?", message: `"${recordTitle(page, record)}" will be removed.`, onConfirm: run });
        } else run();
      },
    },
  ];
}

/* ---------------- layouts ---------------- */

function tableLayout(page, records) {
  const fields = page.fields.slice(0, 7);
  return h(
    "div", { class: "table-wrap" },
    h(
      "table", { class: "table" },
      h("thead", null, h(
        "tr", null,
        ...fields.map((field) => h("th", null, field.name)),
        h("th", { style: { width: "40px" } }, "")
      )),
      h(
        "tbody", null,
        ...records.map((record) =>
          h(
            "tr",
            { onClick: () => openRecordDrawer(page.id, record.id), style: { cursor: "pointer" } },
            ...fields.map((field, index) =>
              h("td", { class: index === 0 ? "is-primary" : null }, fieldValueNode(page, record, field))),
            h("td", null, h(
              "button",
              {
                class: "btn btn--ghost btn--icon btn--sm table__row-open", "aria-label": "Entry actions",
                onClick: (event) => { event.stopPropagation(); showMenu(event.currentTarget, recordMenu(page, record), { align: "end" }); },
              },
              icon("more-v", 15)
            ))
          )
        )
      )
    )
  );
}

function recordCard(page, record, { showFields }) {
  const title = recordTitle(page, record);
  return h(
    "article",
    {
      class: "gcard", draggable: "true", tabindex: "0", role: "button",
      onClick: (event) => { if (!event.target.closest("button")) openRecordDrawer(page.id, record.id); },
      onKeydown: (event) => { if (event.key === "Enter") openRecordDrawer(page.id, record.id); },
      onDragstart: (event) => { event.dataTransfer.setData("text/plain", record.id); event.dataTransfer.effectAllowed = "move"; },
    },
    h(
      "div", { class: "u-row" },
      h("h3", { class: "gcard__title u-grow u-clamp-2" }, title),
      h(
        "button",
        {
          class: "tcard__menu", "aria-label": "Entry actions", style: { opacity: "0.6" },
          onClick: (event) => { event.stopPropagation(); showMenu(event.currentTarget, recordMenu(page, record), { align: "end" }); },
        },
        icon("more-v", 15)
      )
    ),
    ...showFields.map((field) => {
      const value = record.values?.[field.id];
      if (value === null || value === undefined || value === "") return null;
      if (field.type === "longtext") return h("p", { class: "gcard__meta u-clamp-3", style: { lineHeight: "1.55" } }, String(value));
      return h("div", { class: "gcard__meta" }, h("span", { class: "u-dim" }, `${field.name}:`), fieldValueNode(page, record, field));
    })
  );
}

function boardLayout(page, records, view) {
  const field = page.fields.find((f) => f.id === view.groupBy && f.type === "select");
  if (!field) {
    return emptyState({
      icon: "board", title: "This board needs a select field",
      text: "Pick a field to group by, or add a select field to this page.",
      action: h("button", { class: "btn btn--sm", onClick: () => openViewEditor(page.id, view.id) }, "Choose a field"),
    });
  }
  const showFields = page.fields.filter((f) => f.id !== field.id && f.id !== primaryField(page)?.id).slice(0, 2);
  const groups = [
    ...(field.options || []).map((option) => ({ id: option.id, name: option.name, color: option.color })),
    { id: "__none", name: "Unset", color: "var(--ink-3)" },
  ];

  return h(
    "div", { class: "board-scroll" },
    h(
    "div", { class: "board", style: { padding: "0" } },
    ...groups.map((group) => {
      const groupRecords = records.filter((record) => (record.values?.[field.id] || "__none") === group.id);
      const list = h(
        "div", { class: "column__list" },
        ...groupRecords.map((record) => recordCard(page, record, { showFields })),
        h(
          "button",
          {
            class: "btn btn--dashed btn--block",
            onClick: () => {
              const id = createRecord(page.id, group.id === "__none" ? {} : { [field.id]: group.id });
              openRecordDrawer(page.id, id);
            },
          },
          icon("plus", 15), "Add"
        )
      );
      list.addEventListener("dragover", (event) => { event.preventDefault(); list.dataset.dropping = "true"; });
      list.addEventListener("dragleave", () => { list.dataset.dropping = "false"; });
      list.addEventListener("drop", (event) => {
        event.preventDefault();
        list.dataset.dropping = "false";
        const recordId = event.dataTransfer.getData("text/plain");
        if (recordId) updateRecord(page.id, recordId, { [field.id]: group.id === "__none" ? null : group.id });
      });

      return h(
        "div", { class: "column" },
        h(
          "div", { class: "column__head" },
          h("span", { class: "nav-item__swatch", style: { background: group.color } }),
          h("span", { class: "column__name" }, group.name),
          h("span", { class: "column__count" }, String(groupRecords.length))
        ),
        list
      );
    })
    )
  );
}

function galleryLayout(page, records) {
  const title = primaryField(page);
  const showFields = page.fields.filter((field) => field.id !== title?.id).slice(0, 3);
  return h("div", { class: "gallery" }, ...records.map((record) => recordCard(page, record, { showFields })));
}

function listLayout(page, records) {
  const titleField = primaryField(page);
  const dateField = page.fields.find((f) => f.type === "date");
  const bodyField = page.fields.find((f) => f.type === "longtext");
  const chipFields = page.fields.filter((f) => ["select", "rating", "tags", "number"].includes(f.type)).slice(0, 3);

  return h(
    "div", { class: "u-col", style: { gap: "10px" } },
    ...records.map((record) => {
      const dateValue = dateField ? record.values?.[dateField.id] : null;
      const heading = dateValue ? formatDay(dateValue, { weekday: true }) : recordTitle(page, record);
      const secondary = dateValue && titleField ? record.values?.[titleField.id] : null;
      return h(
        "button",
        { class: "note-card", style: { minHeight: "auto" }, onClick: () => openRecordDrawer(page.id, record.id) },
        h(
          "div", { class: "u-row" },
          h("span", { class: "note-card__title u-grow" }, heading),
          ...chipFields.map((field) =>
            record.values?.[field.id] !== undefined && record.values?.[field.id] !== null && record.values?.[field.id] !== ""
              ? fieldValueNode(page, record, field)
              : null)
        ),
        secondary ? h("div", { class: "u-dim", style: { fontSize: "12.5px" } }, String(secondary)) : null,
        bodyField && record.values?.[bodyField.id]
          ? h("p", { class: "note-card__body u-clamp-3" }, String(record.values[bodyField.id]))
          : null,
        h("div", { class: "note-card__foot" }, h("span", null, `Edited ${relativeTime(record.updatedAt)}`))
      );
    })
  );
}

/* ---------------- view ---------------- */

export function pageView({ state, route }) {
  const page = pageById(state, route.parts[1]);
  if (!page) {
    return {
      topbar: { crumbs: [{ label: "Pages", href: "#/pages" }], title: "Page not found" },
      body: h("div", { class: "view__inner" }, emptyState({
        icon: "alert", title: "That page is gone", text: "It may have been deleted.",
        action: h("a", { class: "btn btn--sm", href: "#/pages" }, "Back to pages"),
      })),
    };
  }

  const view = page.views.find((v) => v.id === route.query.view) || page.views[0];
  const query = (route.query.q || "").toLowerCase();
  const records = sortRecords(page, view).filter((record) => matchesSearch(page, record, query));

  const viewTabs = h(
    "div", { class: "u-row", style: { gap: "4px", flexWrap: "wrap" } },
    ...page.views.map((option) =>
      h(
        "button",
        {
          class: ["btn", "btn--sm", option.id === view.id && "btn--primary"].filter(Boolean).join(" "),
          onClick: (event) => {
            if (option.id === view.id) {
              showMenu(event.currentTarget, [
                { label: "Edit view", icon: "pencil", onClick: () => openViewEditor(page.id, option.id) },
                page.views.length > 1
                  ? { label: "Delete view", icon: "trash", danger: true, onClick: () => { import("../store/actions.js").then((m) => m.deleteView(page.id, option.id)); } }
                  : null,
              ].filter(Boolean));
              return;
            }
            router.setQuery({ view: option.id });
          },
        },
        icon(VIEW_TYPES.find((t) => t.id === option.type)?.icon || "table", 14),
        option.name
      )
    ),
    h("button", { class: "btn btn--ghost btn--icon btn--sm", "aria-label": "New view", onClick: () => openViewEditor(page.id) }, icon("plus", 15))
  );

  let layout;
  if (!records.length) {
    layout = emptyState({
      icon: page.icon || "note",
      title: query ? "Nothing matches" : `No entries in ${page.name} yet`,
      text: query ? "Try a different word." : page.description || "Add the first entry — every field is editable afterwards.",
      action: query
        ? h("button", { class: "btn btn--sm", onClick: () => router.setQuery({ q: null }) }, "Clear search")
        : h("button", { class: "btn btn--primary btn--sm", onClick: () => openRecordDrawer(page.id, createRecord(page.id)) }, icon("plus", 14), "New entry"),
    });
  } else if (view.type === "board") layout = boardLayout(page, records, view);
  else if (view.type === "gallery") layout = galleryLayout(page, records);
  else if (view.type === "list") layout = listLayout(page, records);
  else layout = tableLayout(page, records);

  const body = h(
    "div", { class: "view__inner" },
    h(
      "div", { class: "filterbar" },
      viewTabs,
      h("div", { class: "u-grow" }),
      h(
        "div", { class: "quickadd", style: { maxWidth: "220px", padding: "2px 10px" } },
        icon("search", 14, "u-dim"),
        h("input", {
          class: "quickadd__input", dataset: { role: "filter" }, placeholder: `Search ${page.name.toLowerCase()}`, value: route.query.q || "",
          onInput: (event) => router.setQuery({ q: event.target.value || null }),
        })
      ),
      h("button", { class: "btn btn--sm", onClick: () => openFieldEditor(page.id) }, icon("sliders", 14), "Fields")
    ),
    layout
  );

  return {
    topbar: {
      crumbs: [{ label: "Pages", href: "#/pages" }, { label: page.name }],
      title: h("span", { class: "u-row", style: { gap: "10px" } }, icon(page.icon || "note", 20), page.name),
      titleExtra: h(
        "button",
        { class: "btn btn--ghost btn--icon btn--sm", "aria-label": "Page settings", onClick: () => openPageSettings(page.id) },
        icon("pencil", 14)
      ),
      subtitle: page.description || `${page.records.length} entries · ${page.fields.length} fields`,
      status: `${records.length} shown`,
      tools: [
        h(
          "button",
          {
            class: "btn btn--sm", "aria-label": "Page options",
            onClick: (event) => showMenu(event.currentTarget, [
              { label: "Page settings", icon: "settings", onClick: () => openPageSettings(page.id) },
              { label: "Edit fields", icon: "sliders", onClick: () => openFieldEditor(page.id) },
              { label: "New view", icon: "plus", onClick: () => openViewEditor(page.id) },
            ], { align: "end" }),
          },
          icon("more-v", 15)
        ),
        h(
          "button",
          { class: "btn btn--primary btn--sm", onClick: () => openRecordDrawer(page.id, createRecord(page.id)) },
          icon("plus", 14), "New entry"
        ),
      ],
    },
    body,
  };
}

export function pagesIndexView({ state }) {
  const body = h(
    "div", { class: "view__inner" },
    state.pages.length
      ? h(
          "div", { class: "gallery" },
          ...state.pages.map((page) =>
            h(
              "a", { class: "gcard", href: `#/pages/${page.id}`, style: { padding: "16px", gap: "10px" } },
              h("div", { class: "u-row" },
                h("span", { class: "palette__icon" }, icon(page.icon || "note", 16)),
                h("span", { class: "gcard__title u-grow u-truncate" }, page.name)),
              page.description ? h("p", { class: "gcard__meta u-clamp-2", style: { lineHeight: "1.5" } }, page.description) : null,
              h("div", { class: "gcard__meta", style: { marginTop: "auto" } },
                h("span", null, `${page.records.length} entries`),
                h("span", null, "·"),
                h("span", null, `${page.views.length} view${page.views.length === 1 ? "" : "s"}`))
            )
          ),
          h(
            "button",
            { class: "gcard", style: { alignItems: "center", justifyContent: "center", borderStyle: "dashed", minHeight: "132px" },
              onClick: () => import("../ui/dialogs.js").then((m) => m.openNewPage()) },
            icon("plus", 20), h("span", { class: "gcard__title" }, "New page")
          )
        )
      : emptyState({
          icon: "layers", title: "No pages yet",
          text: "A page is a small database — a journal, a reading list, a training log, anything with fields you choose.",
          action: h("button", { class: "btn btn--primary btn--sm", onClick: () => import("../ui/dialogs.js").then((m) => m.openNewPage()) }, icon("plus", 14), "New page"),
        })
  );

  return {
    topbar: {
      crumbs: [{ label: "Dezk", href: "#/today" }, { label: "Pages" }],
      title: "Pages",
      subtitle: "Your own collections — journal, reading list, goals, or something you invent",
      tools: [h("button", { class: "btn btn--primary btn--sm", onClick: () => import("../ui/dialogs.js").then((m) => m.openNewPage()) }, icon("plus", 14), "New page")],
    },
    body,
  };
}
