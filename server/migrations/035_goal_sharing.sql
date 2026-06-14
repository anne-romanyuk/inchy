-- Goal sharing — "pool" mode: a goal can be shared with friends who all see it
-- and can edit tasks/subtasks/notes by default. Sharing is ADDITIVE: the owner stays
-- goals.user_id (existing single-owner code paths are untouched); shared
-- participants live in goal_members. "Can access goal" = owner OR accepted member.

-- share_mode: 'personal' (default, owner-only) or 'pool' (shared content admins).
ALTER TABLE goals ADD COLUMN share_mode TEXT NOT NULL DEFAULT 'personal';

-- Attribution: who ticked a task / subtask done, and when. NULL when not done.
ALTER TABLE goal_tasks ADD COLUMN completed_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE goal_tasks ADD COLUMN completed_at TEXT;
ALTER TABLE goal_subtasks ADD COLUMN completed_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE goal_subtasks ADD COLUMN completed_at TEXT;

-- Membership / share requests. status='pending' is an unanswered invite that
-- shows up in the invitee's Goals as a request; 'accepted' = active member;
-- 'declined' = dismissed (kept so the same invite isn't re-sent blindly).
CREATE TABLE IF NOT EXISTS goal_members (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (goal_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_goal_members_user ON goal_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_goal_members_goal ON goal_members(goal_id, status);
