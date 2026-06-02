-- Ensure goal task state and icon metadata are durable on databases that were
-- created before the goal-task UI shipped. This migration is intentionally
-- lightweight: the app already stores goal task completion in stages.status,
-- deadlines in stages.deadline, and selected icons in stages.icon_id.
CREATE INDEX IF NOT EXISTS idx_goals_user_active_deadline ON goals(user_id, status, deadline);
CREATE INDEX IF NOT EXISTS idx_stages_goal_position_created ON stages(goal_id, position, created_at);
