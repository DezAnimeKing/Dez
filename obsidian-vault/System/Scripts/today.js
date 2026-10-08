// Status strip at the top of every daily note: dv.view("System/Scripts/today")
const cur = dv.current();
const today = dv.date("today");
const day = cur.file.day ?? today;
const SKIP = ["Habits", "Mood"];
const isTask = t => !(t.section && SKIP.includes(t.section.subpath)) && t.text.trim().length > 0;

const mine = cur.file.tasks.where(isTask);
const left = mine.where(t => !t.completed).length;
const habits = cur.file.tasks.where(t => t.section && t.section.subpath === "Habits");
const hDone = habits.where(t => t.completed).length;

const days = dv.pages('"Daily"').where(p => p.file.day);
let streak = 0;
for (let d = today; days.where(p => p.file.day.hasSame(d, "day")).length; d = d.minus({ days: 1 })) streak++;

const ym = day.toFormat("yyyy-MM");
let spent = 0;
for (const p of days.where(p => p.file.day.toFormat("yyyy-MM") === ym))
  for (const li of p.file.lists) {
    if (li.spend !== undefined) { spent += Number(li.spend) || 0; continue; }
    const m = li.section && li.section.subpath === "Money" && li.text.match(/^\s*\$?\s*(\d+(?:[.,]\d+)?)/);
    if (m) spent += parseFloat(m[1].replace(",", "."));
  }

const snap = dv.page("System/Sync/Budget Snapshot");
const money = n => "$" + Math.round(Number(n) || 0).toLocaleString();
const chip = (cls, html) => `<span class="xo-chip ${cls}">${html}</span>`;
let html = chip("red", `☐ <b>${left}</b> to do`) + chip("pink", `🌸 <b>${hDone}/${habits.length}</b> habits`) +
  chip("amber", `🔥 <b>${streak}</b> day streak`) + chip("teal", `💸 <b>${money(spent)}</b> spent this month`);
if (snap && snap.left_to_spend !== undefined)
  html += chip(Number(snap.left_to_spend) < 0 ? "red" : "teal", `📻 Excel: <b>${money(snap.left_to_spend)}</b> left`);
dv.el("div", html, { cls: "xo-strip" });

// recurring tasks scheduled in Excel for this day
const agenda = dv.page("System/Sync/Excel Agenda");
if (agenda) {
  const items = agenda.file.lists.where(li => li.due && dv.date(li.due) && dv.date(li.due).hasSame(day, "day"));
  if (items.length) dv.el("div", "🔁 From Excel: " + items.map(li => li.text.replace(/\[due::[^\]]*\]/, "").trim()).join(" · "), { cls: "xo-muted" });
}

// unfinished tasks from the last 14 days, tickable right here
if (day.hasSame(today, "day")) {
  const old = days.where(p => p.file.day < today && p.file.day >= today.minus({ days: 14 }))
    .file.tasks.where(t => isTask(t) && !t.completed);
  if (old.length) {
    dv.el("div", `↩ Carried over (${old.length})`, { cls: "xo-muted" });
    dv.taskList(old.limit(5), false);
  }
}
