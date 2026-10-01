---
cssclasses:
  - dawn-fm
---
![[banner-dawn-fm.svg|banner]]

# Guide · XO Nights

> [!dawn-fm] 103.5 — you are now listening
> A dark, neon personal OS: **After Hours** red for tasks & focus, **Dawn FM** blue/teal for money & planning, **Kissland** pink/violet (Tokyo city pop) for habits, journal & music, and a green CRT terminal for system notes.

## First launch
1. Open **this folder** (the one containing `START HERE.md` and the hidden `.obsidian` folder) with Obsidian ▸ *Open folder as vault*. Not its parent.
2. When asked, click **Trust author and enable plugins** (or Settings ▸ Community plugins ▸ Turn on community plugins) (Dataview, Tasks, Calendar, Heatmap Calendar, Homepage are bundled).
3. Settings ▸ Appearance: base theme **Dark**, CSS snippet **xo-nights** on (already enabled).
4. Right sidebar: drag **Calendar** into the top panel and **Graph (local)** / **Tags** below — the layout from your reference.
5. Home opens automatically. Sample data is included (September 2026) — delete `01 Daily/*` when you're ready.

## Daily loop
- Calendar ▸ click today → a daily note from the **Daily** template (tasks, 15 habits, money lines, journal).
- Set `mood` (1–5), `gratitude`, `now_playing` in the note's properties.
- Weekly: new note from template **Weekly Review** (Ctrl/Cmd+P ▸ *Templates: Insert template*).

## Folders
| Folder | Mood | What lives there |
|---|---|---|
| `00 Inbox` | — | new notes land here |
| `01 Daily` | 🌸 kissland | daily notes |
| `02 Tasks` | 🌙 after hours | task hub, inbox, Excel agenda |
| `03 Money` | 📻 dawn fm | money hub, budget snapshot |
| `04 Habits` | 🌸 kissland | heatmaps, habit stats, mood, gratitude |
| `05 Goals` | 🌸 kissland | one note per goal |
| `06 Listening Room` | 🌸 kissland | city pop & night-drive log |
| `99 System` | ⌨ terminal | templates, banners, scripts, Excel sync |

## Styling toolkit
- Per-note mood: `cssclasses: [after-hours]`, `[dawn-fm]`, `[kissland]`, `[terminal]`, add `dashboard` for a wide page.
- Callouts: `> [!after-hours]` · `> [!dawn-fm]` · `> [!kissland]` · `> [!terminal]`
- Cards: `> [!card|red] Title` (red · teal · pink · violet · green · blue · amber); wrap several in `> [!grid]` for columns.
- Banners: `![[banner-after-hours.svg|banner]]` (also `banner-dawn-fm`, `banner-kissland`, `banner-terminal`). Regenerate or restyle with `99 System/Scripts/make_banners.py`.
- Fonts (Orbitron, Share Tech Mono, Zen Kaku Gothic New) load from Google Fonts; install them locally for offline use.

## Excel
See [[Sync with Excel]].
