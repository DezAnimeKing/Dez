# Browser tests

Three Playwright suites drive the real app in Chromium and fail on any console
error or uncaught exception, not just on assertions.

| suite | covers |
| --- | --- |
| `smoke.mjs` | every route renders, board drag & drop, quick add, drawer, palette, template picker, theme persistence |
| `deep.mjs` | inline add and its parser, undo, `g`-shortcuts, filters, field and view editors, category manager, settings persistence, focus timer, calendar drag, export, reload |
| `mobile.mjs` | 390px layout: no horizontal overflow on any route, nav drawer opens and closes on navigation |

## Running them

```sh
npm i -D playwright
npx playwright install chromium
./tests/run.sh            # all three
./tests/run.sh deep       # just one
```

`run.sh` starts `python3 -m http.server` on port 8899 and stops it afterwards.
Point the suites at an already-running server with `BASE=http://…`, use a
browser Playwright did not install with `CHROME_PATH=/path/to/chrome`, and send
screenshots somewhere other than `.shots/` with `SHOT_DIR=…`.
