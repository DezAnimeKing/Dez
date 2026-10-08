// Mini Spotify player: dv.view("System/Scripts/player")
// Saves links in this note's `music` property as "Name | https://open.spotify.com/..."
const file = app.vault.getAbstractFileByPath(dv.current().file.path);
const list = (dv.current().music ?? []).map(String).map(s => {
  const i = s.lastIndexOf("|");
  return i > -1 ? { name: s.slice(0, i).trim(), url: s.slice(i + 1).trim() } : { name: "Mix", url: s.trim() };
}).filter(x => x.url);
const embed = url => {
  const m = String(url).match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/);
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?theme=0` : null;
};
const box = dv.el("div", "", { cls: "xo-player" });
const btns = box.createDiv({ cls: "xo-btns" });
const frame = box.createDiv();
const KEY = "xo-player-current";
const show = i => {
  const src = list[i] && embed(list[i].url);
  frame.empty();
  btns.querySelectorAll("button").forEach((b, j) => b.toggleClass("on", j === i));
  if (src) { frame.createEl("iframe", { attr: { src, height: "152", allow: "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture", loading: "lazy" } }); localStorage.setItem(KEY, i); }
};
list.forEach((x, i) => { const b = btns.createEl("button", { text: x.name }); b.onclick = () => show(i); });
if (list.length) show(Math.min(Number(localStorage.getItem(KEY)) || 0, list.length - 1));
else box.createDiv({ cls: "xo-muted", text: "Spotify app ▸ Share ▸ Copy link, then paste it below." });

const row = box.createDiv({ cls: "xo-btns" });
const name = row.createEl("input", { attr: { placeholder: "name (optional)", style: "flex:1;min-width:120px" } });
const url = row.createEl("input", { attr: { placeholder: "paste Spotify link", style: "flex:3;min-width:200px" } });
const add = row.createEl("button", { text: "＋ add" });
add.onclick = async () => {
  if (!embed(url.value)) { new Notice("That doesn't look like a Spotify link."); return; }
  await app.fileManager.processFrontMatter(file, fm => {
    fm.music = [...(fm.music ?? []), `${name.value.trim() || "Mix " + (list.length + 1)} | ${url.value.trim()}`];
  });
  new Notice("Added — it shows up in a second.");
};
if (list.length) {
  const del = row.createEl("button", { text: "✕ remove current" });
  del.onclick = async () => {
    const i = Math.min(Number(localStorage.getItem(KEY)) || 0, list.length - 1);
    await app.fileManager.processFrontMatter(file, fm => { fm.music = (fm.music ?? []).filter((_, j) => j !== i); });
    localStorage.setItem(KEY, 0);
  };
}
