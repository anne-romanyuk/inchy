import { Navigate } from "react-router-dom";
import { useCurrentUser } from "../features/auth/useCurrentUser";
import { AuthPage } from "../features/auth/AuthPage";
import { PENDING_INVITE_KEY } from "../features/friends/pendingInvite";

function pendingInviteTarget(): string | null {
  try {
    const code = sessionStorage.getItem(PENDING_INVITE_KEY);
    return code ? `/invite/${code}` : null;
  } catch {
    return null;
  }
}

export function PublicOnly() {
  const { data: user, isLoading } = useCurrentUser();

  if (!isLoading && user) {
    // If the user arrived from an invite link before signing in, send them back
    // to it so they can accept; otherwise land on Today.
    return <Navigate to={pendingInviteTarget() ?? "/today"} replace />;
  }

  return <AuthPage />;
}
