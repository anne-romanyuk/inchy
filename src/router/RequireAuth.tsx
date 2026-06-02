import { Navigate, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { useCurrentUser } from "../features/auth/useCurrentUser";
import { AppShell } from "../app/AppShell";
import { pageTransition } from "../app/sidebar";

export function RequireAuth() {
  const location = useLocation();
  const { data: user, isLoading } = useCurrentUser();

  // No visible loading screen — the auth check is fast and a flashing card
  // briefly revealed the app's pink background. Render nothing until resolved.
  if (isLoading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return (
    <motion.main key="home" className="home-stage" {...pageTransition}>
      <AppShell user={user} />
    </motion.main>
  );
}
