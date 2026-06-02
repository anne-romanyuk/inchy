CREATE TABLE IF NOT EXISTS focus_task_segments (
  id TEXT PRIMARY KEY,
  focus_session_id TEXT NOT NULL REFERENCES focus_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_focus_task_segments_task ON focus_task_segments(user_id, task_id);
CREATE INDEX IF NOT EXISTS idx_focus_task_segments_session ON focus_task_segments(focus_session_id);
