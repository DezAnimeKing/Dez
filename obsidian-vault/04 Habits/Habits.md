---
cssclasses:
  - kissland
---
![[banner-kissland.svg|banner]]

# Habits

> [!kissland] How it works
> Tick habits in each daily note under **## Habits**. Names match the Excel Habit Tracker, so the sync ticks the same boxes there. Mood (1–5) goes in the daily note's `mood` property.

### 完了 · daily completion
```dataviewjs
const cal = { year: Number(dv.date("today").toFormat("yyyy")),
  colors: { kl: ["#2a1036", "#4b1f6e", "#7c3aa6", "#c63fa0", "#ff4fa8"] }, entries: [], intensityScaleStart: 0, intensityScaleEnd: 100 };
for (const p of dv.pages('"01 Daily"').where(p => p.file.day)) {
  const h = p.file.tasks.where(t => t.section && t.section.subpath === "Habits");
  if (!h.length) continue;
  const pct = Math.round(h.where(t => t.completed).length / h.length * 100);
  cal.entries.push({ date: p.file.day.toFormat("yyyy-MM-dd"), intensity: pct, color: "kl", content: "" });
}
renderHeatmapCalendar(this.container, cal);
```

### 習慣 · per habit (last 30 days)
```dataviewjs
const since = dv.date("today").minus({days: 29});
const days = dv.pages('"01 Daily"').where(p => p.file.day && p.file.day >= since);
const stats = {};
for (const p of days) for (const t of p.file.tasks.where(t => t.section && t.section.subpath === "Habits")) {
  const k = t.text.trim(); stats[k] = stats[k] || [0, 0]; stats[k][1]++; if (t.completed) stats[k][0]++;
}
dv.el("div", Object.entries(stats).sort((a, b) => b[1][0] / b[1][1] - a[1][0] / a[1][1]).map(([k, [d, n]]) =>
  `<div class="xo-row"><span>${k}</span><span class="v">${d}/${n}</span></div><progress value="${d}" max="${n}"></progress>`).join(""));
```

### 気分 · mood
```dataviewjs
const cal = { year: Number(dv.date("today").toFormat("yyyy")),
  colors: { dfm: ["#0b1638", "#123a6b", "#1d6fa3", "#2fb7c9", "#3ff2e0"] }, entries: [], intensityScaleStart: 1, intensityScaleEnd: 5 };
for (const p of dv.pages('"01 Daily"').where(p => p.file.day && p.mood))
  cal.entries.push({ date: p.file.day.toFormat("yyyy-MM-dd"), intensity: Number(p.mood), color: "dfm", content: "" });
renderHeatmapCalendar(this.container, cal);
```

### 感謝 · gratitude
```dataview
TABLE WITHOUT ID file.link AS Day, gratitude AS "Grateful for"
FROM "01 Daily"
WHERE gratitude
SORT file.day DESC
LIMIT 14
```
