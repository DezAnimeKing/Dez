# Dezk

A daily productivity deck that runs from a single folder of static files. Tasks
and project boards, a calendar, habits, notes, a focus timer, and **pages** —
small databases you shape yourself, which is how the Journal and Reading list
are built.

No account, no server, no build step, no dependencies. Open `index.html` and it
works; everything is stored in your browser and exports to one JSON file.

## Running it

```sh
# any static server works — the app is plain HTML, CSS and ES modules
python3 -m http.server 8899
# then open http://127.0.0.1:8899
```

Opening `index.html` straight off disk works too, though a couple of browsers
block local storage on `file://` — if yours does, Dezk says so in Settings and
keeps running in memory. For a permanent copy, push this folder to GitHub Pages
or any static host.

First run loads sample data so the screens are not empty. Settings → *Start
fresh* clears it.

## What is in it

**Today** — greeting, what is overdue and due, a focus timer, today's habits,
and a box that writes straight into your journal. One screen to open in the
morning.

**Tasks** — one list, grouped by date, project, priority or tag, filtered by any
combination of them. Quick add parses what you type:

```
Call the plumber tomorrow at 9am !high #home +errand
└ title ──────────┘ └ due ──┘ └time┘ │      │      └ tag
                                     │      └ project (matched by name)
                                     └ priority: !high !med !low
```

It also understands `today`, `next week`, `in 3 days`, `friday`, `next tue`,
`12/25`, `dec 4` and `2026-10-30`.

**Projects** — a kanban board per project with columns you rename, add and
reorder, drag and drop between them, plus list and calendar views of the same
tasks. Projects group under categories in the sidebar.

**Calendar** — everything with a date on it. Drag a task to another day to
reschedule it; double-click a day to add one.

**Pages** — the part that makes this yours. A page is a small database: fields
you define (text, long text, number, select, tags, date, checkbox, rating,
link) and views over them (table, board, gallery, list). Journal and Reading
list ship as pages; so do templates for a watchlist, goals, a training log,
meeting notes and a spending log. Or start blank and add fields as you go.

**Habits** — a weekly strip, streaks, and an 18-week heatmap per habit.

**Notes** — for the thinking that does not fit on a task. Pinning, tags, search.

**Review** — completions and focus minutes per day, project progress, where your
tags went, habit consistency, and the tasks that have been open long enough to
deserve a decision rather than another week.

## Keyboard

| | |
| --- | --- |
| `Ctrl`/`⌘` + `K` | search everything and run commands |
| `N` | new task · `P` new project |
| `G` then `T` `U` `I` `A` `P` `C` `G` `H` `N` `R` `S` | go to Today, Upcoming, Inbox, All tasks, Projects, Calendar, Pages, Habits, Notes, Review, Settings |
| `F` | start or pause the focus timer |
| `\` | show or hide the sidebar |
| `Ctrl`/`⌘` + `Z` / `+ Shift + Z` | undo / redo |
| `?` | the full list · `Esc` closes whatever is open |

## Your data

Everything lives in this browser's local storage under `dezk.state.v1` and is
never sent anywhere. Settings → *Backup* downloads the lot as JSON; *Restore*
reads it back, on this machine or another one. Destructive actions are undoable
from the toast that follows them, or with `Ctrl`/`⌘` + `Z`.

## How it is put together

```
index.html            loads five stylesheets and one ES module
styles/               tokens → base → layout → components → views
src/
  main.js             render loop, routing table, keyboard shortcuts
  router.js           hash routes, "#/pages/:id?view=:id"
  lib/                dom (hyperscript), date, icons, id, quick-add parser
  store/
    state.js          the store: persistence, migrations, undo stack
    seed.js           sample content, dated relative to today
    selectors.js      every derived query in one place
    actions.js        every mutation in one place
    templates.js      page templates and field/view types
  ui/                 shell, palette, drawer, modal, menu, toast, timer, controls
  views/              one module per screen, each returning { topbar, body }
tests/                three Playwright suites — see tests/README.md
```

The render loop is deliberately blunt: any change to the store rebuilds the
current view, and `main.js` puts the caret and scroll position back where they
were. There is no virtual DOM to reason about, and at this data size there is no
need for one.

Adding a screen means writing `src/views/thing.js` that returns a topbar
description and a body node, then adding one line to the `ROUTES` table in
`main.js`.
