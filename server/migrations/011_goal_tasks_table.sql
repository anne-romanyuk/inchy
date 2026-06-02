-- Dedicated table for tasks that belong to goals.
-- This replaces using the generic `stages` table for goal task UI state.
CREATE TABLE IF NOT EXISTS goal_tasks (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','done','skipped')),
  deadline TEXT,
  icon_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_goal_tasks_goal_position ON goal_tasks(goal_id, position, created_at);
CREATE INDEX IF NOT EXISTS idx_goal_tasks_goal_status ON goal_tasks(goal_id, status);
CREATE INDEX IF NOT EXISTS idx_goal_tasks_deadline ON goal_tasks(goal_id, deadline);
