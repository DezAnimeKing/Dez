# Dezk sync server

A single Cloudflare Worker that serves the app **and** stores your data in D1,
so your laptop and your phone open the same address and see the same deck.
There is no account system: one passphrase covers all your devices.

On Cloudflare's free tier this costs nothing for personal use — D1 allows
5 GB of storage and millions of reads a day; a busy deck is a few hundred KB.

## Setting it up

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and
Node installed. Run everything from the repository root.

```sh
# 1. Sign in (opens a browser)
npx wrangler login

# 2. Create the database, then paste the printed database_id into
#    server/wrangler.toml, replacing PASTE_YOUR_DATABASE_ID_HERE
npx wrangler d1 create dezk

# 3. Create the tables
npx wrangler d1 execute dezk --remote -c server/wrangler.toml --file=server/schema.sql

# 4. Choose the passphrase your devices will sign in with.
#    Make it long. It is the only thing protecting your data.
npx wrangler secret put DEZK_PASSPHRASE -c server/wrangler.toml

# 5. Deploy
npx wrangler deploy -c server/wrangler.toml
```

Wrangler prints an address like `https://dezk.your-name.workers.dev`. Open it
on your laptop, go to **Settings → Sync → Connect**, paste that address and the
passphrase. Then open the same address on your phone, connect with the same
passphrase, and add it to your home screen.

The first device to connect uploads its deck. The second one is offered the
server's copy instead of its own sample data, so you do not end up with two
sets of demo projects.

### Updating it later

```sh
npx wrangler deploy -c server/wrangler.toml
```

Your data lives in D1, not in the Worker, so deploying never touches it.

## How the syncing works

Each task, project, page, entry, note and habit is stored as its own row, and
carries the time it was last changed on whichever device changed it.

- **Pushing** sends only what changed on this device since its last successful
  sync. Edits made with no signal queue up and go out on reconnect.
- **Pulling** asks for everything with a sequence number above this device's
  cursor. The server hands rows over *before* applying the push, so a device
  always sees the other one's version before it can replace it.
- **Conflicts** resolve by last write wins, per item. Editing different tasks
  on two devices never conflicts at all; editing the *same* task keeps the
  later edit.
- **Habit ticks** are the exception, because both devices touch the same habit
  on the same day. Each day is timestamped separately and merged day by day, so
  a tick on your phone and one on your laptop both survive.
- **Deletions** travel as tombstones, kept for 90 days, so a delete on one
  device reaches the others rather than being resurrected by them.

The server never looks inside a row. It orders them and hands them out.

## What is protected, and what is not

- The passphrase is checked in constant time, and a wrong guess waits 400ms
  before answering, which makes online guessing slow.
- A successful sign-in returns a token signed with your passphrase, valid for
  120 days. It is stored on the device, never in an export or a backup file.
- Traffic is HTTPS, end to end, because Workers only serve HTTPS.
- **Your rows are not encrypted at rest.** Anyone with access to your
  Cloudflare account can read them in the D1 console. For a personal task list
  that is usually the right trade; if it is not, do not put secrets in here.
- Anyone who learns the passphrase gets everything. Use a long one, and change
  it with `wrangler secret put DEZK_PASSPHRASE` — which signs every device out.

## Endpoints

| route | what it does |
| --- | --- |
| `POST /api/login` | passphrase in, bearer token out, plus whether the server already holds data |
| `POST /api/sync` | `{cursor, device, changes}` in; the other devices' changes out |
| `POST /api/beacon` | a last-gasp push as a tab closes; the token travels in the body because `sendBeacon` cannot set headers |
| `GET /api/health` | reports whether the database and passphrase are configured |
| anything else | the app itself, from the `ASSETS` binding |

## Running it locally

```sh
cp server/wrangler.toml server/wrangler.dev.toml
# in the copy: set database_id = "local-dev" and add
#   [vars]
#   DEZK_PASSPHRASE = "a-test-passphrase"
npx wrangler dev -c server/wrangler.dev.toml --port 8790 --local
npx wrangler d1 execute dezk -c server/wrangler.dev.toml --local --file=server/schema.sql
```

That serves the app at <http://127.0.0.1:8790> with a local SQLite database, and
is what `app/tests/sync.mjs` drives two browsers against.
