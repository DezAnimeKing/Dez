---
cssclasses:
  - terminal
---
# Sync with Excel

> [!terminal] Close the workbooks, then run
> Windows: double-click `System/Sync/sync.bat`
> Mac: double-click `System/Sync/sync.command`

| You do this in Obsidian | It lands in Excel |
|---|---|
| `12.50 groceries` under **Money** | Budget ▸ Manual Log (Variable Exp ▸ Groceries) |
| `+1150 freelance` under **Money** | Budget ▸ Manual Log (Income) |
| tick a task in a daily note | Tasks ▸ Variable Tasks (dated that day) |
| tick a habit | Tasks ▸ Habit Tracker |
| tick a mood | Tasks ▸ Habit Tracker ▸ mood row |
| write **One good thing** | Tasks ▸ Gratitude Log |

Coming back from Excel: [[Budget Snapshot]] (money left this month, shown at the top of each day) and [[Excel Agenda]] (recurring tasks, shown as 🔁 on their day).

**Good to know**
- Only input cells are written, never formulas or charts. A backup of each workbook is kept in `System/Sync/backups/`.
- Rows the sync adds are tagged `↻ vault`. Anything you type straight into Excel is kept.
- The money word is matched to your Excel categories (Groceries, Eating Out…). If there's no match it goes to **Other**. Income with no match goes to the `default_income` set in `sync_config.json`.
- Excel → Obsidian uses what Excel last saved, so open and save a workbook once after changing it.
- Workbooks are expected in the vault's `Excel/` folder. Change the paths in `sync_config.json` if yours live elsewhere.
