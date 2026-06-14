import type { Friend, FriendInvite, FriendInvitePreview } from "../../../shared/schemas";
import { apiFetch } from "../../shared/api/client";

export function fetchFriends() {
  return apiFetch<{ friends: Friend[] }>("/api/friends");
}

export function fetchMyInvite() {
  return apiFetch<{ invite: FriendInvite }>("/api/friends/invite");
}

export function regenerateInvite() {
  return apiFetch<{ invite: FriendInvite }>("/api/friends/invite/regenerate", { method: "POST" });
}

export function previewInvite(code: string) {
  return apiFetch<{ preview: FriendInvitePreview }>(`/api/friends/invite/${encodeURIComponent(code)}/preview`);
}

export function redeemInvite(code: string) {
  return apiFetch<{ friend: Friend }>(`/api/friends/invite/${encodeURIComponent(code)}/redeem`, { method: "POST" });
}

export function removeFriend(userId: string) {
  return apiFetch<{ ok: true }>(`/api/friends/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

// The shareable link is composed on the client so it always points at the app
// origin (in dev the API runs on a different port than the client).
export function inviteUrl(code: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/invite/${code}`;
}
