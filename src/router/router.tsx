import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { PublicOnly } from "./PublicOnly";
import { RequireAuth } from "./RequireAuth";
import { PlaceholderPage } from "../features/placeholder/PlaceholderPage";
import { useIsMobile } from "../shared/hooks/useIsMobile";

const CHUNK_RELOAD_KEY = "planner.chunk-reload-attempted";

function isChunkLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk \d+ failed/i.test(
    message,
  );
}

function lazyRoute<TModule>(importer: () => Promise<TModule>, pick: (module: TModule) => ComponentType) {
  return lazy(async () => {
    try {
      const module = await importer();
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      return { default: pick(module) };
    } catch (error) {
      if (typeof window !== "undefined" && isChunkLoadError(error)) {
        const alreadyRetried = sessionStorage.getItem(CHUNK_RELOAD_KEY) === "true";

        if (!alreadyRetried) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, "true");
          window.location.reload();

          return new Promise<never>(() => {});
        }
      }

      throw error;
    }
  });
}

const TodayPage = lazyRoute(() => import("../features/today/TodayPage"), ({ TodayPage }) => TodayPage);
const TodayMobile = lazyRoute(() => import("../features/today/TodayMobile"), ({ TodayMobile }) => TodayMobile);
const TodayAlertsMobile = lazyRoute(() => import("../features/today/TodayAlertsMobile"), ({ TodayAlertsMobile }) => TodayAlertsMobile);

// Same route, two layouts. Picked by breakpoint so the mobile screen is fully
// testable in a desktop browser's responsive mode (and later forced on in the
// Capacitor build). Other routes still render their desktop pages inside the
// mobile shell for now — they get their own mobile variants incrementally.
function TodayRoute() {
  return useIsMobile() ? <TodayMobile /> : <TodayPage />;
}

function TodayAlertsRoute() {
  return useIsMobile() ? <TodayAlertsMobile /> : <Navigate to="/today" replace />;
}
const FocusPage = lazyRoute(() => import("../features/focus/FocusPage"), ({ FocusPage }) => FocusPage);
const GoalsPage = lazyRoute(() => import("../features/goals/GoalsPage"), ({ GoalsPage }) => GoalsPage);
const GoalDetailPage = lazyRoute(
  () => import("../features/goals/GoalsPage"),
  ({ GoalDetailPage }) => GoalDetailPage,
);
const GoalDetailMobile = lazyRoute(
  () => import("../features/goals/GoalDetailMobile"),
  ({ GoalDetailMobile }) => GoalDetailMobile,
);

function GoalDetailRoute() {
  return useIsMobile() ? <GoalDetailMobile /> : <GoalDetailPage />;
}
const NotesPage = lazyRoute(() => import("../features/notes/NotesPage"), ({ NotesPage }) => NotesPage);
const PlanPage = lazyRoute(() => import("../features/plan/PlanPage"), ({ PlanPage }) => PlanPage);
const SettingsPage = lazyRoute(() => import("../features/settings/SettingsPage"), ({ SettingsPage }) => SettingsPage);

function PageChunk({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  { path: "/", element: <PublicOnly /> },
  {
    path: "/",
    element: <RequireAuth />,
    children: [
      { path: "home", element: <Navigate to="/today" replace /> },
      { path: "today", element: <PageChunk><TodayRoute /></PageChunk> },
      { path: "today/alerts", element: <PageChunk><TodayAlertsRoute /></PageChunk> },
      { path: "focus", element: <PageChunk><FocusPage /></PageChunk> },
      { path: "goals", element: <PageChunk><GoalsPage /></PageChunk> },
      { path: "goals/:goalId", element: <PageChunk><GoalDetailRoute /></PageChunk> },
      { path: "plan", element: <PageChunk><PlanPage /></PageChunk> },
      { path: "progress", element: <PlaceholderPage label="Progress" /> },
      { path: "notes", element: <PageChunk><NotesPage /></PageChunk> },
      { path: "templates", element: <PlaceholderPage label="Templates" /> },
      { path: "settings", element: <PageChunk><SettingsPage /></PageChunk> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
