---
cssclasses:
  - kissland
---
![[banner-kissland.svg|banner]]

# Listening Room · 深夜ラジオ

> [!kissland] City pop & night drives
> Set a daily note's `now_playing` property and it shows up here. Moods: **after hours** (red, late-night) · **dawn fm** (blue, morning reset) · **kissland** (pink, Tokyo neon).

```dataview
TABLE WITHOUT ID file.link AS Night, now_playing AS "Now playing", mood AS Mood
FROM "01 Daily"
WHERE now_playing
SORT file.day DESC
LIMIT 30
```

## Rotation
| Mood | Vibe | Use it for |
|---|---|---|
| 🌙 After Hours | red neon, empty streets, 3 a.m. | deep work, journaling |
| 📻 Dawn FM | blue haze, morning radio | planning, weekly review |
| 🌸 Kissland | Tokyo neon, city pop, sakura | habits, creative sessions |

## Queue
- 
