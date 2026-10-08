// Home dashboard: dv.view("System/Scripts/dashboard")
// Every card reads today's daily note, so ticking here ticks the note (and the Excel sync picks it up).

const THEMES = [
  { id: "theme-after-hours", label: "After Hours", banner: "banner-after-hours.svg", word: "After Hours", icon: "moon" },
  { id: "theme-dawn-fm", label: "Dawn FM", banner: "banner-dawn-fm.svg", word: "Dawn FM", icon: "radio" },
];
const NEON = { id: null, label: "Neon", banner: "banner-kissland.svg", word: "XO Nights", icon: "spark" };
const COLUMNS = [
  { id: "backlog", label: "Backlog", color: "var(--xo-muted)" },
  { id: "doing", label: "In progress", color: "var(--amber)" },
  { id: "review", label: "Review", color: "var(--dfm-blue)" },
  { id: "done", label: "Done", color: "var(--k-done, #3dff8e)" },
];
const SKIP = ["Habits", "Mood"];

const ICONS = {
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  radio: '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  board: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>',
  bars: '<path d="M3 3v18h18"/><path d="M7 16h8M7 11h12M7 6h5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  tasks: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8M13 12h8M13 18h8"/>',
};
const svg = (k, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[k] || ""}</svg>`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = n => (Number(n) < 0 ? "-$" : "$") + Math.abs(Math.round(Number(n) || 0)).toLocaleString();

const today = dv.date("today");
const todayPath = `Daily/${today.toFormat("yyyy-MM-dd")}.md`;
const tp = dv.page(todayPath);
const days = dv.pages('"Daily"').where(p => p.file.day);
const cc = app.customCss;
const active = THEMES.find(t => cc && cc.enabledSnippets && cc.enabledSnippets.has(t.id)) || NEON;
const openToday = () => app.commands.executeCommandById("daily-notes");

const root = dv.el("div", "", { cls: "xo-dash" });

// ---------- cover, icon, title, theme switch
const cover = root.createDiv({ cls: "xo-dash-cover" });
const bannerFile = app.vault.getAbstractFileByPath("System/Assets/" + active.banner);
if (bannerFile) cover.createEl("img", { attr: { src: app.vault.getResourcePath(bannerFile), alt: "" } });
root.createDiv({ cls: "xo-dash-icon" }).innerHTML = svg(active.icon, 30);
const head = root.createDiv({ cls: "xo-dash-head" });
head.createDiv({ cls: "xo-dash-title" }).innerHTML = `<b><span>${esc(active.word)}</span></b> dashboard`;
const sw = head.createDiv({ cls: "xo-dash-themes" });
for (const t of [...THEMES, NEON]) {
  const b = sw.createEl("button", { text: t.label, cls: t === active ? "on" : "" });
  b.onclick = () => {
    if (!cc || !cc.setCssEnabledStatus) { new Notice("Switch themes in Settings ▸ Appearance ▸ CSS snippets."); return; }
    for (const x of THEMES) cc.setCssEnabledStatus(x.id, x.id === t.id);
    setTimeout(() => app.workspace.trigger("dataview:refresh-views"), 150);
  };
}
root.createDiv({ cls: "xo-dash-date", text: today.toFormat("cccc · d LLLL yyyy") });

// ---------- stat chips
let streak = 0;
for (let d = today; days.where(p => p.file.day.hasSame(d, "day")).length; d = d.minus({ days: 1 })) streak++;
const isTask = t => !(t.section && SKIP.includes(t.section.subpath)) && t.text.trim().length > 0;
const carried = days.where(p => p.file.day < today && p.file.day >= today.minus({ days: 14 })).file.tasks.where(t => isTask(t) && !t.completed);
const moodOf = p => {
  const m = p.file.tasks.where(t => t.section && t.section.subpath === "Mood" && t.completed);
  return m.length ? parseInt(m[m.length - 1].text) : (p.mood ? Number(p.mood) : null);
};
const moods = days.where(p => p.file.day >= today.minus({ days: 6 })).map(moodOf).array().filter(Boolean);
const chip = (cls, html) => `<span class="xo-chip ${cls}">${html}</span>`;
root.createDiv({ cls: "xo-dash-stats" }).innerHTML =
  chip("amber", `${svg("flame", 13)} <b>${streak}</b> day streak`) +
  chip("pink", `↩ <b>${carried.length}</b> carried over`) +
  chip("teal", `◐ mood <b>${moods.length ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : "–"}</b> · 7 days`);

const grid = root.createDiv({ cls: "xo-dash-grid" });
const card = (title, icon, narrow, note) => {
  const c = grid.createDiv({ cls: "xo-card" + (narrow ? " narrow" : "") });
  const h = c.createDiv({ cls: "xo-card-h" });
  h.createDiv({ cls: "t" }).innerHTML = `${svg(icon, 15)}<span>${esc(title)}</span>`;
  const n = h.createDiv({ cls: "n" });
  if (note) n.setText(note);
  return { body: c.createDiv(), note: n };
};
const inside = async (el, fn) => { const keep = dv.container; dv.container = el; try { await fn(); } finally { dv.container = keep; } };
const needToday = el => {
  el.createDiv({ cls: "xo-muted", text: "Today's note isn't open yet." });
  const b = el.createDiv({ cls: "xo-btns" }).createEl("button", { text: "▶ Open today" });
  b.onclick = openToday;
};

// ---------- Today (tasks)  |  Habits
{
  const { body, note } = card("Today", "tasks", false);
  if (!tp) needToday(body);
  else {
    const mine = tp.file.tasks.where(isTask);
    note.setText(`${mine.where(t => t.completed).length}/${mine.length} done`);
    await inside(body, async () => {
      if (mine.length) dv.taskList(mine, false); else dv.el("div", "Add your Top 3 in today's note.", { cls: "xo-muted" });
      if (carried.length) { dv.el("div", `↩ Carried over`, { cls: "xo-muted" }); dv.taskList(carried.limit(4), false); }
    });
  }
}
{
  const { body, note } = card("Habits", "check", true);
  if (!tp) needToday(body);
  else {
    const hs = tp.file.tasks.where(t => t.section && t.section.subpath === "Habits");
    const done = hs.where(t => t.completed).length;
    note.setText(`${done}/${hs.length}`);
    body.createEl("progress", { attr: { value: done, max: hs.length || 1 } });
    await inside(body, async () => dv.taskList(hs, false));
  }
}

// ---------- Timeline  |  Money
{
  const { body } = card("Timeline", "clock", false, "latest 4");
  if (!tp) needToday(body);
  else await inside(body, async () => dv.view("System/Scripts/timeline", { path: todayPath, limit: 4 }));
}
{
  const { body } = card("Money", "wallet", true, today.toFormat("LLLL"));
  const ym = today.toFormat("yyyy-MM");
  let spent = 0, income = 0;
  for (const p of days.where(p => p.file.day.toFormat("yyyy-MM") === ym))
    for (const li of p.file.lists) {
      if (!(li.section && li.section.subpath === "Money")) continue;
      const m = li.text.match(/^\s*(\+)?\s*\$?\s*(\d+(?:[.,]\d+)?)/);
      if (m) (m[1] ? (income += parseFloat(m[2].replace(",", "."))) : (spent += parseFloat(m[2].replace(",", "."))));
    }
  const s = dv.page("System/Sync/Budget Snapshot");
  const row = (k, v, cls = "") => `<div class="xo-row"><span>${k}</span><span class="v ${cls}">${v}</span></div>`;
  let html = row("Spent (logged)", money(spent)) + row("Income (logged)", money(income), "xo-ok");
  if (s && s.variable_budget) {
    html += `<progress class="${s.variable_actual > s.variable_budget ? "over" : "teal"}" value="${Math.min(1, s.variable_actual / s.variable_budget)}" max="1"></progress>`;
    html += row("Excel · left to spend", money(s.left_to_spend), s.left_to_spend < 0 ? "xo-over" : "xo-ok");
  } else html += `<div class="xo-muted">Run the Excel sync to see what's left this month.</div>`;
  body.innerHTML = html;
}

// ---------- Projects board  |  Progress
const projects = dv.pages('"Projects"').sort(p => p.file.name);
const pct = p => { const t = p.file.tasks; return t.length ? Math.round(t.where(x => x.completed).length / t.length * 100) : 0; };
{
  const { body, note } = card("Projects", "board", false);
  note.setText(`${projects.where(p => p.status !== "done").length} active`);
  const board = body.createDiv({ cls: "xo-board" });
  COLUMNS.forEach((col, i) => {
    const c = board.createDiv();
    const h = c.createDiv({ cls: "xo-col-h", text: col.label });
    h.style.setProperty("--c", col.color);
    for (const p of projects.where(p => (p.status || "backlog") === col.id)) {
      const k = c.createDiv({ cls: "xo-kcard" });
      const a = k.createEl("a", { text: p.file.name, cls: "internal-link", attr: { href: p.file.path } });
      a.onclick = e => { e.preventDefault(); app.workspace.openLinkText(p.file.path, "", false); };
      const r = k.createDiv({ cls: "k-row" });
      const open = p.file.tasks.where(t => !t.completed).length;
      r.createSpan({ text: col.id === "done" ? "✓ done" : `${open} open · ${pct(p)}%` });
      const f = app.vault.getAbstractFileByPath(p.file.path);
      const move = (dir, label) => {
        const b = r.createEl("button", { text: label, attr: { "aria-label": dir > 0 ? "move right" : "move left" } });
        b.onclick = () => app.fileManager.processFrontMatter(f, fm => { fm.status = COLUMNS[i + dir].id; });
      };
      if (i > 0) move(-1, "←");
      if (i < COLUMNS.length - 1) move(1, "→");
    }
  });
  const nw = body.createDiv({ cls: "xo-new" });
  const inp = nw.createEl("input", { attr: { placeholder: "new project name" } });
  const add = nw.createEl("button", { text: "+ Add" });
  add.onclick = async () => {
    const name = inp.value.trim().replace(/[\\/:*?"<>|#^[\]]/g, "");
    if (!name) return;
    const path = `Projects/${name}.md`;
    if (app.vault.getAbstractFileByPath(path)) { new Notice("That project already exists."); return; }
    if (!app.vault.getAbstractFileByPath("Projects")) await app.vault.createFolder("Projects");
    const tpl = app.vault.getAbstractFileByPath("System/Templates/Project.md");
    const text = tpl ? await app.vault.read(tpl) : "---\nstatus: backlog\n---\n\n## Tasks\n- [ ] \n";
    await app.vault.create(path, text);
    new Notice(`Added ${name} to Backlog`);
  };
}
{
  const { body } = card("Progress", "bars", true);
  const active2 = projects.where(p => p.status !== "done");
  if (!active2.length) body.createDiv({ cls: "xo-muted", text: "No active projects." });
  for (const p of active2) {
    body.createDiv({ cls: "xo-row" }).innerHTML = `<span>${esc(p.file.name)}</span><span class="v">${pct(p)}%</span>`;
    body.createEl("progress", { cls: "teal", attr: { value: pct(p), max: 100 } });
  }
}

// ---------- Music  |  Quick links
{
  const { body } = card("Music", "music", false);
  await inside(body, async () => dv.view("System/Scripts/player"));
}
{
  const { body } = card("Quick links", "link", true);
  const links = body.createDiv({ cls: "xo-dash-links" });
  const go = (label, fn) => { const b = links.createEl("button", { text: label }); b.onclick = fn; };
  go("▶  Today's note", openToday);
  go("🧠  Brain dump", () => app.workspace.openLinkText("Brain Dump", "", false));
  go("🔁  Sync with Excel", () => app.workspace.openLinkText("System/Sync/Sync with Excel", "", false));
  go("❔  Start here", () => app.workspace.openLinkText("START HERE", "", false));
}
