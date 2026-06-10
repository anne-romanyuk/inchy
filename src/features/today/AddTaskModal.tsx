import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import type { CategoryInfo, DefaultTask } from "../../../shared/schemas";
import { normalizeTaskDurationValue } from "../../../shared/duration";
import { formatTaskTimeDisplay, taskTimeFrom12Hour, taskTimeTo12Hour } from "../../../shared/time";
import { useOverflowFade } from "../../shared/hooks/useOverflowFade";
import { useIsMobile } from "../../shared/hooks/useIsMobile";
import { ApiError } from "../../shared/api/client";
import { DeleteActionButton } from "../../shared/ui/DeleteActionButton";
import { useCreateTask, useDeleteDefaultTask } from "./useTasks";
import { todayDateKey } from "./useOccurrences";
import { TaskCategoryPicker } from "./TaskCategoryPicker";
import { TaskDurationInput } from "./TaskDurationInput";
import { GoalDatePicker } from "../goals/GoalDatePicker";

const TIME_HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const TIME_MINUTES = Array.from({ length: 60 }, (_, index) => index);
const TIME_PERIODS = ["AM", "PM"] as const;

type QueuedTask = {
  localId: string;
  title: string;
  occurrenceDate: string;
  time: string;
  category: string;
  duration: string;
  saveToDefault: boolean;
  fromDefault: boolean;
};

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

function initialTimeParts(value: string) {
  const parsed = taskTimeTo12Hour(value);
  if (parsed) return parsed;
  const now = new Date();
  const period = now.getHours() >= 12 ? "PM" : "AM";
  return {
    hour: now.getHours() % 12 || 12,
    minute: now.getMinutes(),
    period,
  } as const;
}

function timeInputMask(value: string, fallbackPeriod: "AM" | "PM") {
  const upper = value.toUpperCase();
  const explicitPeriod = upper.includes("P") ? "PM" : upper.includes("A") ? "AM" : "";
  const digits = upper.replace(/\D/g, "").slice(0, 4);
  if (!digits) return explicitPeriod;

  const hour = digits.length <= 2 ? digits : digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2);
  const minute = digits.length <= 2 ? "" : digits.length === 3 ? digits.slice(1) : digits.slice(2);
  const numericHour = Number(hour);
  const period = explicitPeriod || (minute.length === 2 && numericHour >= 1 && numericHour <= 12 ? fallbackPeriod : "");
  return `${hour}${minute ? `:${minute}` : ""}${period ? ` ${period}` : ""}`;
}

function parseTimeInput(value: string, fallbackPeriod: "AM" | "PM") {
  const upper = value.trim().toUpperCase();
  if (!upper) return null;

  const periodMatch = upper.match(/\b([AP])\.?M?\.?\b|([AP])$/);
  const period = periodMatch ? (periodMatch[1] || periodMatch[2]) === "P" ? "PM" : "AM" : "";
  const digits = upper.replace(/\D/g, "");
  if (digits.length < 3) return null;

  const hourText = digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2);
  const minuteText = digits.length === 3 ? digits.slice(1, 3) : digits.slice(2, 4);
  const rawHour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(rawHour) || !Number.isFinite(minute) || minute < 0 || minute > 59) return null;

  if (period) {
    if (rawHour < 1 || rawHour > 12) return null;
    return { hour: rawHour, minute, period } as const;
  }

  if (rawHour >= 0 && rawHour <= 23) {
    const inferredPeriod = rawHour >= 12 ? "PM" : "AM";
    return { hour: rawHour % 12 || 12, minute, period: inferredPeriod } as const;
  }

  if (rawHour >= 1 && rawHour <= 12) {
    return { hour: rawHour, minute, period: fallbackPeriod } as const;
  }

  return null;
}

function getWheelStep(column: HTMLDivElement) {
  const first = column.querySelector("button");
  const second = first?.nextElementSibling as HTMLElement | null;
  if (!first) return 1;
  return second ? second.offsetTop - first.offsetTop : first.offsetHeight;
}

function TimeWheel<TValue extends string | number>({
  ariaLabel,
  className = "",
  format,
  onChange,
  value,
  values,
}: {
  ariaLabel: string;
  className?: string;
  format: (value: TValue) => string;
  onChange: (value: TValue) => void;
  value: TValue;
  values: readonly TValue[];
}) {
  const columnRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const userScrollValueRef = useRef<TValue | null>(null);

  const scrollToIndex = (index: number, behavior: ScrollBehavior = "auto") => {
    const column = columnRef.current;
    if (!column) return;
    column.scrollTo({ top: index * getWheelStep(column), behavior });
  };

  useEffect(() => {
    if (userScrollValueRef.current === value) {
      userScrollValueRef.current = null;
      return;
    }
    const index = values.findIndex((option) => option === value);
    if (index >= 0) {
      requestAnimationFrame(() => scrollToIndex(index));
    }
  }, [value, values]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    };
  }, []);

  const handleScroll = () => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const column = columnRef.current;
      if (!column) return;
      const step = getWheelStep(column);
      const index = Math.max(0, Math.min(values.length - 1, Math.round(column.scrollTop / step)));
      const nextValue = values[index];
      if (nextValue !== value) {
        userScrollValueRef.current = nextValue;
        onChange(nextValue);
      }
    });
  };

  return (
    <div className={`task-modal__time-column-frame ${className}`.trim()}>
      <div ref={columnRef} className={`task-modal__time-column ${className}`.trim()} aria-label={ariaLabel} onScroll={handleScroll}>
        {values.map((option, index) => (
          <button
            key={String(option)}
            type="button"
            className={option === value ? "is-selected" : ""}
            onClick={() => {
              onChange(option);
              scrollToIndex(index);
            }}
          >
            {format(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TimePickerDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftHour, setDraftHour] = useState(() => initialTimeParts(value).hour);
  const [draftMinute, setDraftMinute] = useState(() => initialTimeParts(value).minute);
  const [draftPeriod, setDraftPeriod] = useState<"AM" | "PM">(() => initialTimeParts(value).period);
  const [timeText, setTimeText] = useState(() => formatTaskTimeDisplay(value));
  const pickerRef = useRef<HTMLDivElement>(null);
  const displayValue = formatTaskTimeDisplay(value);

  useEffect(() => {
    setTimeText(displayValue);
  }, [displayValue]);

  const updateDraftTime = useCallback((hour: number, minute: number, period: "AM" | "PM") => {
    setDraftHour(hour);
    setDraftMinute(minute);
    setDraftPeriod(period);
    setTimeText(formatTaskTimeDisplay(taskTimeFrom12Hour(hour, minute, period)));
  }, []);

  const commitTextValue = useCallback(() => {
    const trimmed = timeText.trim();
    if (!trimmed) {
      onChange("");
      return true;
    }
    const parsed = parseTimeInput(trimmed, draftPeriod);
    if (!parsed) {
      setTimeText(displayValue);
      return false;
    }
    setDraftHour(parsed.hour);
    setDraftMinute(parsed.minute);
    setDraftPeriod(parsed.period);
    onChange(taskTimeFrom12Hour(parsed.hour, parsed.minute, parsed.period));
    return true;
  }, [displayValue, draftPeriod, onChange, timeText]);

  useEffect(() => {
    if (!isOpen) return;
    const next = initialTimeParts(value);
    setDraftHour(next.hour);
    setDraftMinute(next.minute);
    setDraftPeriod(next.period);
  }, [isOpen, value]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        commitTextValue();
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [commitTextValue, isOpen]);

  const save = () => {
    if (timeText.trim()) {
      const committed = commitTextValue();
      if (committed) setIsOpen(false);
      return;
    }
    onChange(taskTimeFrom12Hour(draftHour, draftMinute, draftPeriod));
    setIsOpen(false);
  };

  return (
    <div className="task-modal__time-picker" ref={pickerRef}>
      <input
        className={`task-modal__time-trigger ${displayValue ? "" : "is-empty"}`.trim()}
        type="text"
        inputMode="numeric"
        placeholder="Time"
        value={timeText}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Task time"
        onFocus={() => setIsOpen(true)}
        onClick={() => setIsOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            if (!pickerRef.current?.contains(document.activeElement)) {
              commitTextValue();
              setIsOpen(false);
            }
          }, 0);
        }}
        onChange={(event) => {
          const nextText = timeInputMask(event.target.value, draftPeriod);
          setTimeText(nextText);
          const parsed = parseTimeInput(nextText, draftPeriod);
          if (parsed) {
            setDraftHour(parsed.hour);
            setDraftMinute(parsed.minute);
            setDraftPeriod(parsed.period);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (commitTextValue()) setIsOpen(false);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setTimeText(displayValue);
            setIsOpen(false);
          }
        }}
      />
      <span className="task-modal__dropdown-caret task-modal__time-caret" aria-hidden="true" />
      {isOpen ? (
        <div className="task-modal__time-popover" role="dialog" aria-label="Select time">
          <h3>Select time</h3>
          <div className="task-modal__time-wheels">
            <TimeWheel
              ariaLabel="Hour"
              format={(hour) => String(hour).padStart(2, "0")}
              onChange={(hour) => updateDraftTime(hour, draftMinute, draftPeriod)}
              value={draftHour}
              values={TIME_HOURS}
            />
            <div className="task-modal__time-separator" aria-hidden="true">:</div>
            <TimeWheel
              ariaLabel="Minute"
              format={(minute) => String(minute).padStart(2, "0")}
              onChange={(minute) => updateDraftTime(draftHour, minute, draftPeriod)}
              value={draftMinute}
              values={TIME_MINUTES}
            />
            <TimeWheel
              ariaLabel="Period"
              className="task-modal__time-column--period"
              format={(period) => period}
              onChange={(period) => updateDraftTime(draftHour, draftMinute, period)}
              value={draftPeriod}
              values={TIME_PERIODS}
            />
          </div>
          <div className="task-modal__time-actions">
            {displayValue ? (
              <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" onClick={() => {
                onChange("");
                setTimeText("");
                setIsOpen(false);
              }}>
                Clear
              </button>
            ) : null}
            <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" onClick={() => setIsOpen(false)}>
              Cancel
            </button>
            <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text task-modal__time-save" onClick={save}>
              Save
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AddTaskModal({
  onClose,
  categories,
  defaultTasks,
  editingTask,
  editingDate,
  onSaveEdit,
  onDelete,
  context = "default",
  variant = "panel",
}: {
  onClose: () => void;
  categories: CategoryInfo[];
  defaultTasks: DefaultTask[];
  editingTask?: Pick<DefaultTask, "title" | "category" | "duration" | "time">;
  // When provided (edit mode), the date field is shown and its value is passed
  // back via onSaveEdit so the caller can move the task to another day.
  editingDate?: string;
  onSaveEdit?: (updates: { title: string; category: string; duration: string; time: string; date?: string }) => Promise<unknown> | unknown;
  onDelete?: () => void;
  context?: "default" | "plan";
  variant?: "panel" | "dialog";
}) {
  const createTask = useCreateTask();
  const deleteDefaultTask = useDeleteDefaultTask();
  const isMobile = useIsMobile();
  const isEditMode = Boolean(editingTask);
  const today = todayDateKey();
  const tomorrow = addDaysToDateKey(today, 1);
  const [draftTitle, setDraftTitle] = useState(editingTask?.title ?? "");
  const [draftDate, setDraftDate] = useState(editingDate ?? today);
  const [draftTime, setDraftTime] = useState(editingTask?.time ?? "");
  const [draftCategory, setDraftCategory] = useState(editingTask?.category ?? "");
  const [draftDuration, setDraftDuration] = useState(() => normalizeTaskDurationValue(editingTask?.duration));
  const [draftSaveToDefault, setDraftSaveToDefault] = useState(false);
  const [queuedTasks, setQueuedTasks] = useState<QueuedTask[]>([]);
  const [addTaskError, setAddTaskError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const poolScrollRef = useRef<HTMLDivElement>(null);
  // Names typed into queued/default tasks that aren't saved categories yet, so
  // the picker can still surface them while composing.
  const extraCategoryNames = useMemo(
    () =>
      [...defaultTasks, ...queuedTasks]
        .map((task) => task.category)
        .filter((name): name is string => Boolean(name && name.trim())),
    [defaultTasks, queuedTasks],
  );

  const pendingDefaults = useMemo(
    () => queuedTasks.filter((item) => item.saveToDefault && !item.fromDefault),
    [queuedTasks],
  );
  const queuedTodayTasks = useMemo(
    () => queuedTasks.filter((item) => item.occurrenceDate === today),
    [queuedTasks, today],
  );
  const queuedOtherDateTasks = useMemo(
    () => queuedTasks.filter((item) => item.occurrenceDate !== today),
    [queuedTasks, today],
  );
  const submitTaskCount = queuedTasks.length + (draftTitle.trim() ? 1 : 0);
  const submitTaskLabel =
    submitTaskCount > 0
      ? `Add ${submitTaskCount} ${submitTaskCount === 1 ? "task" : "tasks"}`
      : "Add task";

  useOverflowFade(poolScrollRef, [defaultTasks.length, pendingDefaults.length]);

  useEffect(() => {
    if (!editingTask) return;
    setDraftTitle(editingTask.title);
    setDraftDate(editingDate ?? today);
    setDraftTime(editingTask.time);
    setDraftCategory(editingTask.category);
    setDraftDuration(normalizeTaskDurationValue(editingTask.duration));
    setDraftSaveToDefault(false);
    setQueuedTasks([]);
    setAddTaskError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingTask, editingDate]);

  const resetDraft = () => {
    setDraftTitle("");
    setDraftDate(todayDateKey());
    setDraftTime("");
    setDraftCategory("");
    setDraftDuration("");
    setDraftSaveToDefault(false);
  };

  const queueDraft = () => {
    if (isEditMode) return;
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
        occurrenceDate: draftDate,
        time: draftTime,
        category: draftCategory.trim(),
        duration: draftDuration,
        saveToDefault: draftSaveToDefault,
        fromDefault: false,
      },
    ]);
    resetDraft();
  };

  const queueDefaultTask = (defaultTask: DefaultTask) => {
    if (isEditMode) return;
    setAddTaskError("");
    setQueuedTasks((current) => [
      ...current,
      {
        localId: `default-${defaultTask.id}-${Date.now()}`,
        title: defaultTask.title,
        occurrenceDate: draftDate,
        time: defaultTask.time,
        category: defaultTask.category,
        duration: normalizeTaskDurationValue(defaultTask.duration),
        saveToDefault: false,
        fromDefault: true,
      },
    ]);
  };

  const removeFromQueue = (localId: string) => {
    setQueuedTasks((current) => current.filter((item) => item.localId !== localId));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isEditMode) {
      const title = draftTitle.trim();
      if (!title) {
        setAddTaskError("Task title is required.");
        return;
      }
      setAddTaskError("");
      setEditSaving(true);
      try {
        await onSaveEdit?.({
          title,
          category: draftCategory.trim(),
          duration: draftDuration,
          time: draftTime,
          ...(editingDate != null ? { date: draftDate } : null),
        });
        onClose();
      } catch (error) {
        if (error instanceof ApiError) {
          setAddTaskError(error.payload?.errors?.title ?? error.payload?.message ?? error.message);
        } else {
          setAddTaskError("Could not update this task.");
        }
      } finally {
        setEditSaving(false);
      }
      return;
    }

    const items = [...queuedTasks];
    const pendingDraft = draftTitle.trim();
    if (pendingDraft) {
      items.push({
        localId: `draft-${Date.now()}`,
        title: pendingDraft,
        occurrenceDate: draftDate,
        time: draftTime,
        category: draftCategory.trim(),
        duration: draftDuration,
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
          occurrenceDate: item.occurrenceDate,
          time: item.time,
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

  const modal = (
    <motion.div
      className={`task-modal-overlay ${variant === "dialog" ? "task-modal-overlay--dialog" : ""} ${
        context === "plan" ? "task-modal-overlay--plan" : ""
      }`.trim()}
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
                      if (isEditMode || isMobile) event.currentTarget.form?.requestSubmit();
                      else queueDraft();
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
                {!isEditMode ? (
                  <button
                    className="add-icon-btn"
                    type="button"
                    aria-label="Add to list"
                    onClick={queueDraft}
                  >
                    <span aria-hidden="true">+</span>
                  </button>
                ) : null}
              </div>
            </div>

            {!isEditMode ? (
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
            ) : null}
          </div>

          {!isEditMode ? (
            <section className="task-modal__queue" aria-label="Tasks to add">
            {queuedTasks.length ? (
              <div className="task-modal__queue-groups">
                {queuedTodayTasks.length ? (
                  <div className="task-modal__queue-group">
                    <div className="task-modal__queue-heading">
                      <span>Today</span>
                      <small>{queuedTodayTasks.length}</small>
                    </div>
                    <ul>
                      {queuedTodayTasks.map((item) => (
                        <li className="task-modal__queue-item" key={item.localId}>
                          <div>
                            <strong>{item.title}</strong>
                            <span>
                              {[
                                item.category,
                                item.time ? formatTaskTimeDisplay(item.time) : "",
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
                  </div>
                ) : null}
                {queuedOtherDateTasks.length ? (
                  <div className="task-modal__queue-group">
                    <div className="task-modal__queue-heading">
                      <span>Other dates</span>
                      <small>{queuedOtherDateTasks.length}</small>
                    </div>
                    <ul>
                      {queuedOtherDateTasks.map((item) => (
                        <li className="task-modal__queue-item" key={item.localId}>
                          <div>
                            <strong>{item.title}</strong>
                            <span>
                              {[
                                formatTaskDate(item.occurrenceDate),
                                item.time ? formatTaskTimeDisplay(item.time) : "",
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
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="task-modal__queue-empty">No tasks queued yet.</p>
            )}
            </section>
          ) : null}

          {addTaskError ? (
            <p className="task-modal__error" role="status">
              {addTaskError}
            </p>
          ) : null}

        </div>

        {!isEditMode ? (
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
                          {[
                            item.category,
                            item.occurrenceDate !== today ? formatTaskDate(item.occurrenceDate) : "",
                            item.time ? formatTaskTimeDisplay(item.time) : "",
                            item.duration,
                            "Pending",
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
                  {defaultTasks.map((defaultTask) => (
                    <li key={defaultTask.id}>
                      <div>
                        <strong>{defaultTask.title}</strong>
                        <span>
                          {[defaultTask.category, defaultTask.time ? formatTaskTimeDisplay(defaultTask.time) : "", defaultTask.duration]
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
        ) : null}

        <footer className="task-modal__footer">
          {isEditMode && onDelete ? (
            <DeleteActionButton onClick={() => onDelete()} disabled={editSaving}>
              Delete task
            </DeleteActionButton>
          ) : null}
          <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" onClick={onClose}>
            Cancel
          </button>
          <button className="task-add" type="submit" disabled={isEditMode ? editSaving : createTask.isPending}>
            {isMobile && !isEditMode && !createTask.isPending ? (
              <>
                <span aria-hidden="true">+</span>
                {submitTaskLabel}
              </>
            ) : isEditMode
              ? editSaving
                ? "Saving..."
                : "Save changes"
              : createTask.isPending
                ? "Adding..."
                : submitTaskLabel}
          </button>
        </footer>
      </form>
    </motion.div>
  );

  if (variant === "dialog") {
    return (
      <motion.div
        className={`task-modal-backdrop ${context === "plan" ? "task-modal-backdrop--plan" : ""}`.trim()}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {modal}
      </motion.div>
    );
  }

  return modal;
}
