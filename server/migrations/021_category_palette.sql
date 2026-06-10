ALTER TABLE task_categories ADD COLUMN color TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS note_categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_note_categories_user ON note_categories(user_id, name);

INSERT OR IGNORE INTO note_categories (id, user_id, name, created_at)
SELECT 'note_cat_' || lower(hex(randomblob(12))), user_id, category, MIN(created_at)
FROM notes
WHERE trim(category) <> ''
GROUP BY user_id, category;
