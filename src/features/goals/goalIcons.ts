export const forestGoalIcons = [
  { id: "flag", label: "Milestone", src: "/goal-icons/forest/flag.png" },
  { id: "sprout", label: "Inchy", src: "/goal-icons/forest/sprout.png" },
  { id: "checklist", label: "Checklist", src: "/goal-icons/forest/checklist.png" },
  { id: "tasks", label: "To-dos", src: "/goal-icons/forest/tasks.png" },
  { id: "note", label: "Note", src: "/goal-icons/forest/note.png" },
  { id: "writing", label: "Writing", src: "/goal-icons/forest/writing.png" },
  { id: "documents", label: "Documents", src: "/goal-icons/forest/documents.png" },
  { id: "folder", label: "Files", src: "/goal-icons/forest/folder.png" },
  { id: "book", label: "Learning", src: "/goal-icons/forest/book.png" },
  { id: "search", label: "Research", src: "/goal-icons/forest/search.png" },
  { id: "mail", label: "Mail", src: "/goal-icons/forest/mail.png" },
  { id: "camera", label: "Camera", src: "/goal-icons/forest/camera.png" },
  { id: "photo", label: "Photo / Video", src: "/goal-icons/forest/photo.png" },
  { id: "phone", label: "Call", src: "/goal-icons/forest/phone.png" },
  { id: "music", label: "Music", src: "/goal-icons/forest/music.png" },
  { id: "money", label: "Finance", src: "/goal-icons/forest/money.png" },
  { id: "shopping", label: "Shopping", src: "/goal-icons/forest/shopping.png" },
  { id: "health", label: "Health", src: "/goal-icons/forest/health.png" },
  { id: "fitness", label: "Fitness", src: "/goal-icons/forest/fitness.png" },
  { id: "measure", label: "Measure", src: "/goal-icons/forest/measure.png" },
  { id: "tools", label: "Fix / Tools", src: "/goal-icons/forest/tools.png" },
  { id: "tickets", label: "Tickets", src: "/goal-icons/forest/tickets.png" },
  { id: "travel", label: "Travel", src: "/goal-icons/forest/travel.png" },
  { id: "car", label: "Trip", src: "/goal-icons/forest/car.png" },
] as const;

// The app ships the Forest theme only, so the forest mascot set is the single
// source of truth. "flag" (Milestone) doubles as the default / fallback icon.
export const defaultGoalIcon = forestGoalIcons[0];

export type ForestGoalIconId = (typeof forestGoalIcons)[number]["id"];
export type GoalIconId = ForestGoalIconId;

const forestGoalIconIds = new Set<string>(forestGoalIcons.map((icon) => icon.id));

export function getGoalIcon(iconId?: string | null) {
  return forestGoalIcons.find((icon) => icon.id === iconId) ?? defaultGoalIcon;
}

export function getForestGoalIconId(iconId?: string | null): ForestGoalIconId {
  return iconId && forestGoalIconIds.has(iconId) ? (iconId as ForestGoalIconId) : defaultGoalIcon.id;
}

export function getGoalIconSrc(iconId?: string | null, _theme?: string) {
  return `/goal-icons/forest/${getForestGoalIconId(iconId)}.png`;
}
