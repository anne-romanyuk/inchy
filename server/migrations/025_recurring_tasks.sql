CREATE TABLE IF NOT EXISTS recurring_tasks (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_on  TEXT NOT NULL,
  frequency  TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','yearly')),
  ends_on    TEXT,
  title      TEXT NOT NULL,
  priority   TEXT CHECK (priority IS NULL OR priority IN ('low','medium','high')),
  category   TEXT NOT NULL DEFAULT '',
  duration   TEXT NOT NULL DEFAULT '',
  time       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recurring_tasks_user_range
  ON recurring_tasks(user_id, starts_on, ends_on);

ALTER TABLE task_occurrences ADD COLUMN recurring_task_id TEXT REFERENCES recurring_tasks(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_occurrences_recurring_date
  ON task_occurrences(user_id, occurrence_date, recurring_task_id)
  WHERE recurring_task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS recurring_task_exceptions (
  recurring_task_id TEXT NOT NULL REFERENCES recurring_tasks(id) ON DELETE CASCADE,
  occurrence_date   TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  PRIMARY KEY (recurring_task_id, occurrence_date)
);
