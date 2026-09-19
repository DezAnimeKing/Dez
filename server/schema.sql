-- One row per synced entity. `seq` is a server-side counter the clients use as
-- a cursor: "give me everything that changed after this number".
CREATE TABLE IF NOT EXISTS items (
  kind       TEXT    NOT NULL,
  id         TEXT    NOT NULL,
  updated_at INTEGER NOT NULL,          -- client clock, milliseconds
  seq        INTEGER NOT NULL,          -- server order
  deleted    INTEGER NOT NULL DEFAULT 0,
  device     TEXT,
  body       TEXT,                      -- JSON, null for tombstones
  PRIMARY KEY (kind, id)
);

CREATE INDEX IF NOT EXISTS items_seq ON items (seq);

CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

INSERT OR IGNORE INTO meta (k, v) VALUES ('seq', '0');
