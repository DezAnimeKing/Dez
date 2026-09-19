import { h } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { store, storageKind, DEFAULT_SETTINGS } from "../store/state.js";
import { setSetting } from "../store/actions.js";
import { toast } from "../ui/toast.js";
import { confirmDialog } from "../ui/modal.js";
import { openShortcuts, openCategoryManager } from "../ui/dialogs.js";
import { ACCENTS } from "../ui/controls.js";
import { panel } from "./parts.js";
import { syncSettingsRows } from "../ui/syncui.js";
import { DOW_LONG } from "../lib/date.js";

export function exportData() {
  const blob = new Blob([store.exportJSON()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = h("a", { href: url, download: `dezk-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Backup downloaded");
}

function importData() {
  const input = h("input", {
    type: "file", accept: "application/json,.json", style: { display: "none" },
    onChange: async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        store.importJSON(await file.text());
        toast("Data imported", { action: { label: "Undo", onClick: () => store.undo() } });
      } catch (error) {
        toast(error.message || "That file could not be read");
      }
      input.remove();
    },
  });
  document.body.appendChild(input);
  input.click();
}

function row(title, description, control) {
  return h(
    "div", { class: "settings-row" },
    h("div", { class: "settings-row__text" },
      h("div", { class: "settings-row__title" }, title),
      description ? h("div", { class: "settings-row__desc" }, description) : null),
    control
  );
}

function toggleControl(value, onChange) {
  return h("button", {
    class: "switch", role: "switch", type: "button",
    "aria-checked": String(Boolean(value)),
    onClick: () => onChange(!value),
  });
}

function numberControl(value, onChange, { min = 1, max = 180, suffix = "min" } = {}) {
  return h(
    "div", { class: "u-row", style: { gap: "6px" } },
    h("input", {
      class: "input", type: "number", min: String(min), max: String(max), value: String(value),
      style: { width: "84px" },
      onChange: (event) => onChange(Math.max(min, Math.min(max, Number(event.target.value) || min))),
    }),
    h("span", { class: "u-dim", style: { fontSize: "12.5px" } }, suffix)
  );
}

export function settingsView({ state }) {
  const settings = state.settings;
  const counts = {
    tasks: state.tasks.length,
    projects: state.projects.length,
    pages: state.pages.length,
    entries: state.pages.reduce((sum, page) => sum + page.records.length, 0),
    notes: state.notes.length,
    habits: state.habits.length,
  };
  const approximateSize = new Blob([JSON.stringify(state)]).size;

  const body = h(
    "div", { class: "view__inner", style: { maxWidth: "760px" } },
    h(
      "div", { class: "u-col", style: { gap: "16px" } },
      panel("Sync", syncSettingsRows(), { icon: "globe" }),
      panel(
        "Appearance",
        h(
          "div", null,
          row("Theme", "Dark is the default. The rail's moon icon toggles it too.",
            h(
              "div", { class: "u-row", style: { gap: "6px" } },
              ...["dark", "light"].map((theme) =>
                h(
                  "button",
                  {
                    class: ["btn", "btn--sm", settings.theme === theme && "btn--primary"].filter(Boolean).join(" "),
                    onClick: () => setSetting("theme", theme),
                  },
                  icon(theme === "dark" ? "moon" : "sun", 14),
                  theme === "dark" ? "Dark" : "Light"
                )
              )
            )),
          row("Accent colour", "Used for highlights, progress and the focus ring.",
            h(
              "div", { class: "swatches" },
              ...ACCENTS.map((accent) =>
                h("button", {
                  class: "swatch",
                  style: { background: `hsl(${accent.h} ${accent.s} ${accent.l})` },
                  "aria-pressed": String(settings.accent === accent.id),
                  "aria-label": accent.name, title: accent.name,
                  onClick: () => setSetting("accent", accent.id),
                })
              )
            )),
          row("Week starts on", "Affects the calendar and the habit strip.",
            h(
              "select",
              { class: "select", style: { width: "150px" }, onChange: (event) => setSetting("weekStart", Number(event.target.value)) },
              ...[1, 0, 6].map((day) => h("option", { value: String(day), selected: settings.weekStart === day }, DOW_LONG[day]))
            ))
        ),
        { icon: "image" }
      ),
      panel(
        "Behaviour",
        h(
          "div", null,
          row("Your name", "Used in the greeting on Today.",
            h("input", {
              class: "input", style: { width: "200px" }, value: settings.displayName || "", placeholder: "Optional",
              onChange: (event) => setSetting("displayName", event.target.value.trim()),
            })),
          row("Show completed tasks", "When off, finished tasks are hidden from lists.",
            toggleControl(settings.showCompleted, (value) => setSetting("showCompleted", value))),
          row("Confirm before deleting", "Turn off if you prefer undo over dialogs.",
            toggleControl(settings.confirmDelete, (value) => setSetting("confirmDelete", value))),
          row("Focus block", "Length of one focus round.",
            numberControl(settings.focusMinutes, (value) => setSetting("focusMinutes", value))),
          row("Short break", "After each focus round.",
            numberControl(settings.breakMinutes, (value) => setSetting("breakMinutes", value), { max: 60 })),
          row("Long break", "After four focus rounds.",
            numberControl(settings.longBreakMinutes, (value) => setSetting("longBreakMinutes", value), { max: 90 })),
          row("Categories", "Group projects in the sidebar.",
            h("button", { class: "btn btn--sm", onClick: () => openCategoryManager() }, icon("folder", 14), "Manage"))
        ),
        { icon: "settings" }
      ),
      panel(
        "Your data",
        h(
          "div", null,
          h(
            "p", { class: "u-dim", style: { fontSize: "13px", lineHeight: "1.6", paddingBottom: "6px" } },
            `Everything lives in this browser — ${counts.tasks} tasks, ${counts.projects} projects, ${counts.pages} pages holding ${counts.entries} entries, ${counts.notes} notes and ${counts.habits} habits, about ${(approximateSize / 1024).toFixed(0)} KB in all. `,
            storageKind === "memory"
              ? "This browser is blocking local storage, so changes will be lost when you close the tab — export a backup before you go."
              : store.state.sync.url
                ? "It is also mirrored to your own sync server, so your other devices see the same thing. A backup is still worth keeping."
                : "Nothing is sent anywhere. Turn on syncing above to share it with your other devices, or export a backup to move it by hand."
          ),
          row("Backup", "Download everything as a JSON file.",
            h("button", { class: "btn btn--sm", onClick: exportData }, icon("download", 14), "Export")),
          row("Restore", "Replace what is here with a backup file.",
            h("button", { class: "btn btn--sm", onClick: importData }, icon("upload", 14), "Import")),
          row("Sample data", "Reload the demo projects, pages and habits.",
            h(
              "button",
              {
                class: "btn btn--sm",
                onClick: () => confirmDialog({
                  title: "Replace everything with sample data?",
                  message: "Your current tasks, pages and notes are replaced. You can undo this straight afterwards.",
                  confirmLabel: "Load sample data", danger: false,
                  onConfirm: () => { store.resetToSeed(); toast("Sample data loaded", { action: { label: "Undo", onClick: () => store.undo() } }); },
                }),
              },
              icon("sparkles", 14), "Load"
            )),
          row("Start fresh", "Delete everything and keep your settings.",
            h(
              "button",
              {
                class: "btn btn--sm btn--danger",
                onClick: () => confirmDialog({
                  title: "Delete all your data?",
                  message: "Tasks, projects, pages, notes and habits are all removed. Export a backup first if you are not sure.",
                  confirmLabel: "Delete everything",
                  onConfirm: () => { store.resetEmpty(); toast("Everything cleared", { action: { label: "Undo", onClick: () => store.undo() } }); },
                }),
              },
              icon("trash", 14), "Clear"
            ))
        ),
        { icon: "download" }
      ),
      panel(
        "About",
        h(
          "div", null,
          h("p", { class: "u-dim", style: { fontSize: "13px", lineHeight: "1.6" } },
            "Dezk is a local-first daily deck: tasks and project boards, a calendar, habits, notes, and pages you shape yourself. No account, no server, no build step — it is plain HTML, CSS and JavaScript."),
          row("Keyboard shortcuts", "Everything you can do without the mouse.",
            h("button", { class: "btn btn--sm", onClick: () => openShortcuts() }, icon("command", 14), "Show")),
          row("Reset preferences", "Put appearance and behaviour back to defaults.",
            h(
              "button",
              {
                class: "btn btn--sm",
                onClick: () => {
                  store.mutate((draft) => { draft.settings = { ...DEFAULT_SETTINGS }; }, { undoable: true, label: "Settings reset" });
                  toast("Preferences reset");
                },
              },
              icon("reset", 14), "Reset"
            ))
        ),
        { icon: "info" }
      )
    )
  );

  return {
    topbar: {
      crumbs: [{ label: "Dezk", href: "#/today" }, { label: "Settings" }],
      title: "Settings",
      subtitle: "Appearance, behaviour and your data",
      tools: [],
    },
    body,
  };
}
