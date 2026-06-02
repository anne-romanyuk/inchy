import { Navigate } from "react-router-dom";
import { useCurrentUser } from "../features/auth/useCurrentUser";
import { AuthPage } from "../features/auth/AuthPage";

export function PublicOnly() {
  const { data: user, isLoading } = useCurrentUser();

  if (!isLoading && user) {
    return <Navigate to="/today" replace />;
  }

  return <AuthPage />;
}
