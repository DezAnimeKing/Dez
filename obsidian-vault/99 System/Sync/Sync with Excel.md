---
cssclasses:
  - terminal
---
![[banner-terminal.svg|banner]]

# Excel bridge

> [!terminal] One command keeps Obsidian and your two workbooks in step
> Windows: double-click `99 System/Sync/sync.bat`
> Mac: double-click `99 System/Sync/sync.command`
> any OS: `python3 "99 System/Sync/sync_excel.py"`   (add `--dry-run` to preview)

## What moves where
| From Obsidian | → Excel |
|---|---|
| `[spend:: …]` / `[income:: …]` lines in daily notes | Budget ▸ **Manual Log** |
| any task with a date (or in a daily note) | Tasks ▸ **Variable Tasks** |
| `## Habits` checkboxes | Tasks ▸ **Habit Tracker** |
| `mood` property | Tasks ▸ Habit Tracker ▸ mood row |
| `gratitude` property | Tasks ▸ **Gratitude Log** |

| From Excel (last saved values) | → Obsidian |
|---|---|
| month budget vs actual, accounts, sinking funds, debt-free date | [[Budget Snapshot]] (+ dashboard cards) |
| recurring tasks & tasks typed in Excel (next 14 days) | [[Excel Agenda]] |

## Rules that keep it safe
- Only **input cells** are written — formulas, charts and formatting are untouched.
- Rows the script writes are tagged `↻ vault`. Anything you type directly in Excel is kept.
- Obsidian is the source of truth for tagged rows: edit the note, not the tagged row.
- A backup of each workbook is kept in `99 System/Sync/backups/` (last 5).
- **Close the workbooks in Excel before syncing.** After syncing, open them — Excel recalculates everything.
- Excel → Obsidian reads what Excel last saved, so open & save a workbook once after changing it.

## Where the workbooks live
Edit `sync_config.json` (paths are relative to the vault folder; the workbooks ship in the vault's `Excel/` folder):
```json
"budget_workbook": "Excel/Ultimate_Budget_Planner.xlsx",
"tasks_workbook":  "Excel/Task_Habit_Tracker.xlsx"
```
Using OneDrive / iCloud? Point these at the synced copies — the vault and the workbooks can live in different cloud folders.

## Optional: sync button inside Obsidian
Install the community plugin **Shell commands**, add `python3 "{{vault_path}}/99 System/Sync/sync_excel.py"` and bind it to a hotkey or the ribbon.

## Name matching
- Money `cat::` → Excel sub-category (e.g. `Groceries`, `Eating Out`, `Freelance Job`).
- Task category = the first tag that matches Excel ▸ Setup ▸ Categories (`#business`, `#family` …).
- Task priority: 🔺 1-Urgent · ⏫ 2-High · 🔼 3-Medium · 🔽 4-Low. `#important` or ⭐ = important.
- Habit names must match Excel ▸ Habit Tracker column B exactly (case doesn't matter).
