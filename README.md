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
index.html        the cover, and (for now) the stage-1 data console
css/tokens.css    palette, type and spacing — the world's colours live here
css/app.css       the shell
js/schema.js      record shapes and the closed vocabularies
js/reckoning.js   the calendar: canonical years in, any reckoning out
js/db.js          IndexedDB. The only module that knows IndexedDB exists
js/store.js       the app-facing data API: CRUD, autosave, trash, undo
js/backup.js      export and import, images included
js/selftest.js    the data-layer checks, runnable from inside the app
test/pure.test.mjs the same logic where it needs no browser
```

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
node --test test/pure.test.mjs
```

and, in the app itself, **Run checks** in the Self-test section — it exercises
the real IndexedDB in your own browser, takes a full backup before it starts and
restores it afterwards, so it is safe to run on a real world.

## Build order

1. **Data layer + export/import** ← current
2. Cover → Contents → page CRUD for characters and regions
3. Linking: `[[ ]]` autocomplete, anchors, backlinks
4. Timeline: vertical, horizontal, eras, range isolation, reckoning switching
5. Story, with the dialogue editor
6. Status system and the Open Questions Register
7. Typed relationships and the graph view
8. Gallery, images, map pins
9. Polish, search, keyboard shortcuts

Markdown bulk import (parsing `[CANON]` / `[PROPOSED]` / `[OPEN]` / `[SOURCE]`
tags out of existing `.md` files) lands with stage 6, once the status system it
feeds exists.
