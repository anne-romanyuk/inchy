-- task_occurrences: one row per "I am working on X on a specific calendar date".
-- One goal_task / goal_subtask / standalone item can spawn many occurrences
-- across different dates (today + tomorrow + day-after, etc).
-- Completing an occurrence is NOT the same as completing the underlying
-- goal task/subtask; the server only propagates completion when the client
-- asks for it via completion_scope='whole'.
--
-- For goal-linked occurrences, the live title is read from goal_tasks /
-- goal_subtasks at query time. The `title` column here is a denormalised
-- snapshot used only for `source_kind='standalone'`, plus a graceful fallback
-- if the upstream goal_task / goal_subtask is somehow missing.

-- Drop the unused legacy task_occurrences shell from migration 002.
-- That table had a completely different shape (task_id, status, moved_to) and
-- was never wired into any route or written to. We replace it wholesale.
DROP INDEX IF EXISTS idx_occurrences_user_date;
DROP INDEX IF EXISTS idx_occurrences_task;
DROP TABLE IF EXISTS task_occurrences;

CREATE TABLE task_occurrences (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occurrence_date TEXT NOT NULL,
  source_kind     TEXT NOT NULL CHECK (source_kind IN ('standalone','goal_task','goal_subtask')),
  goal_id         TEXT REFERENCES goals(id) ON DELETE CASCADE,
  goal_task_id    TEXT REFERENCES goal_tasks(id) ON DELETE CASCADE,
  goal_subtask_id TEXT REFERENCES goal_subtasks(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  priority        TEXT CHECK (priority IS NULL OR priority IN ('low','medium','high')),
  category        TEXT NOT NULL DEFAULT '',
  duration        TEXT NOT NULL DEFAULT '',
  completed       INTEGER NOT NULL DEFAULT 0,
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,

  -- Each source_kind requires its own FK columns to be set (and others null).
  CHECK (
    (source_kind = 'standalone'   AND goal_task_id IS NULL AND goal_subtask_id IS NULL) OR
    (source_kind = 'goal_task'    AND goal_task_id IS NOT NULL AND goal_subtask_id IS NULL) OR
    (source_kind = 'goal_subtask' AND goal_subtask_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_occurrences_user_date
  ON task_occurrences(user_id, occurrence_date, position);
CREATE INDEX IF NOT EXISTS idx_occurrences_goal_task
  ON task_occurrences(goal_task_id);
CREATE INDEX IF NOT EXISTS idx_occurrences_goal_subtask
  ON task_occurrences(goal_subtask_id);

-- One open (uncompleted) occurrence per (user, date, source pointer).
-- Closed/completed ones can stack up unlimited as history.
CREATE UNIQUE INDEX IF NOT EXISTS uq_occurrences_open_goal_task
  ON task_occurrences(user_id, occurrence_date, goal_task_id)
  WHERE completed = 0 AND source_kind = 'goal_task';
CREATE UNIQUE INDEX IF NOT EXISTS uq_occurrences_open_goal_subtask
  ON task_occurrences(user_id, occurrence_date, goal_subtask_id)
  WHERE completed = 0 AND source_kind = 'goal_subtask';
