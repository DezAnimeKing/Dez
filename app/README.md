# Dezk

A daily productivity deck that runs from a single folder of static files. Tasks
and project boards, a calendar, habits, notes, a focus timer, and **pages** —
small databases you shape yourself, which is how the Journal and Reading list
are built.

No build step and no dependencies. Open `index.html` and it works, with
everything stored in your browser — and if you want the same deck on your phone
and your laptop, point it at your own sync server (a free Cloudflare Worker,
set up once) and they stay in step.

## Syncing across your devices

Optional, and off until you turn it on. Deploy the Worker in
[`server/`](../server/README.md) — five commands — then open its address on
each device and sign in with the same passphrase under **Settings → Sync**.

- **Offline first.** Every device keeps its own full copy, so the app works on a
  train with no signal. Changes queue up and go out when you reconnect.
- **Per-item merging.** Each task, project, page, entry, note and habit syncs on
  its own. Editing different things on two devices never conflicts; editing the
  same thing keeps the later edit. Habit ticks merge day by day, so a tick on
  your phone and one on your laptop both survive.
- **Deletions travel**, as tombstones, rather than being undone by the device
  that had not heard about them.
- **Installable.** Add it to your home screen and it opens like an app.

Without a server nothing leaves the browser, and export/import still moves your
data by hand.

## Running it

```sh
# any static server works — the app is plain HTML, CSS and ES modules
python3 -m http.server 8899
# then open http://127.0.0.1:8899
```

Opening `index.html` straight off disk works too, though a couple of browsers
block local storage on `file://` — if yours does, Dezk says so in Settings and
keeps running in memory. For a permanent copy, deploy the Worker (which serves
this folder and syncs it), or push the folder to GitHub Pages or any static
host if you do not want syncing.

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

Everything lives in this browser's local storage under `dezk.state.v1`. With
syncing off it is never sent anywhere; with syncing on it is mirrored to your
own server and nowhere else. Settings → *Backup* downloads the lot as JSON
(without the sync token); *Restore* reads it back. Destructive actions are
undoable from the toast that follows them, or with `Ctrl`/`⌘` + `Z`.

## How it is put together

```
index.html            loads five stylesheets and one ES module
styles/               tokens → base → layout → components → views
src/
  main.js             render loop, routing table, keyboard shortcuts
  router.js           hash routes, "#/pages/:id?view=:id"
  lib/                dom (hyperscript), date, icons, id, quick-add parser
  store/
    state.js          the store: persistence, migrations, undo stack, change tracking
    entities.js       the flat, syncable view of the state, and the merge rules
    sync.js           push, pull, retry, and when to do it
    seed.js           sample content, dated relative to today
    selectors.js      every derived query in one place
    actions.js        every mutation in one place
    templates.js      page templates and field/view types
  ui/                 shell, palette, drawer, modal, menu, toast, timer, sync, controls
  views/              one module per screen, each returning { topbar, body }
sw.js                 offline shell
manifest.webmanifest  makes it installable
tests/                four Playwright suites — see tests/README.md
../server/            the Cloudflare Worker and D1 schema
```

The render loop is deliberately blunt: any change to the store rebuilds the
current view, and `main.js` puts the caret and scroll position back where they
were. There is no virtual DOM to reason about, and at this data size there is no
need for one.

Change tracking is equally blunt. After every mutation the store compares the
state against a fingerprint of what it last wrote, stamps whatever differs with
the time it changed, and notes anything that vanished. Nothing in `actions.js`
has to remember to mark itself dirty, and offline edits survive a reload because
the queue is part of the saved state.

Adding a screen means writing `src/views/thing.js` that returns a topbar
description and a body node, then adding one line to the `ROUTES` table in
`main.js`.
