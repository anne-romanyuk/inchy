import { Navigate, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { useCurrentUser } from "../features/auth/useCurrentUser";
import { AppShell, loadingShellUser } from "../app/AppShell";
import { pageTransition } from "../app/sidebar";

export function RequireAuth() {
  const location = useLocation();
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <motion.main key="home" className="home-stage" {...pageTransition}>
        <AppShell user={user ?? loadingShellUser()} />
      </motion.main>
    );
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
