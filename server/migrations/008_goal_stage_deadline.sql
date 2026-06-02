ALTER TABLE stages ADD COLUMN deadline TEXT;

CREATE INDEX IF NOT EXISTS idx_stages_deadline ON stages(goal_id, deadline);
