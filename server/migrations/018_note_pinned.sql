ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_notes_user_pinned ON notes(user_id, pinned, updated_at);
