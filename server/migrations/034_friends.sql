-- Friends graph + invite codes.
-- friendships: one row per relationship pair, direction = who initiated.
-- Two users are friends if a row with status='accepted' exists in either
-- direction. The 'pending'/'blocked' values are reserved for a future
-- request-by-username flow; the invite-code flow auto-accepts on redeem.

CREATE TABLE IF NOT EXISTS friendships (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('pending','accepted','blocked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id, status);

-- friend_invites: shareable codes. max_uses NULL = unlimited (a reusable
-- personal link); expires_at NULL = never expires. Regenerating revokes the
-- previous active code so only one is live per user at a time.
CREATE TABLE IF NOT EXISTS friend_invites (
  code TEXT PRIMARY KEY,
  inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  expires_at TEXT,
  max_uses INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_friend_invites_inviter ON friend_invites(inviter_id, status);

-- friend_invite_redemptions: audit trail + idempotency (a given user can
-- redeem a given code only once, so use_count never double-counts).
CREATE TABLE IF NOT EXISTS friend_invite_redemptions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL REFERENCES friend_invites(code) ON DELETE CASCADE,
  redeemer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (code, redeemer_id)
);
