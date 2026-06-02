import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { PublicOnly } from "./PublicOnly";
import { RequireAuth } from "./RequireAuth";
import { PlaceholderPage } from "../features/placeholder/PlaceholderPage";

const TodayPage = lazy(() =>
  import("../features/today/TodayPage").then(({ TodayPage }) => ({ default: TodayPage })),
);
const FocusPage = lazy(() =>
  import("../features/focus/FocusPage").then(({ FocusPage }) => ({ default: FocusPage })),
);
const GoalsPage = lazy(() =>
  import("../features/goals/GoalsPage").then(({ GoalsPage }) => ({ default: GoalsPage })),
);
const GoalDetailPage = lazy(() =>
  import("../features/goals/GoalsPage").then(({ GoalDetailPage }) => ({ default: GoalDetailPage })),
);
const NotesPage = lazy(() =>
  import("../features/notes/NotesPage").then(({ NotesPage }) => ({ default: NotesPage })),
);
const PlanPage = lazy(() =>
  import("../features/plan/PlanPage").then(({ PlanPage }) => ({ default: PlanPage })),
);

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
      { path: "today", element: <PageChunk><TodayPage /></PageChunk> },
      { path: "focus", element: <PageChunk><FocusPage /></PageChunk> },
      { path: "goals", element: <PageChunk><GoalsPage /></PageChunk> },
      { path: "goals/:goalId", element: <PageChunk><GoalDetailPage /></PageChunk> },
      { path: "plan", element: <PageChunk><PlanPage /></PageChunk> },
      { path: "progress", element: <PlaceholderPage label="Progress" /> },
      { path: "notes", element: <PageChunk><NotesPage /></PageChunk> },
      { path: "templates", element: <PlaceholderPage label="Templates" /> },
      { path: "settings", element: <PlaceholderPage label="Settings" /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
