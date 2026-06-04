import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "./router/router";
import { queryClient, queryKeys } from "./shared/api/queryClient";
import { setUnauthorizedHandler } from "./shared/api/client";
import { persistCurrentUser } from "./features/auth/useCurrentUser";
import type { PublicUser } from "../shared/schemas";
import { FluidGradient } from "./app/FluidGradient";
import { LoadingOverlay } from "./app/LoadingOverlay";
import "../components/SoftButton.css";
import "../components/SoftLoginModal.css";
import "./styles.css";

setUnauthorizedHandler(() => {
  queryClient.setQueryData(queryKeys.currentUser, null);
});

// Keep the persisted user in sync with login, logout, avatar updates and /me so
// the next refresh can render the app immediately without a blank loading screen.
queryClient.getQueryCache().subscribe((event) => {
  if (event.query.queryKey[0] !== queryKeys.currentUser[0]) return;
  const user = queryClient.getQueryData<PublicUser | null>(queryKeys.currentUser);
  if (user === undefined) return; // query cleared/gc'd — keep the stored copy as-is
  persistCurrentUser(user);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <FluidGradient />
      <RouterProvider router={router} />
      <LoadingOverlay />
    </QueryClientProvider>
  </StrictMode>,
);
