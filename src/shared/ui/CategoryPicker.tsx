import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { CategoryInfo } from "../../../shared/schemas";
import { MAX_CATEGORY_LENGTH } from "../../../shared/constants";
import { fallbackCategoryColor, isCategoryColor, type CategoryColor } from "../../../shared/categoryPalette";

// One category dropdown for the whole app. Two render modes, identical chrome:
// - "select": a type-in-field combobox with optional create.
// - "filter": a click-to-open trigger with an "All" option.
// The dropdown popover + option pills are the SAME in both modes — they reuse
// the shared `.category-picker` / `.task-category` styles, so every category
// picker (tasks and notes) looks the same. Domain-specific wrappers
// (TaskCategoryPicker / NoteCategoryPicker) feed it the right categories.

type CategoryStyle = CSSProperties & { "--category-color"?: CategoryColor };

function colorStyle(color: CategoryColor | undefined): CategoryStyle | undefined {
  return color ? { "--category-color": color } : undefined;
}

export type CategoryPickerProps = {
  mode: "select" | "filter";
  value: string;
  onChange: (value: string) => void;
  /** Domain categories (name + colour), already normalised + sorted. */
  categories: CategoryInfo[];
  // select-only
  allowCreate?: boolean;
  showEmptyOption?: boolean;
  emptyLabel?: string;
  // filter-only
  allLabel?: string;
  allValue?: string;
  uncategorized?: { value: string; label: string };
  // shared
  placeholder?: string;
  maxLength?: number;
  ariaLabel?: string;
  className?: string;
};

export function CategoryPicker({
  mode,
  value,
  onChange,
  categories,
  allowCreate = false,
  showEmptyOption = true,
  emptyLabel = "No category",
  allLabel = "All categories",
  allValue = "",
  uncategorized,
  placeholder,
  maxLength = MAX_CATEGORY_LENGTH,
  ariaLabel,
  className,
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const colorOf = (name: string): CategoryColor | undefined => {
    const trimmed = name.trim();
    if (!trimmed) return undefined;
    const found = categories.find((category) => category.name.toLowerCase() === trimmed.toLowerCase());
    if (found && isCategoryColor(found.color)) return found.color;
    return fallbackCategoryColor(trimmed);
  };

  if (mode === "filter") {
    const isUncategorized = !!uncategorized && value === uncategorized.value;
    const isCategory = value !== allValue && !isUncategorized && value.trim() !== "";
    const triggerLabel = isCategory ? value : isUncategorized ? uncategorized!.label : allLabel;

    const options: Array<{ value: string; label: string; color?: CategoryColor; neutral?: boolean }> = [
      { value: allValue, label: allLabel, neutral: true },
      ...(uncategorized ? [{ value: uncategorized.value, label: uncategorized.label, neutral: true }] : []),
      ...categories.map((category) => ({ value: category.name, label: category.name, color: category.color })),
    ];

    return (
      <div className={`category-picker ${className ?? ""}`.trim()} ref={rootRef}>
        <button
          type="button"
          className={`category-picker__trigger ${isCategory ? "category-picker__trigger--selected" : ""}`.trim()}
          style={isCategory ? colorStyle(colorOf(value)) : undefined}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span
            className={
              isCategory
                ? "task-category category-picker__selected-label"
                : "category-picker__neutral-label"
            }
            style={isCategory ? colorStyle(colorOf(value)) : undefined}
          >
            {triggerLabel}
          </span>
          <span className="task-modal__dropdown-caret" aria-hidden="true" />
        </button>
        <div className="task-modal__dropdown-wrap category-picker__dropdown" data-open={open ? "true" : "false"}>
          <ul
            className="task-modal__combobox-list task-modal__combobox-list--pills category-picker__list app-scroll"
            role="listbox"
            aria-label={ariaLabel}
          >
            {options.map((option) => (
              <li key={option.value || "__all__"} className="task-modal__dropdown-item">
                <button
                  type="button"
                  role="option"
                  aria-selected={value === option.value}
                  className={
                    option.neutral
                      ? "task-modal__category-pill category-picker__option category-picker__option--empty task-modal__category-pill--empty"
                      : "task-modal__category-pill category-picker__option task-category"
                  }
                  style={option.neutral ? undefined : colorStyle(option.color)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // select mode — type-in-field combobox
  const query = search.trim().toLowerCase();
  const filtered = query
    ? categories.filter((category) => category.name.toLowerCase().includes(query))
    : categories;
  const draft = search.trim().slice(0, maxLength);
  const canCreate =
    allowCreate &&
    draft.length > 0 &&
    !categories.some((category) => category.name.toLowerCase() === draft.toLowerCase());

  const choose = (name: string) => {
    const normalized = name.trim().slice(0, maxLength);
    const match = categories.find((category) => category.name.toLowerCase() === normalized.toLowerCase());
    onChange(match ? match.name : normalized);
    setSearch("");
    setOpen(false);
  };

  const selected = value.trim().length > 0;
  const showSelectedLabel = selected && !open;

  return (
    <div
      className={`task-modal__combobox category-picker category-picker--select ${
        selected ? "category-picker--has-value" : ""
      } ${className ?? ""}`.trim()}
      style={selected ? colorStyle(colorOf(value)) : undefined}
      ref={rootRef}
    >
      <input
        className={
          selected
            ? "task-modal__category-input category-picker__input category-picker__input--selected task-modal__category-input--selected"
            : "task-modal__category-input category-picker__input"
        }
        type="text"
        maxLength={maxLength}
        placeholder={showSelectedLabel ? "" : placeholder ?? "Category"}
        value={showSelectedLabel ? "" : open && search ? search : value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-label={ariaLabel}
        onFocus={() => {
          setSearch("");
          setOpen(true);
        }}
        onClick={() => {
          if (!open) setSearch("");
          setOpen(true);
        }}
        onChange={(event) => {
          setSearch(event.target.value);
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter") {
            event.preventDefault();
            choose(search || value);
          }
        }}
      />
      {showSelectedLabel ? (
        <span className="task-category category-picker__selected-label category-picker__input-label" style={colorStyle(colorOf(value))}>
          {value}
        </span>
      ) : null}
      <span className="task-modal__dropdown-caret task-modal__dropdown-caret--input" aria-hidden="true" />
      <div className="task-modal__dropdown-wrap category-picker__dropdown" data-open={open ? "true" : "false"}>
        <ul
          className="task-modal__combobox-list task-modal__combobox-list--pills category-picker__list app-scroll"
          role="listbox"
          aria-label={ariaLabel}
        >
          {(showEmptyOption ? [""] : []).concat(filtered.map((category) => category.name)).map((name) => (
            <li key={name || "__empty__"} className="task-modal__dropdown-item">
              <button
                type="button"
                role="option"
                aria-selected={value === name}
                className={
                  name
                    ? "task-modal__category-pill category-picker__option task-category"
                    : "task-modal__category-pill category-picker__option category-picker__option--empty task-modal__category-pill--empty"
                }
                style={name ? colorStyle(colorOf(name)) : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(name)}
              >
                {name || emptyLabel}
              </button>
            </li>
          ))}
          {canCreate && (
            <li className="task-modal__dropdown-item">
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="task-modal__category-pill category-picker__option category-picker__option--create task-category task-modal__category-pill--create"
                style={colorStyle(colorOf(draft))}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(draft)}
              >
                <span aria-hidden="true">+</span> Create "{draft}"
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
