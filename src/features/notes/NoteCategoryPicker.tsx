import { useMemo } from "react";
import { CategoryPicker } from "../../shared/ui/CategoryPicker";
import type { CategoryInfo, Note } from "../../../shared/schemas";
import { fallbackCategoryColor, isCategoryColor, type CategoryColor } from "../../../shared/categoryPalette";

// Note-domain category dropdown. Derives its categories (and their colours)
// from the notes themselves and renders the shared CategoryPicker, so it looks
// identical to the task picker but only ever offers note categories. `select`
// mode is the type-in-field combobox in the note editor; `filter` mode is the
// click-to-open trigger in the notes toolbar (with an optional "No category").
type NoteCategoryPickerProps = {
  mode: "select" | "filter";
  value: string;
  onChange: (value: string) => void;
  notes: Note[];
  allowCreate?: boolean;
  showEmptyOption?: boolean;
  emptyLabel?: string;
  placeholder?: string;
  allLabel?: string;
  allValue?: string;
  uncategorized?: { value: string; label: string };
  ariaLabel?: string;
  className?: string;
};

export function NoteCategoryPicker({ notes, ...rest }: NoteCategoryPickerProps) {
  const categories = useMemo<CategoryInfo[]>(() => {
    const colorByName = new Map<string, CategoryColor>();
    const names = new Set<string>();
    for (const note of notes) {
      const name = (note.category ?? "").trim();
      if (!name) continue;
      names.add(name);
      if (note.categoryColor && isCategoryColor(note.categoryColor) && !colorByName.has(name.toLowerCase())) {
        colorByName.set(name.toLowerCase(), note.categoryColor);
      }
    }
    return [...names]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, color: colorByName.get(name.toLowerCase()) ?? fallbackCategoryColor(name) }));
  }, [notes]);

  return <CategoryPicker {...rest} categories={categories} />;
}
