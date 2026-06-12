ALTER TABLE recurring_tasks ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'standalone' CHECK (source_kind IN ('standalone','goal_task','goal_subtask'));
ALTER TABLE recurring_tasks ADD COLUMN goal_id TEXT REFERENCES goals(id) ON DELETE CASCADE;
ALTER TABLE recurring_tasks ADD COLUMN goal_task_id TEXT REFERENCES goal_tasks(id) ON DELETE CASCADE;
ALTER TABLE recurring_tasks ADD COLUMN goal_subtask_id TEXT REFERENCES goal_subtasks(id) ON DELETE CASCADE;
