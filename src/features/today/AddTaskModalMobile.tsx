import { useMemo, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import type { CategoryInfo, DefaultTask } from "../../../shared/schemas";
import { normalizeTaskDurationValue } from "../../../shared/duration";
import { ApiError } from "../../shared/api/client";
import { DeleteActionButton } from "../../shared/ui/DeleteActionButton";
import { useCreateTask } from "./useTasks";
import { todayDateKey } from "./useOccurrences";
import { TaskCategoryPicker } from "./TaskCategoryPicker";
import { TaskDurationInput } from "./TaskDurationInput";
import { TimePickerDropdown } from "./TaskTimePicker";
import { GoalDatePicker } from "../goals/GoalDatePicker";

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return todayDateKey(date);
}

function formatTaskDate(value: string) {
  const today = todayDateKey();
  const tomorrow = addDaysToDateKey(today, 1);
  if (value === today) return "Today";
  if (value === tomorrow) return "Tomorrow";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function AddTaskModalMobile({
  onClose,
  categories,
  defaultTasks,
  editingTask,
  editingDate,
  onSaveEdit,
  onDelete,
}: {
  onClose: () => void;
  categories: CategoryInfo[];
  defaultTasks: DefaultTask[];
  editingTask?: Pick<DefaultTask, "title" | "category" | "duration" | "time">;
  editingDate?: string;
  onSaveEdit?: (updates: { title: string; category: string; duration: string; time: string; date?: string }) => Promise<unknown> | unknown;
  onDelete?: () => void;
}) {
  const createTask = useCreateTask();
  const isEditMode = Boolean(editingTask);
  const today = todayDateKey();
  const tomorrow = addDaysToDateKey(today, 1);
  const [draftTitle, setDraftTitle] = useState(editingTask?.title ?? "");
  const [draftDate, setDraftDate] = useState(editingDate ?? today);
  const [draftTime, setDraftTime] = useState(editingTask?.time ?? "");
  const [draftCategory, setDraftCategory] = useState(editingTask?.category ?? "");
  const [draftDuration, setDraftDuration] = useState(() => normalizeTaskDurationValue(editingTask?.duration));
  const [error, setError] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const extraCategoryNames = useMemo(
    () =>
      defaultTasks
        .map((task) => task.category)
        .filter((name): name is string => Boolean(name && name.trim())),
    [defaultTasks],
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title) {
      setError("Task title is required.");
      return;
    }
    setError("");

    if (isEditMode) {
      setIsSavingEdit(true);
      try {
        await onSaveEdit?.({
          title,
          category: draftCategory.trim(),
          duration: draftDuration,
          time: draftTime,
          ...(editingDate != null ? { date: draftDate } : null),
        });
        onClose();
      } catch (submitError) {
        if (submitError instanceof ApiError) {
          setError(submitError.payload?.errors?.title ?? submitError.payload?.message ?? submitError.message);
        } else {
          setError("Could not update this task.");
        }
      } finally {
        setIsSavingEdit(false);
      }
      return;
    }

    try {
      await createTask.mutateAsync({
        title,
        occurrenceDate: draftDate,
        time: draftTime,
        category: draftCategory.trim(),
        duration: draftDuration,
        saveToDefault: false,
      });
      onClose();
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.payload?.errors?.title ?? submitError.payload?.message ?? submitError.message);
      } else {
        setError("Could not reach the task server.");
      }
    }
  };

  const isBusy = isEditMode ? isSavingEdit : createTask.isPending;

  return (
    <motion.div
      className="task-modal-overlay task-modal-overlay--mobile"
      aria-label={isEditMode ? "Edit task" : "Add task"}
      role="dialog"
      aria-modal="true"
      initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: 8, filter: "blur(8px)" }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="task-modal__header">
        <h2>{isEditMode ? draftTitle.trim() || "Edit task" : "Add task"}</h2>
        <button className="task-modal__close" type="button" aria-label={isEditMode ? "Close edit task" : "Close add task"} onClick={onClose}>
          x
        </button>
      </header>

      <form className="task-modal__content task-modal__content--compact" onSubmit={submit} noValidate>
        <div className="task-modal__main">
          <div className="task-modal__draft">
            <div className={`task-modal__draft-row task-modal__draft-row--inline ${isEditMode ? "task-modal__draft-row--edit" : ""}`.trim()}>
              <div className="task-modal__draft-line task-modal__draft-line--primary">
                <input
                  className="task-modal__title-input"
                  type="text"
                  maxLength={120}
                  placeholder="Task name"
                  value={draftTitle}
                  autoFocus
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <TaskCategoryPicker
                  mode="select"
                  ariaLabel="Category"
                  placeholder="Category"
                  value={draftCategory}
                  onChange={setDraftCategory}
                  allowCreate
                  extraCategoryNames={extraCategoryNames}
                />
              </div>
              <div className="task-modal__draft-line task-modal__draft-line--secondary">
                {!isEditMode || editingDate != null ? (
                  <GoalDatePicker
                    className="task-modal__date-picker"
                    value={draftDate}
                    onChange={(value) => {
                      if (value) setDraftDate(value);
                    }}
                    allowClear={false}
                    ariaLabel="Select task date"
                    emptyDisplayValue="Today"
                    formatDisplayValue={formatTaskDate}
                    footerActionsAfterToday={[
                      {
                        label: "Tomorrow",
                        onClick: () => setDraftDate(tomorrow),
                      },
                    ]}
                  />
                ) : null}
                <TimePickerDropdown value={draftTime} onChange={setDraftTime} />
                <TaskDurationInput value={draftDuration} onChange={setDraftDuration} />
              </div>
            </div>
          </div>

          {error ? (
            <p className="task-modal__error" role="status">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="task-modal__footer">
          {isEditMode && onDelete ? (
            <DeleteActionButton onClick={() => onDelete()} disabled={isBusy}>
              Delete task
            </DeleteActionButton>
          ) : null}
          <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" onClick={onClose}>
            Cancel
          </button>
          <button className="task-add" type="submit" disabled={isBusy}>
            {isEditMode ? (
              isSavingEdit ? "Saving..." : "Save changes"
            ) : createTask.isPending ? (
              "Adding..."
            ) : (
              <>
                <span aria-hidden="true">+</span>
                Add task
              </>
            )}
          </button>
        </footer>
      </form>
    </motion.div>
  );
}
