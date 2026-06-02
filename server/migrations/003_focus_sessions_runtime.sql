ALTER TABLE focus_sessions ADD COLUMN planned_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE focus_sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','skipped','abandoned'));

CREATE INDEX IF NOT EXISTS idx_focus_user_active ON focus_sessions(user_id, ended_at);
