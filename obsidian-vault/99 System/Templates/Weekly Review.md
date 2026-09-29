---
week: {{date:GGGG-[W]WW}}
cssclasses:
  - dawn-fm
---
![[banner-dawn-fm.svg|banner]]

# Weekly review · {{date:GGGG-[W]WW}}

## Signal (last 7 days)
```dataviewjs
const days = dv.pages('"01 Daily"').where(p => p.file.day && p.file.day >= dv.date("today").minus({days: 6}));
let spent = 0; for (const p of days) for (const li of p.file.lists) spent += Number(li.spend ?? 0) || 0;
dv.table(["Day", "Mood", "Habits", "Spend"], days.sort(p => p.file.day).map(p => {
  const h = p.file.tasks.where(t => t.section && t.section.subpath === "Habits");
  const s = p.file.lists.map(li => Number(li.spend ?? 0) || 0).array().reduce((a, b) => a + b, 0);
  return [p.file.link, p.mood ?? "–", h.length ? Math.round(h.where(t => t.completed).length / h.length * 100) + "%" : "–", "$" + s.toFixed(0)];
}));
dv.paragraph(`**Total spend:** $${spent.toFixed(2)}`);
```

## Wins
- 

## What drained me
- 

## Next week — top 3
1. 
2. 
3. 

## Completed this week
```tasks
done after 7 days ago
short mode
```
