# Browser tests

Four Playwright suites drive the real app in Chromium and fail on any console
error or uncaught exception, not just on assertions.

| suite | covers |
| --- | --- |
| `smoke.mjs` | every route renders, board drag & drop, quick add, drawer, palette, template picker, theme persistence |
| `deep.mjs` | inline add and its parser, undo, `g`-shortcuts, filters, field and view editors, category manager, settings persistence, focus timer, calendar drag, export, reload |
| `mobile.mjs` | 390px layout: no horizontal overflow on any route, nav drawer behaviour, and that the app still renders and accepts edits with the network off |
| `sync.mjs` | two browser profiles against a real Worker: first upload, adopting the server copy, changes crossing both ways, concurrent edits, habit ticks merging, deletions propagating, offline queueing |

## Running them

```sh
npm i -D playwright
npx playwright install chromium
./tests/run.sh            # smoke, deep and mobile
./tests/run.sh deep       # just one
```

`run.sh` covers the first three. `sync.mjs` needs the Worker rather than a
static server — follow "Running it locally" in [`server/README.md`](../../server/README.md),
then:

```sh
node tests/sync.mjs                       # expects http://127.0.0.1:8790
SYNC_BASE=… SYNC_PASSPHRASE=… node tests/sync.mjs
```

`run.sh` starts `python3 -m http.server` on port 8899 and stops it afterwards.
Point the suites at an already-running server with `BASE=http://…`, use a
browser Playwright did not install with `CHROME_PATH=/path/to/chrome`, and send
screenshots somewhere other than `.shots/` with `SHOT_DIR=…`.
