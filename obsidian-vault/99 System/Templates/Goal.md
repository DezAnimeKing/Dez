---
area: Personal Growth
status: active
progress: 0
deadline: 
reward: ""
cssclasses:
  - kissland
---
# {{title}}

> [!kissland] Why
> 

> [!after-hours] Biggest obstacle
> 

## Steps
- [ ] 
- [ ] 
- [ ] 

```dataviewjs
const t = dv.current().file.tasks;
const pct = t.length ? Math.round(t.where(x => x.completed).length / t.length * 100) : 0;
dv.el("div", `<div class="xo-row"><span>steps done</span><span class="v">${pct}%</span></div><progress value="${pct}" max="100"></progress>`);
dv.paragraph("Tip: copy this % into the `progress` property so the dashboard picks it up.");
```
