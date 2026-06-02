-- Foundation for upcoming Goal Journey, Focus history and Templates.
-- Tables are created now so future routes can land without another schema migration.

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  deadline TEXT,
  pace_target REAL,
  pace_unit TEXT CHECK (pace_unit IN ('tasks_per_day','tasks_per_week','minutes_per_day','minutes_per_week')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','done','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id, status);

CREATE TABLE IF NOT EXISTS stages (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','done','skipped')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stages_goal ON stages(goal_id, position);

-- Stage link added as a nullable column on tasks (kept here so the foundation is contained).
ALTER TABLE tasks ADD COLUMN stage_id TEXT REFERENCES stages(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN est_minutes INTEGER;

CREATE INDEX IF NOT EXISTS idx_tasks_stage ON tasks(stage_id);

-- TaskOccurrence separates "task definition" from "task on a given day".
-- Enables done/skipped/moved without losing history.
CREATE TABLE IF NOT EXISTS task_occurrences (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','skipped','moved')),
  moved_to TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_occurrences_user_date ON task_occurrences(user_id, date);
CREATE INDEX IF NOT EXISTS idx_occurrences_task ON task_occurrences(task_id);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'focus' CHECK (mode IN ('focus','short_break','long_break')),
  label TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_focus_user_date ON focus_sessions(user_id, started_at);

CREATE TABLE IF NOT EXISTS templates (
  slug TEXT NOT NULL,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (slug, version)
);

CREATE TABLE IF NOT EXISTS template_instances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  template_slug TEXT NOT NULL,
  template_version INTEGER NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_template_instances_user ON template_instances(user_id);
