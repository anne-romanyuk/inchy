// Where we stash an invite code when a logged-out user opens /invite/:code, so
// PublicOnly can return them to it after they sign in. Kept in its own tiny
// module so PublicOnly doesn't eagerly bundle the lazy InviteLandingPage.
export const PENDING_INVITE_KEY = "planner.pendingInvite";
