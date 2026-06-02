import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "./router/router";
import { queryClient, queryKeys } from "./shared/api/queryClient";
import { setUnauthorizedHandler } from "./shared/api/client";
import { FluidGradient } from "./app/FluidGradient";
import "../components/SoftButton.css";
import "../components/SoftLoginModal.css";
import "./styles.css";

setUnauthorizedHandler(() => {
  queryClient.setQueryData(queryKeys.currentUser, null);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <FluidGradient />
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
