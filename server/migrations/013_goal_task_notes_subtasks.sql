-- Add per-task note (max 255 chars enforced in app layer) and goal_subtasks table.

ALTER TABLE goal_tasks ADD COLUMN note TEXT;

CREATE TABLE IF NOT EXISTS goal_subtasks (
  id TEXT PRIMARY KEY,
  goal_task_id TEXT NOT NULL REFERENCES goal_tasks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_goal_subtasks_task_position
  ON goal_subtasks(goal_task_id, position, created_at);
