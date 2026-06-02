export const goalIcons = [
  { id: "lightbulb", label: "Idea / Lightbulb", src: "/goal-icons/lightbulb.png" },
  { id: "compass", label: "Compass", src: "/goal-icons/compass.png" },
  { id: "map", label: "Map / Route", src: "/goal-icons/map.png" },
  { id: "checklist", label: "Checklist", src: "/goal-icons/checklist.png" },
  { id: "documents", label: "Documents", src: "/goal-icons/documents.png" },
  { id: "folder", label: "Folder", src: "/goal-icons/folder.png" },
  { id: "search", label: "Search / Research", src: "/goal-icons/search.png" },
  { id: "book", label: "Book / Learning", src: "/goal-icons/book.png" },
  { id: "books", label: "Books / Library", src: "/goal-icons/books.png" },
  { id: "graduation", label: "Graduation / Education", src: "/goal-icons/graduation.png" },
  { id: "pencil", label: "Pencil / Edit", src: "/goal-icons/pencil.png" },
  { id: "palette", label: "Palette / Art", src: "/goal-icons/palette.png" },
  { id: "camera", label: "Camera / Video", src: "/goal-icons/camera.png" },
  { id: "calendar", label: "Calendar", src: "/goal-icons/calendar.png" },
  { id: "clock", label: "Clock / Timer", src: "/goal-icons/clock.png" },
  { id: "chat", label: "Chat / Consultation", src: "/goal-icons/chat.png" },
  { id: "handshake", label: "Handshake", src: "/goal-icons/handshake.png" },
  { id: "thumbs-up", label: "Thumbs Up / Approve", src: "/goal-icons/thumbs-up.png" },
  { id: "shield", label: "Shield / Verification", src: "/goal-icons/shield.png" },
  { id: "payment", label: "Card / Payment", src: "/goal-icons/payment.png" },
  { id: "money", label: "Money", src: "/goal-icons/money.png" },
  { id: "piggy-bank", label: "Piggy Bank / Savings", src: "/goal-icons/piggy-bank.png" },
  { id: "bank", label: "Bank / Institution", src: "/goal-icons/bank.png" },
  { id: "tools", label: "Tools / Build", src: "/goal-icons/tools.png" },
  { id: "test-tube", label: "Test Tube / Experiment", src: "/goal-icons/test-tube.png" },
  { id: "puzzle", label: "Puzzle", src: "/goal-icons/puzzle.png" },
  { id: "dice", label: "Dice / Chance", src: "/goal-icons/dice.png" },
  { id: "telescope", label: "Telescope / Vision", src: "/goal-icons/telescope.png" },
  { id: "globe", label: "Globe / World", src: "/goal-icons/globe.png" },
  { id: "health", label: "Health / Medicine", src: "/goal-icons/health.png" },
  { id: "pets", label: "Pets", src: "/goal-icons/pets.png" },
  { id: "plane", label: "Plane / Travel", src: "/goal-icons/plane.png" },
  { id: "train", label: "Train", src: "/goal-icons/train.png" },
  { id: "car", label: "Car / Trip", src: "/goal-icons/car.png" },
] as const;

export const defaultGoalIcon = { id: "flag", label: "Flag / Goal", src: "/goal-icons/flag.png" } as const;

export const forestGoalIcons = [
  { id: "flag", label: "Milestone", src: "/goal-icons/forest/flag.png" },
  { id: "checklist", label: "Checklist", src: "/goal-icons/forest/checklist.png" },
  { id: "book", label: "Learning", src: "/goal-icons/forest/book.png" },
  { id: "money", label: "Finance", src: "/goal-icons/forest/money.png" },
  { id: "calendar", label: "Calendar", src: "/goal-icons/forest/calendar.png" },
  { id: "chat", label: "Message", src: "/goal-icons/forest/chat.png" },
  { id: "documents", label: "Document", src: "/goal-icons/forest/documents.png" },
  { id: "handshake", label: "Meeting / Call", src: "/goal-icons/forest/handshake.png" },
  { id: "folder", label: "Home / Errand", src: "/goal-icons/forest/folder.png" },
  { id: "health", label: "Health / Wellbeing", src: "/goal-icons/forest/health.png" },
] as const;

export type GoalIconId = (typeof goalIcons)[number]["id"] | typeof defaultGoalIcon.id;
export type ForestGoalIconId = (typeof forestGoalIcons)[number]["id"];

const forestGoalIconIds = new Set<string>(forestGoalIcons.map((icon) => icon.id));

export function getGoalIcon(iconId?: string | null) {
  if (iconId === defaultGoalIcon.id) return defaultGoalIcon;
  return goalIcons.find((icon) => icon.id === iconId) ?? defaultGoalIcon;
}

export function getGoalIconSrc(iconId?: string | null, theme?: string) {
  if (theme === "forest") {
    const forestId = iconId && forestGoalIconIds.has(iconId) ? iconId : defaultGoalIcon.id;
    return `/goal-icons/forest/${forestId}.png`;
  }
  return getGoalIcon(iconId).src;
}

export function getForestGoalIconId(iconId?: string | null): ForestGoalIconId {
  return iconId && forestGoalIconIds.has(iconId) ? (iconId as ForestGoalIconId) : defaultGoalIcon.id;
}
