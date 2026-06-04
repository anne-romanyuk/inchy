import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import type { DefaultTask } from "../../../shared/schemas";

const MAX_CATEGORY_LENGTH = 15;
import { useOverflowFade } from "../../shared/hooks/useOverflowFade";
import { ApiError } from "../../shared/api/client";
import { useCreateTask, useDeleteDefaultTask } from "./useTasks";
import { categoryTone } from "./categoryColor";

type QueuedTask = {
  localId: string;
  title: string;
  category: string;
  duration: string;
  saveToDefault: boolean;
  fromDefault: boolean;
};

export function AddTaskModal({
  onClose,
  categories,
  defaultTasks,
}: {
  onClose: () => void;
  categories: string[];
  defaultTasks: DefaultTask[];
}) {
  const createTask = useCreateTask();
  const deleteDefaultTask = useDeleteDefaultTask();
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCategory, setDraftCategory] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [draftDuration, setDraftDuration] = useState("");
  const [draftSaveToDefault, setDraftSaveToDefault] = useState(false);
  const [queuedTasks, setQueuedTasks] = useState<QueuedTask[]>([]);
  const [addTaskError, setAddTaskError] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const categoryRef = useRef<HTMLDivElement>(null);
  const poolScrollRef = useRef<HTMLDivElement>(null);

  const categoryOptions = useMemo(() => {
    const set = new Set(categories);
    defaultTasks.forEach((task) => task.category && set.add(task.category));
    queuedTasks.forEach((task) => task.category && set.add(task.category));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [categories, defaultTasks, queuedTasks]);

  const filteredCategoryOptions = useMemo(() => {
    const query = categorySearch.trim().toLowerCase();
    if (!query) return categoryOptions;
    return categoryOptions.filter((option) => option.toLowerCase().includes(query));
  }, [categoryOptions, categorySearch]);
  const categorySearchValue = categorySearch.trim().slice(0, MAX_CATEGORY_LENGTH);
  const canCreateCategory =
    categorySearchValue.length > 0 &&
    !categoryOptions.some((option) => option.toLowerCase() === categorySearchValue.toLowerCase());
  const selectedCategoryTone = draftCategory.trim() ? categoryTone(draftCategory.trim()) : "";
  const categoryDropdownOptions = useMemo(
    () => ["", ...filteredCategoryOptions],
    [filteredCategoryOptions],
  );

  const pendingDefaults = useMemo(
    () => queuedTasks.filter((item) => item.saveToDefault && !item.fromDefault),
    [queuedTasks],
  );

  useOverflowFade(poolScrollRef, [defaultTasks.length, pendingDefaults.length]);

  useEffect(() => {
    if (!categoryOpen) return;
    const onClickOut = (event: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(event.target as Node)) {
        setCategoryOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOut);
    return () => document.removeEventListener("mousedown", onClickOut);
  }, [categoryOpen]);

  const resetDraft = () => {
    setDraftTitle("");
    setDraftCategory("");
    setCategorySearch("");
    setDraftDuration("");
    setDraftSaveToDefault(false);
  };

  const queueDraft = () => {
    const title = draftTitle.trim();
    if (!title) {
      setAddTaskError("Task title is required.");
      return;
    }
    setAddTaskError("");
    setQueuedTasks((current) => [
      ...current,
      {
        localId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        category: draftCategory.trim(),
        duration: draftDuration.trim(),
        saveToDefault: draftSaveToDefault,
        fromDefault: false,
      },
    ]);
    resetDraft();
  };

  const queueDefaultTask = (defaultTask: DefaultTask) => {
    setAddTaskError("");
    setQueuedTasks((current) => [
      ...current,
      {
        localId: `default-${defaultTask.id}-${Date.now()}`,
        title: defaultTask.title,
        category: defaultTask.category,
        duration: defaultTask.duration,
        saveToDefault: false,
        fromDefault: true,
      },
    ]);
  };

  const removeFromQueue = (localId: string) => {
    setQueuedTasks((current) => current.filter((item) => item.localId !== localId));
  };

  const chooseDraftCategory = (value: string) => {
    const normalized = value.trim().slice(0, MAX_CATEGORY_LENGTH);
    const nextCategory =
      categoryOptions.find((option) => option.toLowerCase() === normalized.toLowerCase()) ?? normalized;
    setDraftCategory(nextCategory);
    setCategorySearch("");
    setCategoryOpen(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const items = [...queuedTasks];
    const pendingDraft = draftTitle.trim();
    if (pendingDraft) {
      items.push({
        localId: `draft-${Date.now()}`,
        title: pendingDraft,
        category: draftCategory.trim(),
        duration: draftDuration.trim(),
        saveToDefault: draftSaveToDefault,
        fromDefault: false,
      });
    }

    if (!items.length) {
      setAddTaskError("Add at least one task.");
      return;
    }

    setAddTaskError("");

    try {
      for (const item of items) {
        await createTask.mutateAsync({
          title: item.title,
          category: item.category,
          duration: item.duration,
          saveToDefault: item.saveToDefault,
        });
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setAddTaskError(error.payload?.errors?.title ?? error.payload?.message ?? error.message);
      } else {
        setAddTaskError("Could not reach the task server.");
      }
    }
  };

  return (
    <motion.div
      className="task-modal-overlay"
      aria-label="Add task"
      role="dialog"
      aria-modal="true"
      initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: 8, filter: "blur(8px)" }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="task-modal__header">
        <h2>Add task</h2>
        <button className="task-modal__close" type="button" aria-label="Close add task" onClick={onClose}>
          x
        </button>
      </header>

      <form className="task-modal__content task-modal__content--compact" onSubmit={submit} noValidate>
        <div className="task-modal__main">
          <div className="task-modal__draft">
            <div className="task-modal__draft-row task-modal__draft-row--inline">
              <input
                className="task-modal__title-input"
                type="text"
                maxLength={120}
                placeholder="New task"
                value={draftTitle}
                autoFocus
                onChange={(event) => setDraftTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    queueDraft();
                  }
                }}
              />
              <div className="task-modal__combobox" ref={categoryRef}>
                <input
                  className={
                    selectedCategoryTone && !categoryOpen
                      ? `task-modal__category-input task-modal__category-input--selected task-modal__category-input--${selectedCategoryTone}`
                      : "task-modal__category-input"
                  }
                  type="text"
                  maxLength={MAX_CATEGORY_LENGTH}
                  placeholder="Category"
                  value={categoryOpen ? categorySearch : draftCategory}
                  onFocus={() => {
                    setCategorySearch("");
                    setCategoryOpen(true);
                  }}
                  onClick={() => {
                    if (!categoryOpen) setCategorySearch("");
                    setCategoryOpen(true);
                  }}
                  onChange={(event) => {
                    setCategorySearch(event.target.value);
                    setDraftCategory(event.target.value);
                    setCategoryOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setCategoryOpen(false);
                    if (event.key === "Enter") {
                      event.preventDefault();
                      chooseDraftCategory(categorySearch || draftCategory);
                    }
                  }}
                  aria-autocomplete="list"
                  aria-expanded={categoryOpen}
                  role="combobox"
                />
                <span className="task-modal__dropdown-caret task-modal__dropdown-caret--input" aria-hidden="true" />
                <div className="task-modal__dropdown-wrap" data-open={categoryOpen ? "true" : "false"}>
                  <ul className="task-modal__combobox-list task-modal__combobox-list--pills app-scroll" role="listbox">
                    {categoryDropdownOptions.map((option) => (
                      <li key={option || "__empty__"} className="task-modal__dropdown-item">
                        <button
                          type="button"
                          role="option"
                          aria-selected={draftCategory === option}
                          className={
                            option
                              ? `task-modal__category-pill task-category task-category--${categoryTone(option)}`
                              : "task-modal__category-pill task-modal__category-pill--empty ui-badge ui-badge--muted"
                          }
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => chooseDraftCategory(option)}
                        >
                          {option || "No category"}
                        </button>
                      </li>
                    ))}
                    {canCreateCategory && (
                      <li className="task-modal__dropdown-item">
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          className={`task-modal__category-pill task-category task-category--${categoryTone(categorySearchValue)} task-modal__category-pill--create`}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => chooseDraftCategory(categorySearchValue)}
                        >
                          <span aria-hidden="true">+</span> Create "{categorySearchValue}"
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              </div>
              <input
                className="task-modal__duration-input"
                type="text"
                maxLength={32}
                placeholder="Duration"
                value={draftDuration}
                onChange={(event) => setDraftDuration(event.target.value)}
              />
              <button
                className="add-icon-btn"
                type="button"
                aria-label="Add to list"
                onClick={queueDraft}
              >
                <span aria-hidden="true">+</span>
              </button>
            </div>

            <div className="task-modal__save-default">
              <div className="checkbox-wrapper">
                <input
                  id="save-to-default"
                  type="checkbox"
                  checked={draftSaveToDefault}
                  onChange={(event) => setDraftSaveToDefault(event.target.checked)}
                />
                <label htmlFor="save-to-default">
                  <span className="tick_mark" aria-hidden="true"></span>
                </label>
              </div>
              <label htmlFor="save-to-default">Add to default task pool</label>
            </div>
          </div>

          <section className="task-modal__queue" aria-label="Tasks to add">
            {queuedTasks.length ? (
              <ul>
                {queuedTasks.map((item) => (
                  <li className="task-modal__queue-item" key={item.localId}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>
                        {[
                          item.category,
                          item.duration,
                          item.saveToDefault ? "Save to pool" : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${item.title} from list`}
                      onClick={() => removeFromQueue(item.localId)}
                    >
                      x
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="task-modal__queue-empty">No tasks queued yet. Fill in the form above or pick from the pool.</p>
            )}
          </section>

          {addTaskError ? (
            <p className="task-modal__error" role="status">
              {addTaskError}
            </p>
          ) : null}

        </div>

        <section className="default-task-pool default-task-pool--hidden" aria-label="Default task pool" aria-hidden="true">
          <h3>Default pool</h3>
          {pendingDefaults.length || defaultTasks.length ? (
            <div className="default-task-pool__scroll-wrap">
              <div className="default-task-pool__scroll fade-scroll app-scroll" ref={poolScrollRef}>
                <ul>
                  {pendingDefaults.map((item) => (
                    <li key={`pending-${item.localId}`} className="default-task-pool__pending">
                      <div>
                        <strong>{item.title}</strong>
                        <span>
                          {[item.category, item.duration, "Pending"]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${item.title} from list`}
                        onClick={() => removeFromQueue(item.localId)}
                      >
                        x
                      </button>
                    </li>
                  ))}
                  {defaultTasks.map((defaultTask) => (
                    <li key={defaultTask.id}>
                      <div>
                        <strong>{defaultTask.title}</strong>
                        <span>
                          {[defaultTask.category, defaultTask.duration]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                      <button type="button" aria-label={`Queue ${defaultTask.title}`} onClick={() => queueDefaultTask(defaultTask)}>
                        +
                      </button>
                      <button
                        type="button"
                        className="default-task-pool__delete"
                        aria-label={`Delete ${defaultTask.title} from default pool`}
                        disabled={deleteDefaultTask.isPending}
                        onClick={() => deleteDefaultTask.mutate(defaultTask.id)}
                      >
                        x
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p>No default tasks yet.</p>
          )}
        </section>

        <footer className="task-modal__footer">
          <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" onClick={onClose}>
            Cancel
          </button>
          <button className="task-add" type="submit" disabled={createTask.isPending}>
            {createTask.isPending
              ? "Adding..."
              : queuedTasks.length
              ? `Add ${queuedTasks.length} to today`
              : "Add to today"}
          </button>
        </footer>
      </form>
    </motion.div>
  );
}
