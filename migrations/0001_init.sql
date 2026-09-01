-- Trove — catalogue schema (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS collections (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  source      TEXT NOT NULL DEFAULT 'trove',   -- 'instagram' when it came from an export
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS references_ (
  id            TEXT PRIMARY KEY,
  filename      TEXT NOT NULL,                 -- the caption shown under every image
  media_key     TEXT,                          -- R2 object key, null while a fetch is pending
  width         INTEGER,
  height        INTEGER,
  bytes         INTEGER,

  source        TEXT NOT NULL,                 -- 'upload' | 'instagram' | 'link'
  source_url    TEXT,
  author        TEXT,                          -- e.g. instagram handle
  caption       TEXT,

  -- AI enrichment
  status        TEXT NOT NULL DEFAULT 'queued',-- queued | enriching | ready | failed
  tags          TEXT,                          -- JSON array of strings
  style         TEXT,                          -- JSON array of style descriptors
  mood          TEXT,                          -- JSON array
  format        TEXT,                          -- photo | render | graphic | type | still
  palette       TEXT,                          -- JSON array of {hex,name,share}
  ocr           TEXT,

  -- identification
  ident_title      TEXT,
  ident_maker      TEXT,
  ident_place      TEXT,
  ident_year       TEXT,
  ident_confidence TEXT,                       -- high | medium | low | unidentified
  ident_sources    TEXT,                       -- JSON array of {label,url}

  cluster_id    TEXT,
  saved_at      INTEGER,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_refs_created ON references_(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refs_status  ON references_(status);
CREATE INDEX IF NOT EXISTS idx_refs_cluster ON references_(cluster_id);

CREATE TABLE IF NOT EXISTS reference_collections (
  reference_id  TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  PRIMARY KEY (reference_id, collection_id)
);

-- full-text over everything the AI wrote, so plain keyword search stays instant
CREATE VIRTUAL TABLE IF NOT EXISTS refs_fts USING fts5(
  id UNINDEXED, filename, tags, style, mood, caption, ident, ocr
);

CREATE TABLE IF NOT EXISTS clusters (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  summary     TEXT,
  size        INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS boards (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  client      TEXT,
  event_date  TEXT,
  style       TEXT NOT NULL DEFAULT 'editorial', -- editorial | grid | collage
  narrative   TEXT,
  materials   TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS board_items (
  board_id     TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (board_id, reference_id)
);

CREATE TABLE IF NOT EXISTS palettes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  board_id    TEXT,
  swatches    TEXT NOT NULL,                   -- JSON array of {hex,name,share,locked}
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS concepts (
  id          TEXT PRIMARY KEY,
  board_id    TEXT NOT NULL,
  slot        TEXT NOT NULL,                   -- room dressing | table setting | invitation | signage
  filename    TEXT NOT NULL,
  media_key   TEXT,
  prompt      TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS imports (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,                  -- upload | instagram-export
  total        INTEGER NOT NULL DEFAULT 0,
  enriched     INTEGER NOT NULL DEFAULT 0,
  failed       INTEGER NOT NULL DEFAULT 0,
  note         TEXT,
  created_at   INTEGER NOT NULL
);
