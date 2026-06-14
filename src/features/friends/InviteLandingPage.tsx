import { useEffect, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { FriendInviteReason } from "../../../shared/schemas";
import { useCurrentUser } from "../auth/useCurrentUser";
import { FriendAvatar } from "./FriendAvatar";
import { useInvitePreview, useRedeemInvite } from "./hooks";
import { PENDING_INVITE_KEY } from "./pendingInvite";

const REASON_TEXT: Record<FriendInviteReason, string> = {
  not_found: "This invite link isn't valid anymore.",
  revoked: "This invite link has been turned off by its owner.",
  expired: "This invite link has expired.",
  exhausted: "This invite link has already been used.",
  self: "This is your own invite link — share it with a friend instead.",
  already_friends: "You're already friends 🎉",
};

function InviteCard({ children }: { children: ReactNode }) {
  return (
    <div className="invite-landing">
      <div className="invite-landing__card ui-card ui-card--elevated">{children}</div>
    </div>
  );
}

export function InviteLandingPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const loggedIn = Boolean(user);

  const preview = useInvitePreview(code, loggedIn);
  const redeem = useRedeemInvite();

  // Once we've arrived here logged in, drop any stashed pending-invite marker.
  useEffect(() => {
    if (loggedIn) {
      try {
        sessionStorage.removeItem(PENDING_INVITE_KEY);
      } catch {
        /* sessionStorage may be unavailable */
      }
    }
  }, [loggedIn]);

  if (userLoading) {
    return (
      <InviteCard>
        <p className="invite-landing__loading">Loading…</p>
      </InviteCard>
    );
  }

  // Logged out: stash the code so we can return after sign-in, then send to auth.
  if (!loggedIn) {
    const goSignIn = () => {
      try {
        if (code) sessionStorage.setItem(PENDING_INVITE_KEY, code);
      } catch {
        /* ignore */
      }
      navigate("/");
    };
    return (
      <InviteCard>
        <h1 className="invite-landing__title">You've been invited</h1>
        <p className="invite-landing__text">Sign in or create an account to accept this friend invite.</p>
        <button type="button" className="task-add invite-landing__cta" onClick={goSignIn}>
          Sign in to accept
        </button>
      </InviteCard>
    );
  }

  if (preview.isLoading) {
    return (
      <InviteCard>
        <p className="invite-landing__loading">Loading…</p>
      </InviteCard>
    );
  }

  const data = preview.data;
  const inviter = data?.inviter ?? null;

  // Invalid invite (or already friends / self): show the reason + a way back.
  if (!data || !data.valid) {
    const reason = data?.reason ?? "not_found";
    return (
      <InviteCard>
        {inviter ? (
          <FriendAvatar name={inviter.name} avatarId={inviter.avatarId} avatarImage={inviter.avatarImage} size="lg" />
        ) : null}
        <h1 className="invite-landing__title">{reason === "already_friends" ? "Already connected" : "Invite unavailable"}</h1>
        <p className="invite-landing__text">{REASON_TEXT[reason]}</p>
        <button type="button" className="task-add invite-landing__cta" onClick={() => navigate("/friends")}>
          Go to Friends
        </button>
      </InviteCard>
    );
  }

  const handleAccept = async () => {
    try {
      await redeem.mutateAsync(code!);
      navigate("/friends");
    } catch {
      // The preview was valid a moment ago; if redeem races, refetch the preview
      // so the user sees the current reason instead of a silent failure.
      preview.refetch();
    }
  };

  return (
    <InviteCard>
      {inviter ? (
        <FriendAvatar name={inviter.name} avatarId={inviter.avatarId} avatarImage={inviter.avatarImage} size="lg" />
      ) : null}
      <h1 className="invite-landing__title">
        {inviter ? `${inviter.name} wants to be your friend` : "Friend invite"}
      </h1>
      <p className="invite-landing__text">Accept to connect and start sharing goals together.</p>
      <div className="invite-landing__actions">
        <button type="button" className="task-add invite-landing__cta" onClick={handleAccept} disabled={redeem.isPending}>
          {redeem.isPending ? "Connecting…" : "Accept"}
        </button>
        <button
          type="button"
          className="pomodoro-btn pomodoro-btn--ghost-text"
          onClick={() => navigate("/today")}
          disabled={redeem.isPending}
        >
          Not now
        </button>
      </div>
    </InviteCard>
  );
}
