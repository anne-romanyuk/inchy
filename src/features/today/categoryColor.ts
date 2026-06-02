const CATEGORY_PALETTE = [
  "peach",
  "sky",
  "lemon",
  "teal",
  "amber",
  "indigo",
  "slate",
] as const;

export type CategoryTone = (typeof CATEGORY_PALETTE)[number];

export function categoryTone(name: string): CategoryTone {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
}
