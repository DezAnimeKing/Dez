import { h } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { store } from "../store/state.js";
import { router } from "../router.js";
import { taskRow, inlineAdd, panel, groupHeader } from "./parts.js";
import { emptyState, checkbox, progressBar } from "../ui/controls.js";
import { openQuickAdd } from "../ui/quickadd.js";
import { openRecordDrawer } from "../ui/drawer.js";
import { todayAgenda, upcomingTasks, activeHabits, habitStreak, focusMinutesOn, completedOn, openTasks } from "../store/selectors.js";
import { toggleHabitDay, createRecord, updateRecord } from "../store/actions.js";
import { todayKey, formatFullDate, greeting, formatClock, formatDay } from "../lib/date.js";
import { timer, onTimer, toggle as toggleTimer, reset as resetTimer, setMode } from "../ui/timer.js";

function heroPanel(state) {
  const { overdue, due, done } = todayAgenda(state);
  const focusMinutes = focusMinutesOn(state);
  const name = state.settings.displayName?.trim();
  const habits = activeHabits(state);
  const habitsDone = habits.filter((habit) => habit.log?.[todayKey()]).length;

  return h(
    "section", { class: "hero" },
    h(
      "div",
      null,
      h("h2", { class: "hero__greet" }, `${greeting()}${name ? `, ${name}` : ""}.`),
      h("p", { class: "hero__date" }, formatFullDate(new Date())),
      h(
        "p", { class: "hero__date", style: { marginTop: "8px", maxWidth: "48ch" } },
        overdue.length
          ? overdue.length === 1
            ? "One task slipped past its date — clear it or move it first."
            : `${overdue.length} tasks slipped past their dates — clear or reschedule them first.`
          : due.length
            ? `${due.length} task${due.length > 1 ? "s" : ""} due today${done.length ? `, ${done.length} already done` : ""}.`
            : done.length
              ? "Everything due today is done. Nice."
              : "Nothing is due today. A good day to pull something forward."
      )
    ),
    h(
      "div", { class: "hero__stats" },
      h("div", { class: "hero__stat" }, h("b", null, String(done.length)), h("span", null, "done today")),
      h("div", { class: "hero__stat" }, h("b", null, String(due.length + overdue.length)), h("span", null, "left today")),
      h("div", { class: "hero__stat" }, h("b", null, `${focusMinutes}m`), h("span", null, "focus")),
      habits.length ? h("div", { class: "hero__stat" }, h("b", null, `${habitsDone}/${habits.length}`), h("span", null, "habits")) : null
    )
  );
}

function agendaPanel(state) {
  const { overdue, due, done } = todayAgenda(state);
  const showDone = state.settings.showCompleted;
  const nodes = [];

  if (overdue.length) {
    nodes.push(groupHeader("Overdue", overdue.length));
    nodes.push(h("div", { class: "tasklist" }, ...overdue.map((task) => taskRow(state, task))));
  }
  if (due.length) {
    nodes.push(groupHeader("Due today", due.length));
    nodes.push(h("div", { class: "tasklist" }, ...due.map((task) => taskRow(state, task))));
  }
  if (!overdue.length && !due.length) {
    nodes.push(
      emptyState({
        icon: "check-circle",
        title: "Today is clear",
        text: "Nothing is scheduled. Pull something from Upcoming, or add a task above.",
        action: h("a", { class: "btn btn--sm", href: "#/upcoming" }, "See what is next"),
      })
    );
  }
  if (done.length) {
    nodes.push(
      groupHeader(
        "Completed", done.length,
        h("button",
          { class: "btn btn--ghost btn--sm", style: { marginLeft: "auto" }, onClick: () => import("../store/actions.js").then((m) => m.setSetting("showCompleted", !showDone)) },
          showDone ? "Hide" : "Show")
      )
    );
    if (showDone) nodes.push(h("div", { class: "tasklist" }, ...done.map((task) => taskRow(state, task))));
  }

  return panel("Today", h("div", null, inlineAdd({ placeholder: "Add a task for today…", defaults: { due: todayKey() } }), ...nodes), {
    icon: "sun",
    tools: h("button", { class: "btn btn--sm", onClick: () => openQuickAdd({ due: todayKey() }) }, icon("plus", 14), "Task"),
  });
}

function timerPanel() {
  const clock = h("div", { class: "timer__clock" }, formatClock(timer.remaining));
  const mode = h("div", { class: "timer__mode" }, timer.mode === "focus" ? "Focus" : "Break");
  const bar = progressBar(timer.total ? ((timer.total - timer.remaining) / timer.total) * 100 : 0, { thin: true });
  const playButton = h(
    "button",
    { class: "btn btn--primary", onClick: () => toggleTimer() },
    icon(timer.running ? "pause" : "play", 15),
    timer.running ? "Pause" : "Start"
  );

  const body = h(
    "div", { class: "timer" },
    mode, clock,
    h("div", { style: { width: "100%" } }, bar),
    h(
      "div", { class: "u-row", style: { gap: "8px", marginTop: "6px" } },
      playButton,
      h("button", { class: "btn btn--icon", "aria-label": "Reset timer", onClick: () => resetTimer() }, icon("reset", 15)),
      h(
        "button",
        { class: "btn btn--sm", onClick: () => setMode(timer.mode === "focus" ? "break" : "focus") },
        timer.mode === "focus" ? "Take a break" : "Back to focus"
      )
    )
  );

  const unsubscribe = onTimer(() => {
    if (!body.isConnected) { unsubscribe(); return; }
    clock.textContent = formatClock(timer.remaining);
    mode.textContent = timer.mode === "focus" ? "Focus" : "Break";
    playButton.replaceChildren(icon(timer.running ? "pause" : "play", 15), document.createTextNode(timer.running ? "Pause" : "Start"));
    const fill = bar.querySelector(".progress__fill");
    if (fill) fill.style.width = `${timer.total ? ((timer.total - timer.remaining) / timer.total) * 100 : 0}%`;
  });

  return panel("Focus", body, { icon: "timer" });
}

function habitsPanel(state) {
  const habits = activeHabits(state).slice(0, 6);
  if (!habits.length) {
    return panel("Habits", emptyState({ icon: "repeat", title: "No habits yet", text: "Track the few things you want to do most days." }), { icon: "repeat" });
  }
  return panel(
    "Habits today",
    h(
      "div", { class: "u-col" },
      ...habits.map((habit) => {
        const on = Boolean(habit.log?.[todayKey()]);
        const streak = habitStreak(habit);
        return h(
          "div", { class: "mini-task", dataset: { done: String(on) } },
          checkbox(on, () => toggleHabitDay(habit.id), { round: true, label: habit.name }),
          h("span", { class: "mini-task__title u-grow u-truncate" }, habit.name),
          streak > 0 ? h("span", { class: "streak" }, icon("flame", 13), String(streak)) : null
        );
      })
    ),
    { icon: "repeat", tools: h("a", { class: "btn btn--ghost btn--sm", href: "#/habits" }, "All") }
  );
}

function journalPanel(state) {
  const page = state.pages.find((p) => p.template === "journal");
  if (!page) return null;
  const dateField = page.fields.find((f) => f.type === "date");
  const entryField = page.fields.find((f) => f.type === "longtext");
  if (!entryField) return null;

  const existing = dateField
    ? page.records.find((record) => record.values?.[dateField.id] === todayKey())
    : null;

  const textarea = h("textarea", {
    class: "textarea", style: { minHeight: "96px" },
    placeholder: existing ? "Keep going…" : "How did today actually go?",
    value: existing?.values?.[entryField.id] || "",
    onChange: (event) => {
      const value = event.target.value;
      if (!value.trim()) return;
      if (existing) updateRecord(page.id, existing.id, { [entryField.id]: value }, { silent: true });
      else createRecord(page.id, { [entryField.id]: value, ...(dateField ? { [dateField.id]: todayKey() } : {}) });
    },
  });

  return panel(
    existing ? "Today's entry" : "Journal",
    h(
      "div", { class: "u-col", style: { gap: "10px" } },
      textarea,
      h(
        "div", { class: "u-row" },
        h("span", { class: "u-dim u-grow", style: { fontSize: "11.5px" } }, existing ? "Saved as you type" : "Writes a new entry when you click away"),
        existing
          ? h("button", { class: "btn btn--sm", onClick: () => openRecordDrawer(page.id, existing.id) }, "Open entry")
          : h("a", { class: "btn btn--sm", href: `#/pages/${page.id}` }, "Open journal")
      )
    ),
    { icon: page.icon || "book" }
  );
}

function upcomingPanel(state) {
  const upcoming = upcomingTasks(state, 7).slice(0, 6);
  if (!upcoming.length) return null;
  return panel(
    "Next seven days",
    h("div", { class: "tasklist" }, ...upcoming.map((task) => taskRow(state, task))),
    { icon: "arrow-right", tools: h("a", { class: "btn btn--ghost btn--sm", href: "#/upcoming" }, "All") }
  );
}

export function todayView({ state }) {
  const body = h(
    "div", { class: "view__inner" },
    heroPanel(state),
    h(
      "div", { class: "today-cols" },
      h("div", { class: "u-col", style: { gap: "16px", minWidth: 0 } }, agendaPanel(state), upcomingPanel(state)),
      h("div", { class: "u-col", style: { gap: "16px", minWidth: 0 } }, timerPanel(), habitsPanel(state), journalPanel(state))
    )
  );

  return {
    topbar: {
      crumbs: [{ label: "Dezk" }, { label: "Today" }],
      title: "Today",
      subtitle: `${openTasks(state).length} open tasks · ${completedOn(state, todayKey()).length} completed today`,
      status: `Last opened ${formatDay(todayKey())}`,
      tools: [
        h("button", { class: "btn btn--sm", onClick: () => router.navigate("#/calendar") }, icon("calendar", 14), "Calendar"),
        h("button", { class: "btn btn--primary btn--sm", onClick: () => openQuickAdd({ due: todayKey() }) }, icon("plus", 14), "New task"),
      ],
    },
    body,
  };
}
