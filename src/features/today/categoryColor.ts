import type { CSSProperties } from "react";
import type { CategoryInfo } from "../../../shared/schemas";
import { fallbackCategoryColor, isCategoryColor, type CategoryColor } from "../../../shared/categoryPalette";

type CategoryStyle = CSSProperties & {
  "--category-color"?: CategoryColor;
};

export type CategoryLike = CategoryInfo | string | null | undefined;

export function normalizeCategoryInfos(categories: readonly CategoryLike[] | null | undefined): CategoryInfo[] {
  const seen = new Set<string>();
  const normalized: CategoryInfo[] = [];

  (categories ?? []).forEach((item) => {
    const name = typeof item === "string" ? item.trim() : typeof item?.name === "string" ? item.name.trim() : "";
    if (!name) return;

    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const rawColor = typeof item === "object" && item !== null ? item.color : undefined;
    normalized.push({
      name,
      color: isCategoryColor(rawColor) ? rawColor : fallbackCategoryColor(name),
    });
  });

  return normalized.sort((a, b) => a.name.localeCompare(b.name));
}

export function categoryColorForName(name: string, categories: readonly CategoryLike[] = []): CategoryColor {
  const normalized = name.trim().toLowerCase();
  const match = normalizeCategoryInfos(categories).find((category) => category.name.toLowerCase() === normalized);
  return match?.color ?? fallbackCategoryColor(name);
}

export function categoryStyle(color: string | undefined): CategoryStyle | undefined {
  return isCategoryColor(color) ? { "--category-color": color } : undefined;
}

export function categoryStyleForName(name: string, categories: readonly CategoryLike[] = []): CategoryStyle | undefined {
  return name.trim() ? categoryStyle(categoryColorForName(name, categories)) : undefined;
}
