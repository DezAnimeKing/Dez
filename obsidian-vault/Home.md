---
cssclasses:
  - dashboard
  - after-hours
---
![[banner-after-hours.svg|banner]]

<div class="xo-title">After Hours</div>
<div class="xo-jp">深 夜 の 街 ・ 午 前 三 時</div>
<div class="xo-sub">personal operating system · 103.5 dawn fm · kissland</div>

---

> [!grid]
> > [!card|red] 🌙 Tonight's tasks
> > ```tasks
> > not done
> > happens before tomorrow
> > sort by priority
> > limit 8
> > short mode
> > hide task count
> > ```
> > [[02 Tasks/Tasks|all tasks →]]
>
> > [!card|teal] 📻 Money this month
> > ```dataviewjs
> > const ym = dv.date("today").toFormat("yyyy-MM");
> > let spent = 0, income = 0;
> > for (const p of dv.pages('"01 Daily"')) {
> >   if (!p.file.day || p.file.day.toFormat("yyyy-MM") !== ym) continue;
> >   for (const li of p.file.lists) {
> >     spent += Number(li.spend ?? 0) || 0;
> >     income += Number(li.income ?? 0) || 0;
> >   }
> > }
> > const s = dv.page("03 Money/Budget Snapshot") ?? {};
> > const vb = Number(s.variable_budget) || 0, va = Number(s.variable_actual) || 0;
> > const money = n => "$" + Number(n || 0).toLocaleString(undefined, {maximumFractionDigits: 0});
> > const row = (k, v, cls = "") => `<div class="xo-row"><span>${k}</span><span class="v ${cls}">${v}</span></div>`;
> > const used = vb ? Math.min(1.5, va / vb) : 0;
> > dv.el("div",
> >   row("Logged in vault (spend)", money(spent)) +
> >   row("Logged in vault (income)", money(income), "xo-ok") +
> >   row("Excel · variable spend", money(va) + " / " + money(vb), va > vb ? "xo-over" : "") +
> >   `<progress class="${va > vb ? "over" : "teal"}" value="${used}" max="1"></progress>` +
> >   row("Excel · left to spend", money(s.left_to_spend), Number(s.left_to_spend) < 0 ? "xo-over" : "xo-ok") +
> >   row("Net worth", money(s.net_worth)));
> > ```
> > [[03 Money/Money|money hub →]]
>
> > [!card|pink] 🌸 Today's habits
> > ```dataviewjs
> > const t = dv.page("01 Daily/" + dv.date("today").toFormat("yyyy-MM-dd"));
> > if (!t) { dv.paragraph("No note for today yet — open the calendar ▸ today."); }
> > else {
> >   const hs = t.file.tasks.where(x => x.section && x.section.subpath === "Habits");
> >   const done = hs.where(x => x.completed).length;
> >   dv.el("div", `<div class="xo-row"><span>${done} / ${hs.length} done</span><span class="v">${hs.length ? Math.round(done / hs.length * 100) : 0}%</span></div><progress value="${done}" max="${hs.length || 1}"></progress>`);
> >   dv.taskList(hs.where(x => !x.completed).limit(6), false);
> > }
> > ```
> > [[04 Habits/Habits|habit tracker →]]

> [!grid]
> > [!card|violet] ✦ Goals
> > ```dataviewjs
> > for (const g of dv.pages('"05 Goals"').where(p => p.status !== "done" && p.file.name !== "Goals").sort(p => p.deadline)) {
> >   const t = g.file.tasks, pct = t.length ? Math.round(t.where(x => x.completed).length / t.length * 100) : (g.progress ?? 0);
> >   dv.el("div", `<div class="xo-row"><span>${g.file.link}</span><span class="v">${pct}%</span></div><progress value="${pct}" max="100"></progress>`);
> > }
> > [[05 Goals/Goals|all goals →]]
> > ```
>
> > [!terminal] System
> > [[99 System/Guide|guide]] · [[99 System/Sync/Sync with Excel|excel sync]] · [[02 Tasks/Excel Agenda|excel agenda]]
> > vault online · last excel sync: `$= dv.page("03 Money/Budget Snapshot")?.synced ?? "never"`
> > new daily note ▸ calendar (right sidebar) or Ctrl/Cmd+P ▸ "Open today's daily note"

> [!dawn-fm] 📊 Signal
> ```dataviewjs
> const days = dv.pages('"01 Daily"').where(p => p.file.day);
> const today = dv.date("today");
> let streak = 0;
> for (let d = today; ; d = d.minus({days: 1})) { if (days.where(p => p.file.day.hasSame(d, "day")).length) streak++; else break; }
> const week = days.where(p => p.file.day >= today.minus({days: 6}));
> const doneWeek = week.file.tasks.where(t => t.completed).length;
> const moods = week.where(p => p.mood).map(p => Number(p.mood)).array();
> const avg = moods.length ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : "–";
> const stat = (v, k) => `<span class="xo-stat"><b>${v}</b><span>${k}</span></span>`;
> dv.el("div", stat(streak, "day streak") + stat(doneWeek, "done this week") + stat(avg, "mood · 7d") +
>   stat(dv.pages().length, "notes"), {attr: {style: "text-align:center"}});
> ```

### 夜 · mood heatmap
```dataviewjs
const cal = { year: Number(dv.date("today").toFormat("yyyy")),
  colors: { xo: ["#2a1036", "#5a1a63", "#9e2a86", "#e0246e", "#ff1f3d"] },
  showCurrentDayBorder: true, defaultEntryIntensity: 3, intensityScaleStart: 1, intensityScaleEnd: 5, entries: [] };
for (const p of dv.pages('"01 Daily"').where(p => p.file.day && p.mood))
  cal.entries.push({ date: p.file.day.toFormat("yyyy-MM-dd"), intensity: Number(p.mood), color: "xo",
    content: "", });
renderHeatmapCalendar(this.container, cal);
```
