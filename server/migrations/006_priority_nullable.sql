CREATE TABLE tasks_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  priority TEXT CHECK (priority IS NULL OR priority IN ('low','medium','high')),
  category TEXT NOT NULL DEFAULT '',
  duration TEXT NOT NULL DEFAULT '',
  completed INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

INSERT INTO tasks_new (id, user_id, title, priority, category, duration, completed, position, created_at)
SELECT id, user_id, title, priority, category, duration, completed, position, created_at FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_user_position ON tasks(user_id, position);

CREATE TABLE default_tasks_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  priority TEXT CHECK (priority IS NULL OR priority IN ('low','medium','high')),
  category TEXT NOT NULL DEFAULT '',
  duration TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

INSERT INTO default_tasks_new (id, user_id, title, priority, category, duration, created_at)
SELECT id, user_id, title, priority, category, duration, created_at FROM default_tasks;

DROP TABLE default_tasks;
ALTER TABLE default_tasks_new RENAME TO default_tasks;
CREATE INDEX IF NOT EXISTS idx_default_tasks_user ON default_tasks(user_id, created_at DESC);
