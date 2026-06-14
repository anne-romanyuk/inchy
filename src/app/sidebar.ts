export type SidebarItemId =
  | "today"
  | "goals"
  | "plan"
  | "focus"
  | "progress"
  | "notes"
  | "friends"
  | "templates"
  | "settings";

export const sidebarItems: Array<{ id: SidebarItemId; label: string; path: string; disabled?: boolean }> = [
  { id: "today", label: "Today", path: "/today" },
  { id: "goals", label: "Goals", path: "/goals" },
  { id: "plan", label: "Plan", path: "/plan" },
  { id: "focus", label: "Focus", path: "/focus" },
  { id: "progress", label: "Progress", path: "/progress", disabled: true },
  { id: "notes", label: "Notes", path: "/notes" },
  { id: "friends", label: "Friends", path: "/friends" },
  { id: "templates", label: "Templates", path: "/templates", disabled: true },
  { id: "settings", label: "Settings", path: "/settings" },
];

// NOTE: intentionally NO `filter` here. Motion keeps animated values as
// resting inline styles and re-applies them on every re-render, so animating
// `filter` to `blur(0px)` left a permanent `filter: blur(0px)` on the page
// stage. A no-op filter still establishes a stacking context / backdrop-root,
// which made the dashboard's frosted panels clip their `backdrop-filter` to a
// rectangle and leak a rectangular "pad" behind their rounded corners on every
// theme. The blur-in flourish is instead done with a one-shot CSS keyframe
// (`stage-blur-in`) that leaves no resting filter — see styles.css.
export const pageTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
} as const;
