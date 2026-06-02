ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

UPDATE tasks
SET position = ordered.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
  FROM tasks
) AS ordered
WHERE tasks.id = ordered.id;

CREATE INDEX IF NOT EXISTS idx_tasks_user_position ON tasks(user_id, position);
