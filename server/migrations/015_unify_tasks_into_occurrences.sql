-- Collapses the legacy `tasks` table into `task_occurrences` with
-- source_kind='standalone'. Each existing task becomes an occurrence with
-- the same id, so focus tracking (focus_sessions.task_id and
-- focus_task_segments.task_id) keeps pointing at a valid row without any
-- data rewrite. We also retarget the focus tables' FKs from `tasks` to
-- `task_occurrences`, then drop `tasks` entirely.
--
-- All migrated rows are placed on today's local date so existing users
-- don't suddenly lose their day's work — `GET /api/occurrences?date=today`
-- will return them just like the legacy `GET /api/tasks` did.
--
-- SQLite specifics:
--  * DROP TABLE on a parent leaves child FKs dangling but does NOT throw,
--    which is what we want — the child gets recreated with the right FK
--    immediately after.
--  * INSERT into a newly-created table with FK=ON validates each row;
--    that's fine here because every focus_sessions.task_id / segment.task_id
--    was already in tasks(id), and we just mirrored those ids into
--    task_occurrences before doing the swap.

-- 1. Mirror every standalone task into task_occurrences (same id).
INSERT INTO task_occurrences (
  id, user_id, occurrence_date, source_kind,
  goal_id, goal_task_id, goal_subtask_id,
  title, priority, category, duration,
  completed, position, created_at, updated_at
)
SELECT
  t.id,
  t.user_id,
  date('now', 'localtime'),
  'standalone',
  NULL, NULL, NULL,
  t.title,
  t.priority,
  t.category,
  t.duration,
  t.completed,
  t.position,
  t.created_at,
  t.created_at
FROM tasks t
WHERE NOT EXISTS (SELECT 1 FROM task_occurrences o WHERE o.id = t.id);

-- 2. Recreate focus_sessions: same shape, but FK task_id → task_occurrences.
CREATE TABLE focus_sessions_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES task_occurrences(id) ON DELETE SET NULL,
  goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'focus' CHECK (mode IN ('focus','short_break','long_break')),
  label TEXT NOT NULL DEFAULT '',
  planned_seconds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','skipped','abandoned'))
);
INSERT INTO focus_sessions_new (
  id, user_id, task_id, goal_id, started_at, ended_at,
  duration_seconds, mode, label, planned_seconds, status
)
SELECT
  id, user_id, task_id, goal_id, started_at, ended_at,
  duration_seconds, mode, label, planned_seconds, status
FROM focus_sessions;
DROP TABLE focus_sessions;
ALTER TABLE focus_sessions_new RENAME TO focus_sessions;
CREATE INDEX idx_focus_user_date ON focus_sessions(user_id, started_at);
CREATE INDEX idx_focus_user_active ON focus_sessions(user_id, ended_at);

-- 3. Recreate focus_task_segments: FK task_id → task_occurrences.
CREATE TABLE focus_task_segments_new (
  id TEXT PRIMARY KEY,
  focus_session_id TEXT NOT NULL REFERENCES focus_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES task_occurrences(id) ON DELETE CASCADE,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
INSERT INTO focus_task_segments_new (
  id, focus_session_id, user_id, task_id, duration_seconds, created_at
)
SELECT
  id, focus_session_id, user_id, task_id, duration_seconds, created_at
FROM focus_task_segments;
DROP TABLE focus_task_segments;
ALTER TABLE focus_task_segments_new RENAME TO focus_task_segments;
CREATE INDEX idx_focus_task_segments_task ON focus_task_segments(user_id, task_id);
CREATE INDEX idx_focus_task_segments_session ON focus_task_segments(focus_session_id);

-- 4. Drop the legacy tasks table. Indexes go with it automatically.
DROP TABLE tasks;
