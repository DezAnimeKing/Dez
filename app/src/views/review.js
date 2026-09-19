import { h } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { router } from "../router.js";
import { panel } from "./parts.js";
import { progressBar, ring } from "../ui/controls.js";
import { completionsByDay, focusMinutesByDay, activeTasks, openTasks, projectProgress, activeHabits, habitRate, habitStreak, allTags, overdueTasks } from "../store/selectors.js";
import { todayKey, shiftKey, fromKey, DOW_SHORT, diffDays, formatDay } from "../lib/date.js";

const RANGES = [
  { id: "7", name: "7 days" },
  { id: "14", name: "14 days" },
  { id: "30", name: "30 days" },
];

function bars(series, { format = (n) => String(n), labelEvery = 1 } = {}) {
  const max = Math.max(1, ...series.map((point) => point.count));
  return h(
    "div", { class: "u-col", style: { gap: "8px" } },
    h(
      "div", { class: "bars" },
      ...series.map((point, index) => {
        const date = fromKey(point.key);
        return h(
          "div", { class: "bars__col", title: `${point.key}: ${format(point.count)}` },
          h("div", {
            class: "bars__bar",
            dataset: { peak: String(point.count === max && point.count > 0) },
            style: { height: `${Math.max(3, (point.count / max) * 100)}%` },
          }),
          index % labelEvery === 0
            ? h("span", { class: "bars__label" }, series.length > 16 ? String(date.getDate()) : DOW_SHORT[date.getDay()][0])
            : h("span", { class: "bars__label" }, "")
        );
      })
    )
  );
}

export function reviewView({ state, route }) {
  const days = Number(route.query.range || 14);
  const completions = completionsByDay(state, days);
  const focus = focusMinutesByDay(state, days);
  const since = shiftKey(todayKey(), -(days - 1));

  const completedInRange = completions.reduce((sum, point) => sum + point.count, 0);
  const focusInRange = focus.reduce((sum, point) => sum + point.count, 0);
  const createdInRange = activeTasks(state).filter((task) => task.createdAt && task.createdAt.slice(0, 10) >= since).length;
  const habits = activeHabits(state);
  const habitAverage = habits.length ? Math.round(habits.reduce((sum, habit) => sum + habitRate(habit, days), 0) / habits.length) : 0;
  const bestDay = completions.reduce((best, point) => (point.count > best.count ? point : best), completions[0] || { key: todayKey(), count: 0 });

  const projects = state.projects
    .filter((project) => !project.archived)
    .map((project) => ({ project, progress: projectProgress(state, project.id) }))
    .filter((row) => row.progress.total > 0)
    .sort((a, b) => b.progress.pct - a.progress.pct);

  const tags = allTags(state).slice(0, 8);
  const maxTagCount = Math.max(1, ...tags.map((tag) => tag.count));

  const stale = openTasks(state)
    .filter((task) => diffDays(task.createdAt.slice(0, 10)) < -14)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, 6);

  const body = h(
    "div", { class: "view__inner" },
    h(
      "div", { class: "filterbar" },
      ...RANGES.map((range) =>
        h(
          "button",
          {
            class: ["btn", "btn--sm", String(days) === range.id && "btn--primary"].filter(Boolean).join(" "),
            onClick: () => router.setQuery({ range: range.id }),
          },
          range.name
        )
      )
    ),
    h(
      "div", { class: "today-grid", style: { marginBottom: "16px" } },
      h("div", { class: "stat" },
        h("span", { class: "stat__label" }, "Completed"),
        h("span", { class: "stat__value" }, String(completedInRange)),
        h("span", { class: "stat__meta" }, `${(completedInRange / days).toFixed(1)} a day`)),
      h("div", { class: "stat" },
        h("span", { class: "stat__label" }, "Added"),
        h("span", { class: "stat__value" }, String(createdInRange)),
        h("span", { class: "stat__meta" }, createdInRange > completedInRange ? "More in than out" : "Keeping up")),
      h("div", { class: "stat" },
        h("span", { class: "stat__label" }, "Focus time"),
        h("span", { class: "stat__value" }, `${Math.round(focusInRange / 60)}h`),
        h("span", { class: "stat__meta" }, `${focusInRange} minutes logged`)),
      h("div", { class: "stat" },
        h("span", { class: "stat__label" }, "Habit rate"),
        h("span", { class: "stat__value" }, `${habitAverage}%`),
        h("span", { class: "stat__meta" }, habits.length ? `${habits.length} tracked` : "Nothing tracked"))
    ),
    h(
      "div", { class: "today-cols" },
      h(
        "div", { class: "u-col", style: { gap: "16px", minWidth: 0 } },
        panel(
          "Tasks completed",
          h("div", null,
            bars(completions),
            h("p", { class: "u-dim", style: { fontSize: "12px", marginTop: "10px" } },
              bestDay.count > 0 ? `Best day: ${formatDay(bestDay.key)} with ${bestDay.count}.` : "No completions in this window yet.")),
          { icon: "check-circle" }
        ),
        panel(
          "Focus minutes",
          h("div", null,
            bars(focus, { format: (n) => `${n} min` }),
            h("p", { class: "u-dim", style: { fontSize: "12px", marginTop: "10px" } },
              `${Math.round(focusInRange / days)} minutes a day on average.`)),
          { icon: "timer" }
        ),
        projects.length
          ? panel(
              "Projects",
              h(
                "div", { class: "u-col", style: { gap: "12px" } },
                ...projects.map(({ project, progress }) =>
                  h(
                    "a", { class: "u-row", href: `#/projects/${project.id}`, style: { gap: "12px" } },
                    h("span", { class: "nav-item__swatch", style: { background: project.color } }),
                    h("span", { style: { width: "150px" }, class: "u-truncate" }, project.name),
                    h("span", { class: "u-grow" }, progressBar(progress.pct, { thin: true, color: project.color })),
                    h("span", { class: "u-dim u-mono", style: { fontSize: "12px", width: "70px", textAlign: "right" } }, `${progress.done}/${progress.total}`)
                  )
                )
              ),
              { icon: "board" }
            )
          : null
      ),
      h(
        "div", { class: "u-col", style: { gap: "16px", minWidth: 0 } },
        panel(
          "Where the week went",
          tags.length
            ? h(
                "div", { class: "u-col", style: { gap: "10px" } },
                ...tags.map((tag) =>
                  h(
                    "a", { class: "u-row", href: `#/tags/${tag.name}`, style: { gap: "10px" } },
                    h("span", { style: { width: "90px" }, class: "u-truncate" }, `#${tag.name}`),
                    h("span", { class: "u-grow" }, progressBar((tag.count / maxTagCount) * 100, { thin: true })),
                    h("span", { class: "u-dim u-mono", style: { fontSize: "12px" } }, String(tag.count))
                  )
                )
              )
            : h("p", { class: "u-dim", style: { fontSize: "13px" } }, "Tag a few tasks to see where the time goes."),
          { icon: "tag" }
        ),
        habits.length
          ? panel(
              "Consistency",
              h(
                "div", { class: "u-col", style: { gap: "12px" } },
                ...habits.map((habit) =>
                  h(
                    "div", { class: "u-row", style: { gap: "12px" } },
                    ring(habitRate(habit, days), { size: 40, stroke: 4, label: `${habitRate(habit, days)}` }),
                    h("div", { class: "u-col u-grow", style: { gap: "2px", minWidth: 0 } },
                      h("span", { class: "u-truncate", style: { fontSize: "13px" } }, habit.name),
                      h("span", { class: "u-dim", style: { fontSize: "11.5px" } }, `${habitStreak(habit)} day streak`))
                  )
                )
              ),
              { icon: "repeat" }
            )
          : null,
        panel(
          "Worth a decision",
          stale.length
            ? h(
                "div", { class: "u-col", style: { gap: "8px" } },
                h("p", { class: "u-dim", style: { fontSize: "12.5px" } }, "Open for more than two weeks. Book time for them or drop them."),
                ...stale.map((task) =>
                  h(
                    "a",
                    { class: "u-row", href: `#/tasks?task=${task.id}`, style: { gap: "8px" } },
                    icon("clock", 13),
                    h("span", { class: "u-truncate u-grow", style: { fontSize: "13px" } }, task.title),
                    h("span", { class: "u-dim", style: { fontSize: "11.5px" } }, formatDay(task.createdAt.slice(0, 10), { weekday: false }))
                  )
                )
              )
            : h("p", { class: "u-dim", style: { fontSize: "13px" } }, "Nothing has been sitting around for long. Good."),
          { icon: "alert" }
        )
      )
    )
  );

  return {
    topbar: {
      crumbs: [{ label: "Dezk", href: "#/today" }, { label: "Review" }],
      title: "Review",
      subtitle: `The last ${days} days · ${overdueTasks(state).length} overdue right now`,
      tools: [],
    },
    body,
  };
}
