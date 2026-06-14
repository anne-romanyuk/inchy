import { randomBytes } from "node:crypto";
import { db } from "../db";
import { newId } from "../lib/ids";
import type { UserRow } from "../lib/mappers";
import { requireUser, type AuthEnv } from "../middleware/auth";
import { createApp } from "../openapi/hono";
import type { Friend, FriendInviteReason } from "../../shared/schemas";

export const friendRoutes = createApp<AuthEnv>();
friendRoutes.use("*", requireUser);

type InviteRow = {
  code: string;
  inviter_id: string;
  status: "active" | "revoked";
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  created_at: string;
};

type FriendQueryRow = {
  id: string;
  name: string;
  avatar_id: string | null;
  avatar_image: string | null;
  since: string;
};

function toFriend(row: FriendQueryRow): Friend {
  return {
    id: row.id,
    name: row.name,
    avatarId: row.avatar_id,
    avatarImage: row.avatar_image ?? null,
    since: row.since,
  };
}

function generateInviteCode(): string {
  // 8 random bytes -> 11-char URL-safe string. Unguessable, fits cleanly in a URL.
  return randomBytes(8).toString("base64url");
}

function listFriends(userId: string): Friend[] {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.avatar_id, u.avatar_image, f.created_at AS since
       FROM friendships f
       JOIN users u
         ON u.id = (CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END)
       WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?)
       ORDER BY u.name COLLATE NOCASE`,
    )
    .all(userId, userId, userId) as FriendQueryRow[];
  return rows.map(toFriend);
}

function getFriendship(a: string, b: string) {
  return db
    .prepare(
      `SELECT * FROM friendships
       WHERE status = 'accepted'
         AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`,
    )
    .get(a, b, b, a) as { id: string; created_at: string } | undefined;
}

function getActiveInvite(userId: string): InviteRow | undefined {
  return db
    .prepare("SELECT * FROM friend_invites WHERE inviter_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1")
    .get(userId) as InviteRow | undefined;
}

function createInvite(userId: string): InviteRow {
  const code = generateInviteCode();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO friend_invites (code, inviter_id, status, expires_at, max_uses, use_count, created_at)
     VALUES (?, ?, 'active', NULL, NULL, 0, ?)`,
  ).run(code, userId, now);
  return { code, inviter_id: userId, status: "active", expires_at: null, max_uses: null, use_count: 0, created_at: now };
}

function getOrCreateInvite(userId: string): InviteRow {
  return getActiveInvite(userId) ?? createInvite(userId);
}

// Returns the reason an invite is unusable by `viewerId`, or null if it can be
// redeemed. Shared by the preview and redeem handlers.
function inviteBlockReason(invite: InviteRow | undefined, viewerId: string): FriendInviteReason | null {
  if (!invite || invite.status === "revoked") return invite?.status === "revoked" ? "revoked" : "not_found";
  if (invite.expires_at && Date.parse(invite.expires_at) < Date.now()) return "expired";
  if (invite.max_uses != null && invite.use_count >= invite.max_uses) return "exhausted";
  if (invite.inviter_id === viewerId) return "self";
  if (getFriendship(invite.inviter_id, viewerId)) return "already_friends";
  return null;
}

// --- List friends -----------------------------------------------------------
friendRoutes.get("/", (c) => {
  return c.json({ friends: listFriends(c.get("userId")) }, 200);
});

// --- My invite code ---------------------------------------------------------
friendRoutes.get("/invite", (c) => {
  const invite = getOrCreateInvite(c.get("userId"));
  return c.json({ invite: { code: invite.code, createdAt: invite.created_at } }, 200);
});

friendRoutes.post("/invite/regenerate", (c) => {
  const userId = c.get("userId");
  const invite = db.transaction(() => {
    db.prepare("UPDATE friend_invites SET status = 'revoked' WHERE inviter_id = ? AND status = 'active'").run(userId);
    return createInvite(userId);
  })();
  return c.json({ invite: { code: invite.code, createdAt: invite.created_at } }, 200);
});

// --- Preview an invite (authed) ---------------------------------------------
friendRoutes.get("/invite/:code/preview", (c) => {
  const viewerId = c.get("userId");
  const code = c.req.param("code");
  const invite = db.prepare("SELECT * FROM friend_invites WHERE code = ?").get(code) as InviteRow | undefined;
  const inviter = invite
    ? (db.prepare("SELECT * FROM users WHERE id = ?").get(invite.inviter_id) as UserRow | undefined)
    : undefined;

  if (!invite || !inviter) {
    return c.json({ preview: { valid: false, reason: "not_found" as const, inviter: null } }, 200);
  }

  const inviterInfo = {
    id: inviter.id,
    name: inviter.name,
    avatarId: inviter.avatar_id,
    avatarImage: inviter.avatar_image ?? null,
  };
  const reason = inviteBlockReason(invite, viewerId);
  return c.json({ preview: { valid: reason === null, reason, inviter: inviterInfo } }, 200);
});

// --- Redeem an invite -> become friends -------------------------------------
friendRoutes.post("/invite/:code/redeem", (c) => {
  const userId = c.get("userId");
  const code = c.req.param("code");
  const invite = db.prepare("SELECT * FROM friend_invites WHERE code = ?").get(code) as InviteRow | undefined;

  const reason = inviteBlockReason(invite, userId);

  // Already friends is a benign no-op: return the existing friendship so the
  // client lands on a success screen rather than an error.
  if (reason === "already_friends" && invite) {
    const friend = db
      .prepare(
        `SELECT u.id, u.name, u.avatar_id, u.avatar_image, f.created_at AS since
         FROM friendships f
         JOIN users u ON u.id = ?
         WHERE f.status = 'accepted'
           AND ((f.requester_id = ? AND f.addressee_id = ?) OR (f.requester_id = ? AND f.addressee_id = ?))
         LIMIT 1`,
      )
      .get(invite.inviter_id, invite.inviter_id, userId, userId, invite.inviter_id) as FriendQueryRow | undefined;
    if (friend) return c.json({ friend: toFriend(friend) }, 200);
  }

  if (reason) {
    const status = reason === "not_found" ? 404 : reason === "self" ? 400 : 410;
    const messages: Record<FriendInviteReason, string> = {
      not_found: "This invite link is not valid.",
      revoked: "This invite link has been turned off.",
      expired: "This invite link has expired.",
      exhausted: "This invite link has already been used.",
      self: "You can't add yourself as a friend.",
      already_friends: "You're already friends.",
    };
    return c.json({ message: messages[reason], reason }, status);
  }

  const inviterId = invite!.inviter_id;
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(
      `INSERT OR IGNORE INTO friendships (id, requester_id, addressee_id, status, created_at, updated_at)
       VALUES (?, ?, ?, 'accepted', ?, ?)`,
    ).run(newId(), inviterId, userId, now, now);

    const redemption = db
      .prepare("INSERT OR IGNORE INTO friend_invite_redemptions (id, code, redeemer_id, created_at) VALUES (?, ?, ?, ?)")
      .run(newId(), code, userId, now);

    // Only count the first redemption by this user, and only for capped invites.
    if (redemption.changes > 0 && invite!.max_uses != null) {
      db.prepare("UPDATE friend_invites SET use_count = use_count + 1 WHERE code = ?").run(code);
    }
  })();

  const friend = db
    .prepare(
      `SELECT u.id, u.name, u.avatar_id, u.avatar_image, f.created_at AS since
       FROM friendships f
       JOIN users u ON u.id = ?
       WHERE f.status = 'accepted'
         AND ((f.requester_id = ? AND f.addressee_id = ?) OR (f.requester_id = ? AND f.addressee_id = ?))
       LIMIT 1`,
    )
    .get(inviterId, inviterId, userId, userId, inviterId) as FriendQueryRow;
  return c.json({ friend: toFriend(friend) }, 200);
});

// --- Remove a friend --------------------------------------------------------
friendRoutes.delete("/:userId", (c) => {
  const userId = c.get("userId");
  const otherId = c.req.param("userId");
  db.prepare(
    `DELETE FROM friendships
     WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
  ).run(userId, otherId, otherId, userId);
  return c.json({ ok: true as const }, 200);
});
