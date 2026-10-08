// Home screen: dv.view("System/Scripts/home")
const today = dv.date("today");
const btns = dv.el("div", "", { cls: "xo-btns" });
const mk = (label, fn) => { const b = btns.createEl("button", { text: label }); b.onclick = fn; };
mk("▶  Open today", () => app.commands.executeCommandById("daily-notes"));
mk("🧠  Brain dump", () => app.workspace.openLinkText("Brain Dump", "", false));

const days = dv.pages('"Daily"').where(p => p.file.day);
const week = days.where(p => p.file.day >= today.minus({ days: 6 }));
const habits = week.file.tasks.where(t => t.section && t.section.subpath === "Habits");
const hPct = habits.length ? Math.round(habits.where(t => t.completed).length / habits.length * 100) : 0;
const moodOf = p => {
  const m = p.file.tasks.where(t => t.section && t.section.subpath === "Mood" && t.completed);
  return m.length ? parseInt(m[m.length - 1].text) : (p.mood ? Number(p.mood) : null);
};
const moods = week.map(moodOf).array().filter(Boolean);
const avg = moods.length ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : "–";
const SKIP = ["Habits", "Mood"];
const open = days.where(p => p.file.day < today && p.file.day >= today.minus({ days: 14 }))
  .file.tasks.where(t => !(t.section && SKIP.includes(t.section.subpath)) && t.text.trim() && !t.completed).length;
const snap = dv.page("System/Sync/Budget Snapshot");
const money = n => "$" + Math.round(Number(n) || 0).toLocaleString();
const stat = (v, k) => `<span class="xo-stat"><b>${v}</b><span>${k}</span></span>`;
dv.el("div", stat(hPct + "%", "habits · 7 days") + stat(avg, "mood · 7 days") + stat(open, "carried over") +
  stat(snap ? money(snap.left_to_spend) : "–", "left to spend"), { attr: { style: "text-align:center" } });
if (snap) dv.el("div", `Excel last synced ${snap.synced}`, { cls: "xo-muted", attr: { style: "text-align:center" } });

const cal = { year: Number(today.toFormat("yyyy")), entries: [], intensityScaleStart: 1, intensityScaleEnd: 5,
  colors: { xo: ["#2a1036", "#5a1a63", "#9e2a86", "#e0246e", "#ff1f3d"] } };
for (const p of days) { const m = moodOf(p); if (m) cal.entries.push({ date: p.file.day.toFormat("yyyy-MM-dd"), intensity: m, color: "xo", content: "" }); }
if (typeof renderHeatmapCalendar === "function") renderHeatmapCalendar(dv.container, cal);
