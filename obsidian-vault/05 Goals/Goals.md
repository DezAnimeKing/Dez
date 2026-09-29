---
cssclasses:
  - kissland
---
# Goals

> [!kissland] Dream it · write it · achieve it
> One note per goal (template: **Goal**). Progress = ticked steps.

```dataviewjs
for (const g of dv.pages('"05 Goals"').where(p => p.file.name !== "Goals").sort(p => p.deadline)) {
  const t = g.file.tasks, pct = t.length ? Math.round(t.where(x => x.completed).length / t.length * 100) : (g.progress ?? 0);
  dv.el("div", `<div class="xo-row"><span>${g.file.link} · <i>${g.area ?? ""}</i></span><span class="v">${pct}% · ${g.deadline ? dv.date(g.deadline).toFormat("d MMM yyyy") : "no deadline"}</span></div><progress value="${pct}" max="100"></progress>`);
}
```
