# The Compendium

A worldbuilding depository for a single author: characters, regions, timeline
events, scenes, systems documentation and images, densely cross-linked, opening
like a book.

Local-first. No accounts, no cloud, no network calls. Everything lives in this
browser's IndexedDB and leaves only when you export it.

## Running it

It is a static site with no build step:

```
python3 -m http.server 8777      # or any static server
open http://localhost:8777
```

Open it from a `file://` URL and the browser will refuse the ES modules — serve
it. Add it to your phone's home screen and it behaves like an app.

## Where things are

```
index.html          the cover and the app shell
css/tokens.css      palette, type and spacing — the world's colours live here
css/app.css         the shell and every view
js/schema.js        record shapes and the closed vocabularies
js/reckoning.js     the calendar: canonical years in, any reckoning out
js/db.js            IndexedDB. The only module that knows IndexedDB exists
js/store.js         the app-facing data API: CRUD, autosave, query, trash, undo
js/backup.js        export and import, images included
js/markdown.js      the .md importer, including the status tags
js/router.js        hash routing — the URL is the state
js/ui.js            DOM helpers, the status chip, bottom sheets, toasts
js/main.js          boot: cover, routes, saved indicator
js/views/           contents · collection · page · settings
js/selftest.js      the data-layer checks, runnable from inside the app
test/*.test.mjs     the same logic where it needs no browser
```

## Importing your markdown

Settings → **Import markdown**. Choose the section to file the batch under,
pick the files, and read the preview — nothing is written until you confirm,
and the import can be undone afterwards.

What it does with a file:

- The first `# H1` becomes the page title; failing that, the filename.
- Headings become blocks with an anchor, so `[[Page#Heading]]` will land on
  them when linking arrives at stage 3. Lists, quotes, tables and fenced code
  each stay one block. Nothing is discarded.
- `[CANON]` / `[PROPOSED]` / `[OPEN]` / `[SOURCE]` anywhere in a block set that
  block's status and are stripped from the prose. Bold, italic or lowercase
  forms all count.
- A tag **on a heading** rules that whole section, until a heading at the same
  or a shallower level starts a new one. A block with its own tag still wins
  inside that section.
- A tag on the H1 — or a `status:` in front matter — sets the page's status.
  Blocks that merely inherit it are stored as "inherit", so re-ruling the page
  re-rules them with it.
- `[[Wiki links]]` are recorded now and resolved at stage 3.

Optional YAML front matter, all keys optional:

```
---
title:   The First Vessel
type:    character | region | event | scene | system
status:  CANON | PROPOSED | OPEN | SOURCE
tier:    canon | exercise | sealed
cast:    principal | instrument | record     # characters
music:   A borrowed song                     # characters
era:     Late Fall                           # regions
faction: None                                # regions
aliases: She Who Was Kept, The Understudy
tags:    [vessel, soul]
---
```

Anything it does not understand — an unknown `type`, an empty file — is
reported in the preview rather than guessed at.

## Two rules the code keeps

**One canonical year.** The world counts years from more than one origin — Fall
Reckoning, and Unhoming Reckoning starting at Fall +50. An event stores a single
canonical year; each reckoning is an offset applied at display time, so Fall 666
and Unhoming 616 can never drift apart. A third reckoning is a new record, not a
code change.

**Nothing is destroyed quietly.** Deleting moves a record to trash and pushes an
undo entry. Import refuses a file whose record counts do not match its contents,
rather than restoring a partial world over a good one, and replaces everything in
a single transaction. Images are Blobs in IndexedDB, never base64 in a text
field and never in localStorage.

## Checking it

```
node --test "test/*.test.mjs"
```

and, in the app itself, **Run checks** under Settings → Self-test — it exercises
the real IndexedDB in your own browser, takes a full backup before it starts and
restores it afterwards, so it is safe to run on a real world.

## Build order

1. ~~Data layer + export/import~~
2. ~~Cover → Contents → page CRUD for characters and regions~~, and markdown
   bulk import, pulled forward so an existing `.md` library can come in now
3. Linking: `[[ ]]` autocomplete, anchors, backlinks ← next
4. Timeline: vertical, horizontal, eras, range isolation, reckoning switching
5. Story, with the dialogue editor
6. Status system and the Open Questions Register
7. Typed relationships and the graph view
8. Gallery, images, map pins
9. Polish, search, keyboard shortcuts

Sections whose own views have not landed yet — Timeline, Story, Gallery — still
hold anything imported into them, and list it, so nothing is stranded while the
build order catches up.
