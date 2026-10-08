// Day timeline + one-tap logging: dv.view("System/Scripts/timeline")
// Reads the "## Log" section of the current note. Line format (all parts after the kind are optional):
//   - 06:30 walk Walk 7.5K · 1h20
//   - 08:30 gym Back day · 30m
//     - 3x Chin-Up · 19 reps          (indented lines become rows inside the card)
//   - 10:09 meal Greens + collagen · 140kcal P15 C10 F3

// ---- edit this list to change kinds, labels, icons and which ones get a button.
// Colours come from the active theme (--k-<kind> in the CSS); the hex after the comma is the fallback.
const KINDS = {
  woke:  { label: "Woke up", color: "var(--k-woke, #ffb23f)", icon: "sunrise", button: true },
  walk:  { label: "Walk",    color: "var(--k-walk, #3ff2e0)", icon: "walk",    button: true },
  gym:   { label: "Gym",     color: "var(--k-gym, #9e5cff)", icon: "dumbbell", button: true },
  meal:  { label: "Meal",    color: "var(--k-meal, #ff4fa8)", icon: "food",    button: true },
  done:  { label: "Done",    color: "var(--k-done, #3dff8e)", icon: "check",   button: true },
  sleep: { label: "Sleep",   color: "var(--k-sleep, #5b8cff)", icon: "moon",    button: true },
  water: { label: "Water",   color: "var(--k-water, #3ff2e0)", icon: "drop" },
  sauna: { label: "Sauna",   color: "var(--k-sauna, #ff1f3d)", icon: "sun" },
  cold:  { label: "Cold shower", color: "var(--k-cold, #3a7bff)", icon: "snow" },
  work:  { label: "Work",    color: "var(--k-work, #ffb23f)", icon: "briefcase" },
  read:  { label: "Read",    color: "var(--k-read, #9e5cff)", icon: "book" },
  meds:  { label: "Meds",    color: "var(--k-meds, #ff4fa8)", icon: "pill" },
  note:  { label: "Note",    color: "var(--k-note, #8e89a8)", icon: "pen" },
};
const DAY_STARTS = 4; // entries before 04:00 count as the end of the previous evening

const ICONS = {
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sunrise: '<path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  walk: '<circle cx="13" cy="4" r="2"/><path d="m9 20 3-6 3 3v4"/><path d="m6 12 3-4 4 1 3 3"/><path d="M12 14 10 9"/>',
  dumbbell: '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  snow: '<path d="M2 12h20M12 2v20M20 16l-4-4 4-4M4 8l4 4-4 4M16 4l-4 4-4-4M8 20l4-4 4 4"/>',
  food: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  drop: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  dots: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
};
const svg = (k, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[k] || ICONS.pen}</svg>`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const page = (typeof input === "object" && input && input.path) ? dv.page(input.path) : dv.current();
const file = app.vault.getAbstractFileByPath(page.file.path);
const root = dv.el("div", "", { cls: "xo-tl-wrap" });

// ---------- one-tap logging
const bar = root.createDiv({ cls: "xo-tl-bar" });
const detail = bar.createEl("input", { cls: "xo-tl-detail", attr: { placeholder: "details (optional) — e.g. Walk 7.5K · 1h20" } });
const btns = bar.createDiv({ cls: "xo-tl-btns" });
const pad = n => String(n).padStart(2, "0");
async function addEntry(kind) {
  const now = new Date();
  const extra = detail.value.trim();
  const line = `- ${pad(now.getHours())}:${pad(now.getMinutes())} ${kind}${extra ? " " + extra : ""}`;
  await app.vault.process(file, text => {
    const lines = text.split("\n");
    let start = lines.findIndex(l => /^##\s+Log\s*$/.test(l));
    if (start === -1) return text.replace(/\s*$/, "") + `\n\n## Log\n${line}\n`;
    let end = lines.findIndex((l, i) => i > start && /^#{1,6}\s/.test(l));
    if (end === -1) end = lines.length;
    let at = end;
    while (at - 1 > start && lines[at - 1].trim() === "") at--;
    lines.splice(at, 0, line);
    return lines.join("\n");
  });
  detail.value = "";
  new Notice(`Logged ${KINDS[kind]?.label ?? kind} at ${pad(now.getHours())}:${pad(now.getMinutes())}`);
}
for (const [kind, k] of Object.entries(KINDS)) {
  if (!k.button) continue;
  const b = btns.createEl("button", { cls: "xo-tl-btn" });
  b.style.setProperty("--c", k.color);
  b.innerHTML = `${svg(k.icon, 14)}<span>${esc(k.label)}</span>`;
  b.onclick = () => addEntry(kind);
}

// ---------- parse the Log section
const items = page.file.lists.where(li => li.section && li.section.subpath === "Log" && !li.parent);
const entries = [];
for (const li of items) {
  const m = li.text.match(/^\s*(\d{1,2})[:.]?(\d{2})\s+(\S+)\s*(.*)$/);
  if (!m) continue;
  const h = +m[1], mi = +m[2];
  let kind = m[3].toLowerCase(), rest = m[4];
  if (!KINDS[kind]) { rest = (m[3] + " " + rest).trim(); kind = "note"; }
  if (kind === "woke" && /^up\b/i.test(rest)) rest = rest.replace(/^up\b\s*/i, "");
  const parts = rest.split(/\s+·\s+|\s+\|\s+/).map(s => s.trim()).filter(Boolean);
  let title = "", subs = [], macros = null;
  for (const p of parts) {
    const mac = p.match(/(\d+)\s*kcal|(?:^|\s)([PCF])\s*(\d+)/gi);
    if (/\d+\s*kcal|\b[PCF]\d+\b/i.test(p) && mac) {
      macros = { kcal: (p.match(/(\d+)\s*kcal/i) || [])[1], P: (p.match(/\bP\s*(\d+)/i) || [])[1],
                 C: (p.match(/\bC\s*(\d+)/i) || [])[1], F: (p.match(/\bF\s*(\d+)/i) || [])[1] };
    } else if (!title) title = p;
    else subs.push(p);
  }
  subs = subs.map(s => {
    const M = "m(?:in(?:s|utes)?)?";
    const d = s.match(new RegExp(`^(?:(\\d+)\\s*h(?:rs?|ours?)?\\s*(?:(\\d+)\\s*(?:${M})?)?|(\\d+)\\s*${M})$`, "i"));
    if (!d) return s;
    const hrs = d[1], mins = d[2] ?? d[3];
    return [hrs && `${hrs} hr`, mins && `${+mins} min${+mins === 1 ? "" : "s"}`].filter(Boolean).join(" ");
  });
  const rows = (li.children || []).map(c => {
    const [a, ...b] = String(c.text).split(/\s+·\s+|\s+\|\s+/);
    return [a.replace(/^(\d+)\s*x\s*/i, "$1× "), b.join(" · ")];
  });
  entries.push({ h, mi, sortKey: ((h < DAY_STARTS ? h + 24 : h) * 60 + mi), kind, title: title || KINDS[kind].label,
                 sub: subs.join(" · "), rows, macros, line: li.line });
}
entries.sort((a, b) => a.sortKey - b.sortKey);

// ---------- render
const tl = root.createDiv({ cls: "xo-tl" });
if (!entries.length) tl.createDiv({ cls: "xo-muted", text: "Nothing logged yet. Tap a button above. It adds the time for you." });
const shown = (typeof input === "object" && input && input.limit) ? entries.slice(-input.limit) : entries;
if (shown.length < entries.length) tl.createDiv({ cls: "xo-muted", text: `… ${entries.length - shown.length} earlier` });
for (const e of shown) {
  const k = KINDS[e.kind];
  const row = tl.createDiv({ cls: "xo-tl-row" });
  row.style.setProperty("--c", k.color);
  let body = `<div class="xo-tl-hd"><div><div class="xo-tl-ti">${esc(e.title)}</div>` +
             (e.sub ? `<div class="xo-tl-sub">${esc(e.sub)}</div>` : "") + `</div><span class="xo-tl-more" aria-label="edit">${svg("dots", 18)}</span></div>`;
  body += e.rows.map(([a, b]) => `<div class="xo-tl-set"><span>${esc(a)}</span><span class="m">${esc(b)}</span></div>`).join("");
  if (e.macros) {
    const M = e.macros;
    body += `<div class="xo-tl-mac">${M.kcal ? esc(M.kcal) + " kcal" : ""}` +
      [["P", "bp"], ["C", "bc"], ["F", "bf"]].filter(([x]) => M[x]).map(([x, c]) => `<b class="${c}">${x}</b>${esc(M[x])}g`).join("") + `</div>`;
  }
  row.innerHTML = `<div class="xo-tl-t">${pad(e.h)}:${pad(e.mi)}</div><div class="xo-tl-dot">${svg(k.icon)}</div><div class="xo-tl-card">${body}</div>`;
  row.querySelector(".xo-tl-more").onclick = () =>
    app.workspace.getLeaf(false).openFile(file, { eState: { line: e.line }, state: { mode: "source" } });
}
