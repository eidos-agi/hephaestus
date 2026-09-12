CREATE TABLE IF NOT EXISTS guidance_releases (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  revision TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  stored_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

