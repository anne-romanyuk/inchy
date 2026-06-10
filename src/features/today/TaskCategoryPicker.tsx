import { useMemo } from "react";
import { CategoryPicker } from "../../shared/ui/CategoryPicker";
import { normalizeCategoryInfos } from "./categoryColor";
import { useTaskCategories } from "./useTasks";

// Task-domain category dropdown. Knows only task categories (from
// /api/task-categories) and renders the shared CategoryPicker. `select` mode is
// the type-in-field combobox used in the Add/Edit task form; `filter` mode is
// the click-to-open trigger used on the Plan calendar.
type TaskCategoryPickerProps = {
  mode: "select" | "filter";
  value: string;
  onChange: (value: string) => void;
  /** Extra names to surface that aren't saved yet (queued / default tasks). */
  extraCategoryNames?: string[];
  allowCreate?: boolean;
  showEmptyOption?: boolean;
  emptyLabel?: string;
  placeholder?: string;
  allLabel?: string;
  allValue?: string;
  ariaLabel?: string;
  className?: string;
};

export function TaskCategoryPicker({ extraCategoryNames, ...rest }: TaskCategoryPickerProps) {
  const categoriesQuery = useTaskCategories();
  const extraKey = (extraCategoryNames ?? []).join("\u0000");
  const categories = useMemo(
    () => normalizeCategoryInfos([...(categoriesQuery.data ?? []), ...(extraCategoryNames ?? [])]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoriesQuery.data, extraKey],
  );
  return <CategoryPicker {...rest} categories={categories} />;
}
