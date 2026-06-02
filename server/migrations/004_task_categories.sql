CREATE TABLE IF NOT EXISTS task_categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_task_categories_user ON task_categories(user_id, name);

INSERT OR IGNORE INTO task_categories (id, user_id, name, created_at)
SELECT 'cat_' || lower(hex(randomblob(12))), user_id, category, MIN(created_at)
FROM (
  SELECT user_id, category, created_at FROM tasks WHERE trim(category) <> ''
  UNION ALL
  SELECT user_id, category, created_at FROM default_tasks WHERE trim(category) <> ''
)
GROUP BY user_id, category;
