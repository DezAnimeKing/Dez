import { h, debounce } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { router } from "../router.js";
import { showMenu } from "../ui/menu.js";
import { confirmDialog } from "../ui/modal.js";
import { toast } from "../ui/toast.js";
import { emptyState, tagChip } from "../ui/controls.js";
import { createNote, updateNote, deleteNote } from "../store/actions.js";
import { noteById, allTags } from "../store/selectors.js";
import { relativeTime } from "../lib/date.js";
import { store } from "../store/state.js";

const saveTitle = debounce((id, value) => updateNote(id, { title: value }, { silent: true }), 400);
const saveBody = debounce((id, value) => updateNote(id, { body: value }, { silent: true }), 400);

function noteEditor(state, note) {
  return h(
    "div", { class: "panel", style: { display: "flex", flexDirection: "column", minHeight: "440px" } },
    h(
      "div", { class: "panel__head" },
      h("input", {
        class: "input input--ghost input--title u-grow", value: note.title, placeholder: "Untitled note",
        "aria-label": "Note title",
        onInput: (event) => saveTitle(note.id, event.target.value),
        onBlur: () => saveTitle.flush(),
      }),
      h(
        "div", { class: "panel__tools" },
        h(
          "button",
          {
            class: "btn btn--ghost btn--icon btn--sm", "aria-label": note.pinned ? "Unpin" : "Pin",
            style: note.pinned ? { color: "var(--accent)" } : null,
            onClick: () => updateNote(note.id, { pinned: !note.pinned }),
          },
          icon("pin", 15)
        ),
        h(
          "button",
          {
            class: "btn btn--ghost btn--icon btn--sm", "aria-label": "Note actions",
            onClick: (event) => showMenu(event.currentTarget, [
              { label: note.pinned ? "Unpin" : "Pin to top", icon: "pin", onClick: () => updateNote(note.id, { pinned: !note.pinned }) },
              {
                label: "Copy text", icon: "copy",
                onClick: async () => {
                  try { await navigator.clipboard.writeText(`${note.title}\n\n${note.body}`); toast("Copied"); }
                  catch { toast("Clipboard is blocked here"); }
                },
              },
              { separator: true },
              {
                label: "Delete note", icon: "trash", danger: true,
                onClick: () => confirmDialog({
                  title: "Delete this note?",
                  message: `"${note.title || "Untitled note"}" will be removed.`,
                  onConfirm: () => {
                    deleteNote(note.id);
                    router.setQuery({ note: null });
                    toast("Note deleted", { action: { label: "Undo", onClick: () => store.undo() } });
                  },
                }),
              },
            ], { align: "end" }),
          },
          icon("more-v", 15)
        ),
        h("button", { class: "btn btn--ghost btn--icon btn--sm", "aria-label": "Close note", onClick: () => router.setQuery({ note: null }) }, icon("x", 15))
      )
    ),
    h(
      "div", { class: "panel__body", style: { display: "flex", flexDirection: "column", gap: "12px", flex: "1" } },
      h("textarea", {
        class: "textarea editor__area", value: note.body, placeholder: "Start writing…",
        "aria-label": "Note body",
        onInput: (event) => saveBody(note.id, event.target.value),
        onBlur: () => saveBody.flush(),
      }),
      h(
        "div", { class: "u-row", style: { flexWrap: "wrap", gap: "6px" } },
        ...(note.tags || []).map((tag) => tagChip(tag, () => updateNote(note.id, { tags: note.tags.filter((t) => t !== tag) }))),
        h("input", {
          class: "input input--ghost", style: { width: "110px" }, placeholder: "+ tag",
          onKeydown: (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            const value = event.target.value.trim().toLowerCase().replace(/^[#+]/, "");
            if (value && !note.tags.includes(value)) updateNote(note.id, { tags: [...note.tags, value] });
            event.target.value = "";
          },
        }),
        h("span", { class: "u-dim u-grow", style: { fontSize: "11.5px", textAlign: "right" } }, `Saved ${relativeTime(note.updatedAt)}`)
      )
    )
  );
}

function noteCard(note, active) {
  return h(
    "button",
    {
      class: "note-card",
      style: active ? { borderColor: "var(--accent)" } : null,
      onClick: () => router.setQuery({ note: note.id }),
    },
    h(
      "div", { class: "u-row" },
      h("span", { class: "note-card__title u-grow u-truncate" }, note.title || "Untitled note"),
      note.pinned ? icon("pin", 13) : null
    ),
    h("p", { class: "note-card__body u-clamp-3" }, note.body || "Empty"),
    h(
      "div", { class: "note-card__foot" },
      ...(note.tags || []).slice(0, 3).map((tag) => tagChip(tag)),
      h("span", { class: "u-dim", style: { marginLeft: "auto" } }, relativeTime(note.updatedAt))
    )
  );
}

export function notesView({ state, route }) {
  const query = (route.query.q || "").toLowerCase();
  const tagFilter = route.query.tag || null;
  const activeNote = route.query.note ? noteById(state, route.query.note) : null;

  let notes = [...state.notes];
  if (query) notes = notes.filter((note) => `${note.title} ${note.body}`.toLowerCase().includes(query));
  if (tagFilter) notes = notes.filter((note) => (note.tags || []).includes(tagFilter));
  notes.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });

  const newNote = () => {
    const id = createNote({ title: "" });
    router.setQuery({ note: id });
  };

  const list = notes.length
    ? h("div", { class: "note-grid" }, ...notes.map((note) => noteCard(note, note.id === activeNote?.id)))
    : emptyState({
        icon: "note",
        title: query || tagFilter ? "No notes match" : "No notes yet",
        text: query || tagFilter ? "Try another word or clear the filter." : "Notes are for the thinking that does not fit on a task.",
        action: h("button", { class: "btn btn--primary btn--sm", onClick: newNote }, icon("plus", 14), "New note"),
      });

  const tags = allTags(state).filter((tag) => state.notes.some((note) => (note.tags || []).includes(tag.name)));

  const body = h(
    "div", { class: "view__inner" },
    h(
      "div", { class: "filterbar" },
      h(
        "div", { class: "quickadd", style: { maxWidth: "260px", padding: "2px 10px" } },
        icon("search", 14, "u-dim"),
        h("input", {
          class: "quickadd__input", dataset: { role: "filter" }, placeholder: "Search notes", value: route.query.q || "",
          onInput: (event) => router.setQuery({ q: event.target.value || null }),
        })
      ),
      tags.length
        ? h(
            "button",
            {
              class: ["btn", "btn--sm", tagFilter && "btn--primary"].filter(Boolean).join(" "),
              onClick: (event) => showMenu(event.currentTarget, [
                { label: "All tags", icon: "grid", active: !tagFilter, onClick: () => router.setQuery({ tag: null }) },
                { separator: true },
                ...tags.map((tag) => ({
                  label: `#${tag.name}`, icon: "tag", active: tagFilter === tag.name,
                  onClick: () => router.setQuery({ tag: tag.name }),
                })),
              ]),
            },
            icon("tag", 14), tagFilter ? `#${tagFilter}` : "Tags"
          )
        : null,
      h("div", { class: "u-grow" })
    ),
    activeNote
      ? h(
          "div", { class: "today-cols", style: { gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)" } },
          noteEditor(state, activeNote),
          h("div", { style: { minWidth: 0 } }, list)
        )
      : list
  );

  return {
    topbar: {
      crumbs: [{ label: "Dezk", href: "#/today" }, { label: "Notes" }],
      title: "Notes",
      subtitle: `${state.notes.length} note${state.notes.length === 1 ? "" : "s"}${notes.length !== state.notes.length ? ` · ${notes.length} shown` : ""}`,
      tools: [h("button", { class: "btn btn--primary btn--sm", onClick: newNote }, icon("plus", 14), "New note")],
    },
    body,
  };
}
