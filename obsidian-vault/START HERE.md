# START HERE

## How to use it
1. **Open Obsidian.** It opens today's note automatically, already filled in.
2. **Tap boxes.** Top 3 tasks, habits, and one mood.
3. **Money:** type `12.50 groceries` under Money. Use `+1150 freelance` for money coming in.
4. **Timeline:** tap **Woke up / Walk / Gym / Meal / Done / Sleep** at the top. Each tap stamps the time. To add details first, type them in the box above the buttons (`Walk 7.5K · 1h20`, `Pasta · 650kcal P30 C80 F18`). Tap ⋮ on a card to edit it. Change the buttons, colours or icons at the top of `System/Scripts/timeline.js`.
5. **Random thought?** Put it in [[Brain Dump]].
6. Unfinished tasks from earlier days show up at the top of today's note as **Carried over**. Tick them there.

That's the whole system. [[Home]] is the dashboard: today's tasks and habits (tick them right there), the latest timeline entries, money, your projects board and the music player.

## Themes
Switch at the top right of [[Home]]: **After Hours** (red noir), **Dawn FM** (blue airwaves) or **Neon** (the original). Or use Settings ▸ Appearance ▸ CSS snippets, keeping **xo-nights** on and only one of `theme-after-hours` / `theme-dawn-fm`.

## Projects
Each project is a note in `Projects/`. Add one from the box under the board. It starts in Backlog. Move it along with ← → and tick its tasks inside the note. The progress bars update on their own.

## Excel (on your PC, whenever you like)
Close the workbooks, then double-click `System/Sync/sync.bat` (Windows) or `sync.command` (Mac). [[Sync with Excel|Details]].

## If the neon theme isn't showing
1. Obsidian ▸ **Open folder as vault** ▸ pick the folder that contains this note (it has a hidden `.obsidian` folder).
2. Settings ▸ **Community plugins** ▸ turn on, then enable Dataview, Calendar, Heatmap Calendar, Homepage.
3. Settings ▸ **Appearance** ▸ Dark, then CSS snippets ▸ ↻ ▸ turn on **xo-nights**.

**Phone:** sync this folder from your PC (Obsidian Sync, iCloud Drive or Syncthing). Copying with the Files app drops the hidden `.obsidian` folder.

## Change things
- **Habits:** edit the list in `System/Templates/Daily.md`. Keep the names the same as the Excel Habit Tracker so they sync.
- **Colours per note:** `cssclasses: after-hours`, `dawn-fm`, `kissland` or `terminal`.
