import { h } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { showMenu } from "../ui/menu.js";
import { emptyState } from "../ui/controls.js";
import { openHabitDialog } from "../ui/dialogs.js";
import { toggleHabitDay, updateHabit, deleteHabit } from "../store/actions.js";
import { activeHabits, habitStreak, habitBestStreak, habitRate } from "../store/selectors.js";
import { weekKeys, todayKey, shiftKey, DOW_SHORT, fromKey, diffDays } from "../lib/date.js";
import { panel } from "./parts.js";
import { store } from "../store/state.js";
import { confirmDialog } from "../ui/modal.js";
import { toast } from "../ui/toast.js";

function weekStrip(habit, weekStart) {
  const keys = weekKeys(new Date(), weekStart);
  return h(
    "div", { class: "habit-week" },
    ...keys.map((key) => {
      const date = fromKey(key);
      const future = diffDays(key) > 0;
      return h(
        "div", { class: "habit-day" },
        h("span", null, DOW_SHORT[date.getDay()][0]),
        h(
          "button",
          {
            class: "habit-day__box",
            dataset: { on: String(Boolean(habit.log?.[key])), today: String(key === todayKey()) },
            disabled: future,
            style: habit.log?.[key] ? { background: habit.color, borderColor: habit.color } : null,
            "aria-label": `${habit.name} on ${key}`,
            "aria-pressed": String(Boolean(habit.log?.[key])),
            onClick: () => toggleHabitDay(habit.id, key),
          },
          icon("check", 13)
        )
      );
    })
  );
}

function heatmap(habit, weeks = 18) {
  const cells = [];
  const days = weeks * 7;
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = shiftKey(todayKey(), -i);
    const on = Boolean(habit.log?.[key]);
    cells.push(
      h("div", {
        class: "heatmap__cell",
        title: `${key}${on ? " · done" : ""}`,
        style: on ? { background: habit.color, borderColor: habit.color } : null,
      })
    );
  }
  return h("div", { class: "heatmap" }, ...cells);
}

export function habitsView({ state }) {
  const habits = activeHabits(state);
  const weekStart = state.settings.weekStart ?? 1;
  const doneToday = habits.filter((habit) => habit.log?.[todayKey()]).length;

  const body = h(
    "div", { class: "view__inner" },
    habits.length
      ? h(
          "div", { class: "u-col", style: { gap: "16px" } },
          h(
            "div", { class: "today-grid" },
            h("div", { class: "stat" },
              h("span", { class: "stat__label" }, "Today"),
              h("span", { class: "stat__value" }, `${doneToday}/${habits.length}`),
              h("span", { class: "stat__meta" }, doneToday === habits.length ? "All ticked off" : "Still to tick")),
            h("div", { class: "stat" },
              h("span", { class: "stat__label" }, "Longest run"),
              h("span", { class: "stat__value" }, String(Math.max(0, ...habits.map(habitBestStreak)))),
              h("span", { class: "stat__meta" }, "consecutive days")),
            h("div", { class: "stat" },
              h("span", { class: "stat__label" }, "30-day average"),
              h("span", { class: "stat__value" }, `${Math.round(habits.reduce((sum, habit) => sum + habitRate(habit), 0) / habits.length)}%`),
              h("span", { class: "stat__meta" }, "of days hit"))
          ),
          panel(
            "This week",
            h(
              "div", { class: "u-col" },
              ...habits.map((habit) => {
                const streak = habitStreak(habit);
                const weekCount = weekKeys(new Date(), weekStart).filter((key) => habit.log?.[key]).length;
                return h(
                  "div", { class: "habit-row" },
                  h("span", { class: "nav-item__swatch", style: { background: habit.color, width: "9px", height: "9px" } }),
                  h(
                    "div", { class: "u-col", style: { gap: "2px", minWidth: 0 } },
                    h("span", { class: "habit-row__name u-truncate" }, habit.name),
                    h(
                      "span", { class: "u-dim", style: { fontSize: "11.5px" } },
                      `${weekCount}/${habit.target} this week`,
                      streak > 0 ? ` · ${streak} day streak` : "",
                      ` · ${habitRate(habit)}% of the last 30`
                    )
                  ),
                  weekStrip(habit, weekStart),
                  h(
                    "button",
                    {
                      class: "btn btn--ghost btn--icon btn--sm", style: { marginLeft: "12px" }, "aria-label": `${habit.name} options`,
                      onClick: (event) => showMenu(event.currentTarget, [
                        { label: "Edit habit", icon: "pencil", onClick: () => openHabitDialog(habit.id) },
                        { label: "Archive", icon: "archive", onClick: () => { updateHabit(habit.id, { archived: true }); toast("Habit archived", { action: { label: "Undo", onClick: () => updateHabit(habit.id, { archived: false }) } }); } },
                        { separator: true },
                        {
                          label: "Delete habit", icon: "trash", danger: true,
                          onClick: () => confirmDialog({
                            title: `Delete "${habit.name}"?`,
                            message: "The habit and its whole history are removed.",
                            onConfirm: () => { deleteHabit(habit.id); toast("Habit deleted", { action: { label: "Undo", onClick: () => store.undo() } }); },
                          }),
                        },
                      ], { align: "end" }),
                    },
                    icon("more-v", 15)
                  )
                );
              })
            ),
            { icon: "repeat", tools: h("button", { class: "btn btn--sm", onClick: () => openHabitDialog() }, icon("plus", 14), "Habit") }
          ),
          ...habits.map((habit) =>
            panel(
              habit.name,
              h(
                "div", { class: "u-col", style: { gap: "10px" } },
                heatmap(habit),
                h(
                  "div", { class: "legend" },
                  h("span", { class: "legend__item" }, h("span", { class: "heatmap__cell", style: { background: habit.color, borderColor: habit.color } }), "Done"),
                  h("span", { class: "legend__item" }, h("span", { class: "heatmap__cell" }), "Missed"),
                  h("span", { class: "legend__item u-dim" }, "Last 18 weeks")
                )
              ),
              { icon: "flame", tools: h("span", { class: "streak" }, icon("flame", 13), `${habitStreak(habit)} day streak`) }
            )
          )
        )
      : emptyState({
          icon: "repeat",
          title: "No habits tracked yet",
          text: "Pick two or three things you want to do most days. Streaks do the rest.",
          action: h("button", { class: "btn btn--primary btn--sm", onClick: () => openHabitDialog() }, icon("plus", 14), "Add a habit"),
        })
  );

  const archived = state.habits.filter((habit) => habit.archived);

  return {
    topbar: {
      crumbs: [{ label: "Dezk", href: "#/today" }, { label: "Habits" }],
      title: "Habits",
      subtitle: habits.length ? `${doneToday} of ${habits.length} done today` : "Nothing tracked yet",
      tools: [
        archived.length
          ? h(
              "button",
              {
                class: "btn btn--sm",
                onClick: (event) => showMenu(event.currentTarget, archived.map((habit) => ({
                  label: habit.name, icon: "archive", hint: "Restore",
                  onClick: () => updateHabit(habit.id, { archived: false }),
                }))),
              },
              icon("archive", 14), `Archived (${archived.length})`
            )
          : null,
        h("button", { class: "btn btn--primary btn--sm", onClick: () => openHabitDialog() }, icon("plus", 14), "New habit"),
      ].filter(Boolean),
    },
    body,
  };
}
