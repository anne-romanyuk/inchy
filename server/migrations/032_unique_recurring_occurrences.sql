CREATE UNIQUE INDEX IF NOT EXISTS idx_task_occurrences_recurring_date
  ON task_occurrences(user_id, recurring_task_id, occurrence_date)
  WHERE recurring_task_id IS NOT NULL;
