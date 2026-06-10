export const CATEGORY_PALETTE = [
  { name: "Sage Green", color: "#8AA178" },
  { name: "Olive Moss", color: "#A6A56F" },
  { name: "Dusty Mint", color: "#9DBEAD" },
  { name: "Sea Pine", color: "#6F8F86" },
  { name: "Muted Teal", color: "#6F9FA3" },
  { name: "Dusty Blue", color: "#8EA7B8" },
  { name: "Periwinkle Grey", color: "#A1A6C8" },
  { name: "Lavender Dust", color: "#B19BC2" },
  { name: "Mauve Rose", color: "#C096A4" },
  { name: "Clay Pink", color: "#C98F86" },
  { name: "Terracotta", color: "#C17F64" },
  { name: "Soft Apricot", color: "#D5A66F" },
  { name: "Muted Mustard", color: "#C5B05F" },
  { name: "Cocoa Beige", color: "#B4977A" },
  { name: "Storm Slate", color: "#7C889A" },
] as const;

export const CATEGORY_COLORS = CATEGORY_PALETTE.map((item) => item.color);
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export type CategoryInfo = {
  name: string;
  color: CategoryColor;
};

export function isCategoryColor(value: string | null | undefined): value is CategoryColor {
  return CATEGORY_COLORS.includes(value as CategoryColor);
}

export function fallbackCategoryColor(name: string): CategoryColor {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
}

export function pickUnusedCategoryColor(usedColors: Iterable<string>): CategoryColor {
  const used = new Set(Array.from(usedColors).filter(isCategoryColor));
  const available = CATEGORY_COLORS.filter((color) => !used.has(color));
  const source = available.length > 0 ? available : CATEGORY_COLORS;
  return source[Math.floor(Math.random() * source.length)];
}
