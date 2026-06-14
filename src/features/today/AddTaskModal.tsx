import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import type {
  CategoryInfo,
  DefaultTask,
  RecurrenceDeleteScope,
  RecurrenceUpdateScope,
  RepeatFrequency,
} from "../../../shared/schemas";
import { normalizeTaskDurationValue } from "../../../shared/duration";
import { formatTaskTimeDisplay } from "../../../shared/time";
import { useOverflowFade } from "../../shared/hooks/useOverflowFade";
import { ApiError } from "../../shared/api/client";
import { DeleteActionButton } from "../../shared/ui/DeleteActionButton";
import { useCreateTask, useDeleteDefaultTask } from "./useTasks";
import { todayDateKey } from "./useOccurrences";
import { TaskCategoryPicker } from "./TaskCategoryPicker";
import { TaskDurationInput } from "./TaskDurationInput";
import { TimePickerDropdown } from "./TaskTimePicker";
import { GoalDatePicker } from "../goals/GoalDatePicker";

export { TimePickerDropdown } from "./TaskTimePicker";

type QueuedTask = {
  localId: string;
  title: string;
  occurrenceDate: string;
  time: string;
  category: string;
  duration: string;
  repeatFrequency: RepeatFrequency | null;
  repeatInterval: number;
  repeatWeekdays: number[];
  repeatMonthDays: number[];
  repeatMonthOverflow: "last-day" | "skip";
  repeatYearMonths: number[];
  repeatEndDate: string;
  saveToDefault: boolean;
  fromDefault: boolean;
};

type EditableTask = Pick<DefaultTask, "title" | "category" | "duration" | "time"> & {
  recurringTaskId?: string | null;
  repeatFrequency?: RepeatFrequency | null;
  repeatInterval?: number;
  repeatWeekdays?: number[];
  repeatMonthDays?: number[];
  repeatMonthOverflow?: "last-day" | "skip";
  repeatYearMonths?: number[];
  repeatEndDate?: string | null;
};

type EditTaskUpdates = {
  title: string;
  category: string;
  duration: string;
  time: string;
  date?: string;
  repeatFrequency?: RepeatFrequency | null;
  repeatInterval?: number;
  repeatWeekdays?: number[];
  repeatMonthDays?: number[];
  repeatMonthOverflow?: "last-day" | "skip";
  repeatYearMonths?: number[];
  repeatEndDate?: string | null;
  recurrenceUpdateScope?: RecurrenceUpdateScope;
};

export type AddTaskModalCreateInput = {
  title: string;
  occurrenceDate: string;
  category: string;
  duration: string;
  time: string;
  saveToDefault: boolean;
  repeatFrequency: RepeatFrequency | null;
  repeatInterval: number;
  repeatWeekdays: number[];
  repeatMonthDays: number[];
  repeatMonthOverflow: "last-day" | "skip";
  repeatYearMonths: number[];
  repeatEndDate: string | null;
};

type InitialTaskDraft = Partial<AddTaskModalCreateInput>;

const REPEAT_OPTIONS: Array<{ value: RepeatFrequency; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const REPEAT_INTERVAL_UNITS: Record<RepeatFrequency, { singular: string; plural: string }> = {
  daily: { singular: "day", plural: "days" },
  weekly: { singular: "week", plural: "weeks" },
  monthly: { singular: "month", plural: "months" },
  yearly: { singular: "year", plural: "years" },
};

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Mon" },
  { value: 1, label: "Tue" },
  { value: 2, label: "Wed" },
  { value: 3, label: "Thu" },
  { value: 4, label: "Fri" },
  { value: 5, label: "Sat" },
  { value: 6, label: "Sun" },
] as const;

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1);
const YEAR_MONTH_OPTIONS = MONTH_NAMES.map((name, index) => ({
  value: index,
  label: name.slice(0, 3),
}));

const MONTH_OVERFLOW_OPTIONS: Array<{ value: "last-day" | "skip"; title: string; description: string }> = [
  {
    value: "last-day",
    title: "Use the last day available",
    description: "Schedule on the last day of the month (e.g. Feb 28 or 29).",
  },
  {
    value: "skip",
    title: "Skip this month",
    description: "Don't schedule this task in shorter months.",
  },
];

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

function normalizeRepeatInterval(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(999, Math.max(1, Math.trunc(parsed)));
}

function sanitizeRepeatIntervalInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 3);
  if (!digits) return "";
  return String(normalizeRepeatInterval(digits));
}

function formatRepeatUnit(frequency: RepeatFrequency, interval: number) {
  const unit = REPEAT_INTERVAL_UNITS[frequency];
  return interval === 1 ? unit.singular : unit.plural;
}

function dateKeyToPlannerWeekday(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return 0;
  return (date.getUTCDay() + 6) % 7;
}

function dateKeyToMonthDay(dateKey: string) {
  const day = Number(dateKey.split("-")[2]);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1;
}

function dateKeyToMonthIndex(dateKey: string) {
  const month = Number(dateKey.split("-")[1]);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month - 1 : 0;
}

function normalizeRepeatWeekdays(values: number[]) {
  const unique = new Set(values.filter((value) => Number.isInteger(value) && value >= 0 && value <= 6));
  return [...unique].sort((a, b) => a - b);
}

function normalizeRepeatMonthDays(values: number[]) {
  const unique = new Set(values.filter((value) => Number.isInteger(value) && value >= 1 && value <= 31));
  return [...unique].sort((a, b) => a - b);
}

function normalizeRepeatYearMonths(values: number[]) {
  const unique = new Set(values.filter((value) => Number.isInteger(value) && value >= 0 && value <= 11));
  return [...unique].sort((a, b) => a - b);
}

function hasCustomRepeatValues({
  frequency,
  interval,
  weekdays,
  monthDays,
  yearMonths,
}: {
  frequency?: RepeatFrequency | null;
  interval?: number;
  weekdays?: number[];
  monthDays?: number[];
  yearMonths?: number[];
}) {
  return Boolean(
    frequency &&
      (Math.max(1, Math.trunc(interval ?? 1)) > 1 ||
        weekdays?.length ||
        monthDays?.length ||
        yearMonths?.length),
  );
}

function formatWeekdayList(values: number[]) {
  const weekdays = normalizeRepeatWeekdays(values);
  if (!weekdays.length) return "";
  return weekdays
    .map((value) => WEEKDAY_OPTIONS.find((option) => option.value === value)?.label)
    .filter(Boolean)
    .join(", ");
}

function formatWeekdayNameList(values: number[]) {
  return normalizeRepeatWeekdays(values)
    .map((value) => WEEKDAY_NAMES[value])
    .filter(Boolean)
    .join(", ");
}

function formatMonthDayList(values: number[]) {
  return normalizeRepeatMonthDays(values).join(", ");
}

function formatYearMonthList(values: number[]) {
  return normalizeRepeatYearMonths(values)
    .map((value) => YEAR_MONTH_OPTIONS.find((option) => option.value === value)?.label)
    .filter(Boolean)
    .join(", ");
}

function formatRepeatCadence(interval: number, singular: string, plural: string) {
  return interval === 1 ? `every ${singular}` : `every ${interval} ${plural}`;
}

function formatListWithAnd(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function formatYearlyDateList(date: string, yearMonths: number[] = []) {
  const selectedMonths = normalizeRepeatYearMonths(yearMonths);
  const months = selectedMonths.length ? selectedMonths : [dateKeyToMonthIndex(date)];
  const day = dateKeyToMonthDay(date);
  return formatListWithAnd(months.map((month) => `${MONTH_NAMES[month] ?? MONTH_NAMES[0]} ${day}`));
}

function buildRepeatSummary({
  date,
  frequency,
  interval,
  monthDays,
  time,
  weekdays,
  yearMonths,
}: {
  date: string;
  frequency: RepeatFrequency;
  interval: number;
  monthDays: number[];
  time: string;
  weekdays: number[];
  yearMonths: number[];
}) {
  const timeLabel = time ? ` at ${formatTaskTimeDisplay(time)}` : "";
  if (frequency === "daily") {
    return `This task will repeat ${formatRepeatCadence(interval, "day", "days")}${timeLabel}.`;
  }
  if (frequency === "weekly") {
    const selectedWeekdays = weekdays.length ? weekdays : [dateKeyToPlannerWeekday(date)];
    return `This task will repeat ${formatRepeatCadence(interval, "week", "weeks")} on ${formatWeekdayNameList(selectedWeekdays)}${timeLabel}.`;
  }
  if (frequency === "monthly") {
    const selectedMonthDays = monthDays.length ? monthDays : [dateKeyToMonthDay(date)];
    return `This task will repeat ${formatRepeatCadence(interval, "month", "months")} on day ${formatMonthDayList(selectedMonthDays)}${timeLabel}.`;
  }
  return `This task will repeat ${formatRepeatCadence(interval, "year", "years")} on ${formatYearlyDateList(date, yearMonths)}${timeLabel}.`;
}

function getOverflowMonthDays(values: number[]) {
  return normalizeRepeatMonthDays(values).filter((day) => day >= 29);
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 10.8v5.4" />
      <path d="M12 7.4h.01" />
    </svg>
  );
}

function LastDayOptionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="5.7" y="6.1" width="12.6" height="12.1" rx="2.1" />
      <path d="M8.7 4.6v3" />
      <path d="M15.3 4.6v3" />
      <path d="M5.7 9.4h12.6" />
      <path d="M9.1 13h5.8" />
      <path d="M9.1 15.6h3.8" />
    </svg>
  );
}

function SkipMonthOptionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="5.7" y="6.1" width="12.6" height="12.1" rx="2.1" />
      <path d="M8.7 4.6v3" />
      <path d="M15.3 4.6v3" />
      <path d="M5.7 9.4h12.6" />
      <circle cx="16.2" cy="16.2" r="2.8" />
      <path d="M15.3 15.3l1.8 1.8" />
      <path d="M17.1 15.3l-1.8 1.8" />
    </svg>
  );
}

function formatRepeatLabel(
  frequency: RepeatFrequency | null,
  endDate: string,
  interval = 1,
  weekdays: number[] = [],
  monthDays: number[] = [],
  yearMonths: number[] = [],
) {
  if (!frequency) return "";
  const option = REPEAT_OPTIONS.find((item) => item.value === frequency);
  const endLabel = endDate ? `through ${formatTaskDate(endDate)}` : "forever";
  const weekdayLabel = frequency === "weekly" && weekdays.length ? ` on ${formatWeekdayList(weekdays)}` : "";
  const monthDayLabel = frequency === "monthly" && monthDays.length ? ` on ${formatMonthDayList(monthDays)}` : "";
  const yearMonthLabel = frequency === "yearly" && yearMonths.length ? ` in ${formatYearMonthList(yearMonths)}` : "";
  if (interval > 1) {
    return `Every ${interval} ${formatRepeatUnit(frequency, interval)}${weekdayLabel}${monthDayLabel}${yearMonthLabel}, ${endLabel}`;
  }
  if (weekdayLabel) return `${option?.label ?? frequency} repeat${weekdayLabel}, ${endLabel}`;
  if (monthDayLabel) return `${option?.label ?? frequency} repeat${monthDayLabel}, ${endLabel}`;
  if (yearMonthLabel) return `${option?.label ?? frequency} repeat${yearMonthLabel}, ${endLabel}`;
  return `${option?.label ?? frequency} repeat, ${endLabel}`;
}

function RepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M17.5 3.8L20.2 6.5L17.5 9.2" />
      <path d="M4 11V9.5C4 7.8 5.3 6.5 7 6.5H20" />
      <path d="M6.5 20.2L3.8 17.5L6.5 14.8" />
      <path d="M20 13V14.5C20 16.2 18.7 17.5 17 17.5H4" />
    </svg>
  );
}

function ClockFieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.8V12l3 2.1" />
    </svg>
  );
}

function DurationFieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 4h10" />
      <path d="M7 20h10" />
      <path d="M8 4c0 4 4 5 4 8s-4 4-4 8" />
      <path d="M16 4c0 4-4 5-4 8s4 4 4 8" />
      <path d="M9.4 8.2h5.2" />
      <path d="M9.4 15.8h5.2" />
    </svg>
  );
}

function RepeatFrequencyDropdown({
  value,
  onChange,
}: {
  value: RepeatFrequency;
  onChange: (value: RepeatFrequency) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const selected = REPEAT_OPTIONS.find((item) => item.value === value) ?? REPEAT_OPTIONS[1];

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: Event) => {
      if (!dropdownRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  return (
    <div className="task-modal__select task-modal__repeat-select" ref={dropdownRef}>
      <button
        type="button"
        className="task-modal__dropdown-trigger"
        aria-label="Repeat frequency"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{selected.label}</span>
        <span className="task-modal__dropdown-caret" aria-hidden="true"></span>
      </button>
      <div className="task-modal__dropdown-wrap" data-open={isOpen}>
        <ul className="task-modal__combobox-list" role="listbox" aria-label="Repeat frequency options">
          {REPEAT_OPTIONS.map((option) => (
            <li className="task-modal__dropdown-item" key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
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

function RepeatDisableConfirm({
  disabled,
  message = "This task will stay on this date. Future repetitions from this series will be removed.",
  onCancel,
  onConfirm,
}: {
  disabled: boolean;
  message?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="pomodoro-confirm-overlay task-modal__recurrence-confirm" role="dialog" aria-modal="true" aria-label="Confirm repeat removal">
      <div className="pomodoro-confirm__card task-modal__recurrence-confirm-card">
        <div className="pomodoro-confirm__icon task-modal__recurrence-confirm-icon" aria-hidden="true">
          <RepeatIcon />
        </div>
        <div className="pomodoro-confirm__content">
          <h3>Remove future repeats?</h3>
          <p>{message}</p>
        </div>
        <div className="task-modal__recurrence-confirm-actions">
          <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" onClick={onCancel} disabled={disabled}>
            Cancel
          </button>
          <button type="button" className="task-add" onClick={onConfirm} disabled={disabled}>
            Remove future repeats
          </button>
        </div>
      </div>
    </div>
  );
}

function RepeatDeleteConfirm({
  onCancel,
  onPick,
}: {
  onCancel: () => void;
  onPick: (scope: RecurrenceDeleteScope) => void;
}) {
  return (
    <div className="pomodoro-confirm-overlay task-modal__recurrence-confirm" role="dialog" aria-modal="true" aria-label="Delete recurring task">
      <div className="pomodoro-confirm__card task-modal__recurrence-confirm-card task-modal__recurrence-confirm-card--wide task-modal__recurrence-confirm-card--delete">
        <div className="pomodoro-confirm__icon task-modal__recurrence-confirm-icon" aria-hidden="true">
          <RepeatIcon />
        </div>
        <div className="pomodoro-confirm__content">
          <h3>Delete recurring task?</h3>
          <p>Choose how much of this repeating series should be removed.</p>
        </div>
        <div className="task-modal__recurrence-choice-list">
          <button type="button" onClick={() => onPick("single")}>
            <strong>Only this occurrence</strong>
            <span>Keep the rest of the series.</span>
          </button>
          <button type="button" onClick={() => onPick("future")}>
            <strong>This and future occurrences</strong>
            <span>Keep earlier occurrences in the calendar.</span>
          </button>
          <button type="button" onClick={() => onPick("series")}>
            <strong>Entire series</strong>
            <span>Remove every task in this recurring series.</span>
          </button>
        </div>
        <div className="task-modal__recurrence-confirm-actions">
          <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function AddTaskModal({
  onClose,
  categories,
  defaultTasks,
  initialTask,
  lockedFields,
  modalTitle,
  submitLabel,
  pendingLabel,
  scheduleNotice,
  confirmDisableRepeatOnCreate,
  disableRepeatConfirmMessage,
  onCreateTask,
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
  initialTask?: InitialTaskDraft;
  lockedFields?: {
    title?: boolean;
    category?: boolean;
  };
  modalTitle?: string;
  submitLabel?: string;
  pendingLabel?: string;
  scheduleNotice?: ReactNode;
  confirmDisableRepeatOnCreate?: boolean;
  disableRepeatConfirmMessage?: string;
  onCreateTask?: (input: AddTaskModalCreateInput) => Promise<unknown> | unknown;
  editingTask?: EditableTask;
  // When provided (edit mode), the date field is shown and its value is passed
  // back via onSaveEdit so the caller can move the task to another day.
  editingDate?: string;
  onSaveEdit?: (updates: EditTaskUpdates) => Promise<unknown> | unknown;
  onDelete?: (scope?: RecurrenceDeleteScope) => void;
  context?: "default" | "plan";
  variant?: "panel" | "dialog";
}) {
  const createTask = useCreateTask();
  const deleteDefaultTask = useDeleteDefaultTask();
  const isEditMode = Boolean(editingTask);
  const today = todayDateKey();
  const tomorrow = addDaysToDateKey(today, 1);
  const getInitialTitle = () => editingTask?.title ?? initialTask?.title ?? "";
  const getInitialDate = () => editingDate ?? initialTask?.occurrenceDate ?? today;
  const getInitialTime = () => editingTask?.time ?? initialTask?.time ?? "";
  const getInitialCategory = () => editingTask?.category ?? initialTask?.category ?? "";
  const getInitialDuration = () => normalizeTaskDurationValue(editingTask?.duration ?? initialTask?.duration);
  const sourceRepeatFrequency = editingTask?.repeatFrequency ?? initialTask?.repeatFrequency ?? null;
  const sourceRepeatInterval = editingTask?.repeatInterval ?? initialTask?.repeatInterval ?? 1;
  const sourceRepeatWeekdays = editingTask?.repeatWeekdays ?? initialTask?.repeatWeekdays;
  const sourceRepeatMonthDays = editingTask?.repeatMonthDays ?? initialTask?.repeatMonthDays;
  const sourceRepeatYearMonths = editingTask?.repeatYearMonths ?? initialTask?.repeatYearMonths;
  const sourceHasCustomRepeat = hasCustomRepeatValues({
    frequency: sourceRepeatFrequency,
    interval: sourceRepeatInterval,
    weekdays: sourceRepeatWeekdays,
    monthDays: sourceRepeatMonthDays,
    yearMonths: sourceRepeatYearMonths,
  });
  const [draftTitle, setDraftTitle] = useState(getInitialTitle);
  const [draftDate, setDraftDate] = useState(getInitialDate);
  const [draftTime, setDraftTime] = useState(getInitialTime);
  const [draftCategory, setDraftCategory] = useState(getInitialCategory);
  const [draftDuration, setDraftDuration] = useState(getInitialDuration);
  const initialRepeatFrequency = sourceRepeatFrequency ?? "weekly";
  const initialRepeatInterval = Math.max(1, Math.trunc(sourceRepeatInterval));
  const [draftRepeatEnabled, setDraftRepeatEnabled] = useState(Boolean(sourceRepeatFrequency));
  const [draftRepeatFrequency, setDraftRepeatFrequency] = useState<RepeatFrequency>(initialRepeatFrequency);
  const [draftRepeatEndDate, setDraftRepeatEndDate] = useState(editingTask?.repeatEndDate ?? initialTask?.repeatEndDate ?? "");
  const [draftRepeatCustom, setDraftRepeatCustom] = useState(sourceHasCustomRepeat);
  const [draftRepeatInterval, setDraftRepeatInterval] = useState(String(initialRepeatInterval));
  const [draftRepeatWeekdays, setDraftRepeatWeekdays] = useState<number[]>(() =>
    sourceRepeatWeekdays?.length ? normalizeRepeatWeekdays(sourceRepeatWeekdays) : [dateKeyToPlannerWeekday(getInitialDate())],
  );
  const [draftRepeatMonthDays, setDraftRepeatMonthDays] = useState<number[]>(() =>
    sourceRepeatMonthDays?.length ? normalizeRepeatMonthDays(sourceRepeatMonthDays) : [dateKeyToMonthDay(getInitialDate())],
  );
  const [draftRepeatMonthOverflow, setDraftRepeatMonthOverflow] = useState<"last-day" | "skip">(editingTask?.repeatMonthOverflow ?? initialTask?.repeatMonthOverflow ?? "skip");
  const [draftRepeatYearMonths, setDraftRepeatYearMonths] = useState<number[]>(() =>
    sourceRepeatYearMonths?.length ? normalizeRepeatYearMonths(sourceRepeatYearMonths) : [dateKeyToMonthIndex(getInitialDate())],
  );
  const [draftSaveToDefault, setDraftSaveToDefault] = useState(false);
  const [queuedTasks, setQueuedTasks] = useState<QueuedTask[]>([]);
  const [addTaskError, setAddTaskError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [confirmDisableRepeat, setConfirmDisableRepeat] = useState(false);
  const [confirmDeleteRepeat, setConfirmDeleteRepeat] = useState(false);
  const poolScrollRef = useRef<HTMLDivElement>(null);
  const repeatCustomId = useId();
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
    submitLabel ??
    (context === "plan"
      ? "Add task"
      : submitTaskCount > 0
      ? `Add ${submitTaskCount} ${submitTaskCount === 1 ? "task" : "tasks"}`
      : "Add task");
  const showRepeatControls = context === "plan";
  const createPending = createTask.isPending || createSaving;
  const isEditingRecurring = Boolean(editingTask?.recurringTaskId || editingTask?.repeatFrequency);
  const repeatIntervalNumber = normalizeRepeatInterval(draftRepeatInterval);
  const repeatIntervalUnit = formatRepeatUnit(draftRepeatFrequency, repeatIntervalNumber);
  const showRepeatWeekdays = draftRepeatEnabled && draftRepeatCustom && draftRepeatFrequency === "weekly";
  const showRepeatMonthDays = draftRepeatEnabled && draftRepeatCustom && draftRepeatFrequency === "monthly";
  const showRepeatYearMonths = draftRepeatEnabled && draftRepeatCustom && draftRepeatFrequency === "yearly";
  const activeRepeatWeekdays = showRepeatWeekdays ? normalizeRepeatWeekdays(draftRepeatWeekdays) : [];
  const activeRepeatMonthDays = showRepeatMonthDays ? normalizeRepeatMonthDays(draftRepeatMonthDays) : [];
  const activeRepeatYearMonths = showRepeatYearMonths ? normalizeRepeatYearMonths(draftRepeatYearMonths) : [];
  const overflowRepeatMonthDays = getOverflowMonthDays(activeRepeatMonthDays);
  const activeRepeatInterval = draftRepeatCustom ? repeatIntervalNumber : 1;
  const repeatSummary = draftRepeatEnabled
    ? buildRepeatSummary({
        date: draftDate,
        frequency: draftRepeatFrequency,
        interval: activeRepeatInterval,
        monthDays: activeRepeatMonthDays,
        time: draftTime,
        weekdays: activeRepeatWeekdays,
        yearMonths: activeRepeatYearMonths,
      })
    : "";

  useOverflowFade(poolScrollRef, [defaultTasks.length, pendingDefaults.length]);

  useEffect(() => {
    if (!editingTask) return;
    setDraftTitle(editingTask.title);
    setDraftDate(editingDate ?? today);
    setDraftTime(editingTask.time);
    setDraftCategory(editingTask.category);
    setDraftDuration(normalizeTaskDurationValue(editingTask.duration));
    setDraftRepeatEnabled(Boolean(editingTask.repeatFrequency));
    setDraftRepeatFrequency(editingTask.repeatFrequency ?? "weekly");
    setDraftRepeatEndDate(editingTask.repeatEndDate ?? "");
    setDraftRepeatCustom(
      hasCustomRepeatValues({
        frequency: editingTask.repeatFrequency,
        interval: editingTask.repeatInterval,
        weekdays: editingTask.repeatWeekdays,
        monthDays: editingTask.repeatMonthDays,
        yearMonths: editingTask.repeatYearMonths,
      }),
    );
    setDraftRepeatInterval(String(Math.max(1, Math.trunc(editingTask.repeatInterval ?? 1))));
    setDraftRepeatWeekdays(
      editingTask.repeatWeekdays?.length ? normalizeRepeatWeekdays(editingTask.repeatWeekdays) : [dateKeyToPlannerWeekday(editingDate ?? today)],
    );
    setDraftRepeatMonthDays(
      editingTask.repeatMonthDays?.length ? normalizeRepeatMonthDays(editingTask.repeatMonthDays) : [dateKeyToMonthDay(editingDate ?? today)],
    );
    setDraftRepeatMonthOverflow(editingTask.repeatMonthOverflow ?? "skip");
    setDraftRepeatYearMonths(
      editingTask.repeatYearMonths?.length ? normalizeRepeatYearMonths(editingTask.repeatYearMonths) : [dateKeyToMonthIndex(editingDate ?? today)],
    );
    setDraftSaveToDefault(false);
    setQueuedTasks([]);
    setAddTaskError("");
    setConfirmDisableRepeat(false);
    setConfirmDeleteRepeat(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingTask, editingDate]);

  useEffect(() => {
    if (editingTask) return;
    const initialRepeatFrequencyValue = initialTask?.repeatFrequency ?? null;
    const initialRepeatIntervalValue = Math.max(1, Math.trunc(initialTask?.repeatInterval ?? 1));
    setDraftTitle(initialTask?.title ?? "");
    setDraftDate(initialTask?.occurrenceDate ?? today);
    setDraftTime(initialTask?.time ?? "");
    setDraftCategory(initialTask?.category ?? "");
    setDraftDuration(normalizeTaskDurationValue(initialTask?.duration));
    setDraftRepeatEnabled(Boolean(initialRepeatFrequencyValue));
    setDraftRepeatFrequency(initialRepeatFrequencyValue ?? "weekly");
    setDraftRepeatEndDate(initialTask?.repeatEndDate ?? "");
    setDraftRepeatCustom(
      hasCustomRepeatValues({
        frequency: initialRepeatFrequencyValue,
        interval: initialRepeatIntervalValue,
        weekdays: initialTask?.repeatWeekdays,
        monthDays: initialTask?.repeatMonthDays,
        yearMonths: initialTask?.repeatYearMonths,
      }),
    );
    setDraftRepeatInterval(String(initialRepeatIntervalValue));
    setDraftRepeatWeekdays(
      initialTask?.repeatWeekdays?.length ? normalizeRepeatWeekdays(initialTask.repeatWeekdays) : [dateKeyToPlannerWeekday(initialTask?.occurrenceDate ?? today)],
    );
    setDraftRepeatMonthDays(
      initialTask?.repeatMonthDays?.length ? normalizeRepeatMonthDays(initialTask.repeatMonthDays) : [dateKeyToMonthDay(initialTask?.occurrenceDate ?? today)],
    );
    setDraftRepeatMonthOverflow(initialTask?.repeatMonthOverflow ?? "skip");
    setDraftRepeatYearMonths(
      initialTask?.repeatYearMonths?.length ? normalizeRepeatYearMonths(initialTask.repeatYearMonths) : [dateKeyToMonthIndex(initialTask?.occurrenceDate ?? today)],
    );
    setDraftSaveToDefault(false);
    setQueuedTasks([]);
    setAddTaskError("");
  }, [
    editingTask,
    initialTask?.title,
    initialTask?.occurrenceDate,
    initialTask?.time,
    initialTask?.category,
    initialTask?.duration,
    initialTask?.repeatFrequency,
    initialTask?.repeatInterval,
    initialTask?.repeatWeekdays,
    initialTask?.repeatMonthDays,
    initialTask?.repeatMonthOverflow,
    initialTask?.repeatYearMonths,
    initialTask?.repeatEndDate,
    today,
  ]);

  const resetDraft = () => {
    setDraftTitle(initialTask?.title ?? "");
    setDraftDate(initialTask?.occurrenceDate ?? todayDateKey());
    setDraftTime(initialTask?.time ?? "");
    setDraftCategory(initialTask?.category ?? "");
    setDraftDuration(normalizeTaskDurationValue(initialTask?.duration));
    setDraftRepeatEnabled(false);
    setDraftRepeatFrequency("weekly");
    setDraftRepeatEndDate("");
    setDraftRepeatCustom(false);
    setDraftRepeatInterval("1");
    setDraftRepeatWeekdays([dateKeyToPlannerWeekday(todayDateKey())]);
    setDraftRepeatMonthDays([dateKeyToMonthDay(todayDateKey())]);
    setDraftRepeatMonthOverflow("skip");
    setDraftRepeatYearMonths([dateKeyToMonthIndex(todayDateKey())]);
    setDraftSaveToDefault(false);
  };

  useEffect(() => {
    if (!draftRepeatEnabled && !sourceRepeatFrequency) {
      setDraftRepeatCustom(false);
      setDraftRepeatInterval("1");
      setDraftRepeatWeekdays([dateKeyToPlannerWeekday(draftDate)]);
      setDraftRepeatMonthDays([dateKeyToMonthDay(draftDate)]);
      setDraftRepeatMonthOverflow("skip");
      setDraftRepeatYearMonths([dateKeyToMonthIndex(draftDate)]);
    }
  }, [draftDate, draftRepeatEnabled, sourceRepeatFrequency]);

  useEffect(() => {
    if (!draftRepeatCustom && !sourceHasCustomRepeat) {
      setDraftRepeatInterval("1");
      setDraftRepeatWeekdays([dateKeyToPlannerWeekday(draftDate)]);
      setDraftRepeatMonthDays([dateKeyToMonthDay(draftDate)]);
      setDraftRepeatMonthOverflow("skip");
      setDraftRepeatYearMonths([dateKeyToMonthIndex(draftDate)]);
    }
  }, [draftDate, draftRepeatCustom, sourceHasCustomRepeat]);

  useEffect(() => {
    if (showRepeatWeekdays && !draftRepeatWeekdays.length) {
      setDraftRepeatWeekdays([dateKeyToPlannerWeekday(draftDate)]);
    }
  }, [draftDate, draftRepeatWeekdays.length, showRepeatWeekdays]);

  useEffect(() => {
    if (showRepeatMonthDays && !draftRepeatMonthDays.length) {
      setDraftRepeatMonthDays([dateKeyToMonthDay(draftDate)]);
    }
  }, [draftDate, draftRepeatMonthDays.length, showRepeatMonthDays]);

  useEffect(() => {
    if (showRepeatYearMonths && !draftRepeatYearMonths.length) {
      setDraftRepeatYearMonths([dateKeyToMonthIndex(draftDate)]);
    }
  }, [draftDate, draftRepeatYearMonths.length, showRepeatYearMonths]);

  const toggleRepeatWeekday = (weekday: number) => {
    setDraftRepeatWeekdays((current) => {
      const normalized = normalizeRepeatWeekdays(current);
      if (normalized.includes(weekday)) {
        return normalized.length > 1 ? normalized.filter((item) => item !== weekday) : normalized;
      }
      return normalizeRepeatWeekdays([...normalized, weekday]);
    });
  };

  const toggleRepeatMonthDay = (day: number) => {
    setDraftRepeatMonthDays((current) => {
      const normalized = normalizeRepeatMonthDays(current);
      if (normalized.includes(day)) {
        return normalized.length > 1 ? normalized.filter((item) => item !== day) : normalized;
      }
      return normalizeRepeatMonthDays([...normalized, day]);
    });
  };

  const toggleRepeatYearMonth = (month: number) => {
    setDraftRepeatYearMonths((current) => {
      const normalized = normalizeRepeatYearMonths(current);
      if (normalized.includes(month)) {
        return normalized.length > 1 ? normalized.filter((item) => item !== month) : normalized;
      }
      return normalizeRepeatYearMonths([...normalized, month]);
    });
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
        repeatFrequency: draftRepeatEnabled ? draftRepeatFrequency : null,
        repeatInterval: draftRepeatEnabled && draftRepeatCustom ? repeatIntervalNumber : 1,
        repeatWeekdays: activeRepeatWeekdays,
        repeatMonthDays: activeRepeatMonthDays,
        repeatMonthOverflow: showRepeatMonthDays ? draftRepeatMonthOverflow : "skip",
        repeatYearMonths: activeRepeatYearMonths,
        repeatEndDate: draftRepeatEnabled ? draftRepeatEndDate : "",
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
        repeatFrequency: draftRepeatEnabled ? draftRepeatFrequency : null,
        repeatInterval: draftRepeatEnabled && draftRepeatCustom ? repeatIntervalNumber : 1,
        repeatWeekdays: activeRepeatWeekdays,
        repeatMonthDays: activeRepeatMonthDays,
        repeatMonthOverflow: showRepeatMonthDays ? draftRepeatMonthOverflow : "skip",
        repeatYearMonths: activeRepeatYearMonths,
        repeatEndDate: draftRepeatEnabled ? draftRepeatEndDate : "",
        saveToDefault: false,
        fromDefault: true,
      },
    ]);
  };

  const removeFromQueue = (localId: string) => {
    setQueuedTasks((current) => current.filter((item) => item.localId !== localId));
  };

  const saveEdit = async (options: { confirmedDisableRepeat?: boolean } = {}) => {
    const title = draftTitle.trim();
    if (!title) {
      setAddTaskError("Task title is required.");
      return;
    }
    if (draftRepeatEnabled && draftRepeatEndDate && draftRepeatEndDate < draftDate) {
      setAddTaskError("End repeat must be on or after the task date.");
      return;
    }
    if (isEditingRecurring && !draftRepeatEnabled && !options.confirmedDisableRepeat) {
      setConfirmDisableRepeat(true);
      return;
    }

    const recurrenceUpdates =
      showRepeatControls && (draftRepeatEnabled || isEditingRecurring)
        ? {
            repeatFrequency: draftRepeatEnabled ? draftRepeatFrequency : null,
            repeatInterval: draftRepeatEnabled && draftRepeatCustom ? repeatIntervalNumber : 1,
            repeatWeekdays: activeRepeatWeekdays,
            repeatMonthDays: activeRepeatMonthDays,
            repeatMonthOverflow: showRepeatMonthDays ? draftRepeatMonthOverflow : "skip",
            repeatYearMonths: activeRepeatYearMonths,
            repeatEndDate: draftRepeatEnabled ? draftRepeatEndDate || null : null,
            recurrenceUpdateScope: isEditingRecurring ? ("series" as const) : ("single" as const),
          }
        : {};

    setAddTaskError("");
    setEditSaving(true);
    try {
      await onSaveEdit?.({
        title,
        category: draftCategory.trim(),
        duration: draftDuration,
        time: draftTime,
        ...(editingDate != null ? { date: draftDate } : null),
        ...recurrenceUpdates,
      });
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setAddTaskError(error.payload?.errors?.title ?? error.payload?.errors?.repeatEndDate ?? error.payload?.message ?? error.message);
      } else {
        setAddTaskError("Could not update this task.");
      }
    } finally {
      setEditSaving(false);
      setConfirmDisableRepeat(false);
    }
  };

  const saveCreate = async (options: { confirmedDisableRepeat?: boolean } = {}) => {
    if (confirmDisableRepeatOnCreate && !draftRepeatEnabled && !options.confirmedDisableRepeat) {
      setConfirmDisableRepeat(true);
      return;
    }
    const items = [...queuedTasks];
    const pendingDraft = draftTitle.trim();
    if (draftRepeatEnabled && draftRepeatEndDate && draftRepeatEndDate < draftDate) {
      setAddTaskError("End repeat must be on or after the task date.");
      return;
    }
    if (pendingDraft) {
      items.push({
        localId: `draft-${Date.now()}`,
        title: pendingDraft,
        occurrenceDate: draftDate,
        time: draftTime,
        category: draftCategory.trim(),
        duration: draftDuration,
        repeatFrequency: draftRepeatEnabled ? draftRepeatFrequency : null,
        repeatInterval: draftRepeatEnabled && draftRepeatCustom ? repeatIntervalNumber : 1,
        repeatWeekdays: activeRepeatWeekdays,
        repeatMonthDays: activeRepeatMonthDays,
        repeatMonthOverflow: showRepeatMonthDays ? draftRepeatMonthOverflow : "skip",
        repeatYearMonths: activeRepeatYearMonths,
        repeatEndDate: draftRepeatEnabled ? draftRepeatEndDate : "",
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
        const input: AddTaskModalCreateInput = {
          title: item.title,
          occurrenceDate: item.occurrenceDate,
          time: item.time,
          category: item.category,
          duration: item.duration,
          saveToDefault: item.saveToDefault,
          repeatFrequency: item.repeatFrequency,
          repeatInterval: item.repeatInterval,
          repeatWeekdays: item.repeatWeekdays,
          repeatMonthDays: item.repeatMonthDays,
          repeatMonthOverflow: item.repeatMonthOverflow,
          repeatYearMonths: item.repeatYearMonths,
          repeatEndDate: item.repeatEndDate || null,
        };
        setCreateSaving(true);
        if (onCreateTask) await onCreateTask(input);
        else await createTask.mutateAsync(input);
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setAddTaskError(error.payload?.errors?.title ?? error.payload?.errors?.repeatEndDate ?? error.payload?.message ?? error.message);
      } else {
        setAddTaskError("Could not reach the task server.");
      }
    } finally {
      setCreateSaving(false);
      setConfirmDisableRepeat(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isEditMode) {
      await saveEdit();
      return;
    }

    await saveCreate();
  };

  const modal = (
    <motion.div
      className={`task-modal-overlay ${variant === "dialog" ? "task-modal-overlay--dialog" : ""} ${
        context === "plan" ? "task-modal-overlay--plan" : ""
      }`.trim()}
      aria-label={modalTitle ?? (isEditMode ? "Edit task" : "Add task")}
      role="dialog"
      aria-modal="true"
      initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: 8, filter: "blur(8px)" }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="task-modal__header">
        <h2>{modalTitle ?? (isEditMode ? draftTitle.trim() || "Edit task" : "Add task")}</h2>
        <button className="task-modal__close" type="button" aria-label={isEditMode ? "Close edit task" : "Close add task"} onClick={onClose}>
          x
        </button>
      </header>

      <form className="task-modal__content task-modal__content--compact" onSubmit={submit} noValidate>
        <div className="task-modal__main">
          {scheduleNotice ? (
            <div className="task-modal__schedule-state">
              {scheduleNotice}
            </div>
          ) : null}
          <div className="task-modal__draft">
            <div className={`task-modal__draft-row task-modal__draft-row--inline ${isEditMode ? "task-modal__draft-row--edit" : ""}`.trim()}>
              <div className="task-modal__draft-line task-modal__draft-line--primary">
                <div className="task-modal__field-shell">
                  <span className="task-modal__field-label">Task name</span>
                  <input
                    className={`task-modal__title-input ${lockedFields?.title ? "task-modal__locked-input" : ""}`.trim()}
                    type="text"
                    maxLength={120}
                    placeholder="Task name"
                    aria-label="Task name"
                    value={draftTitle}
                    autoFocus={!lockedFields?.title}
                    disabled={lockedFields?.title}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (isEditMode || context === "plan") event.currentTarget.form?.requestSubmit();
                        else queueDraft();
                      }
                    }}
                  />
                </div>
                <div className="task-modal__field-shell">
                  <span className="task-modal__field-label">Category</span>
                  {lockedFields?.category ? (
                    <input
                      className="task-modal__title-input task-modal__locked-input"
                      type="text"
                      value={draftCategory}
                      aria-label="Category"
                      disabled
                      readOnly
                    />
                  ) : (
                    <TaskCategoryPicker
                      mode="select"
                      ariaLabel="Category"
                      placeholder="Category"
                      value={draftCategory}
                      onChange={setDraftCategory}
                      allowCreate
                      extraCategoryNames={extraCategoryNames}
                    />
                  )}
                </div>
              </div>
              <div className="task-modal__draft-line task-modal__draft-line--secondary">
                {!isEditMode || editingDate != null ? (
                  <div className="task-modal__field-shell task-modal__field-shell--date">
                    <span className="task-modal__field-label">Date</span>
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
                  </div>
                ) : null}
                <div className="task-modal__field-shell task-modal__field-shell--time">
                  <span className="task-modal__field-label">Time</span>
                  <span className="task-modal__field-icon">
                    <ClockFieldIcon />
                  </span>
                  <TimePickerDropdown value={draftTime} onChange={setDraftTime} />
                </div>
                <div className="task-modal__field-shell task-modal__field-shell--duration">
                  <span className="task-modal__field-label">Duration</span>
                  <span className="task-modal__field-icon">
                    <DurationFieldIcon />
                  </span>
                  <TaskDurationInput value={draftDuration} onChange={setDraftDuration} />
                </div>
                {!isEditMode && context !== "plan" ? (
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
              {showRepeatControls ? (
                <div
                  className={["task-modal__repeat-row", draftRepeatEnabled ? "is-repeat-open" : ""]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="task-modal__repeat-control">
                    <button
                      className="task-modal__repeat-label"
                      type="button"
                      aria-pressed={draftRepeatEnabled}
                      onClick={() => setDraftRepeatEnabled((current) => !current)}
                    >
                      <span className="task-modal__repeat-icon" aria-hidden="true">
                        <RepeatIcon />
                      </span>
                      <span>Repeat</span>
                    </button>
                    <button
                      className="task-modal__repeat-knob"
                      type="button"
                      role="switch"
                      aria-checked={draftRepeatEnabled}
                      aria-label="Repeat task"
                      onClick={() => setDraftRepeatEnabled((current) => !current)}
                    >
                      <span className="task-modal__repeat-knob-bg" aria-hidden="true">
                      </span>
                      <span className="task-modal__repeat-knob-handle" aria-hidden="true">
                        <span className="task-modal__repeat-knob-handle-ring" />
                        <span className="task-modal__repeat-knob-handle-face" />
                      </span>
                    </button>
                    {draftRepeatEnabled ? (
                      <div className="task-modal__repeat-custom">
                        <div className="checkbox-wrapper">
                          <input
                            id={repeatCustomId}
                            type="checkbox"
                            checked={draftRepeatCustom}
                            onChange={(event) => setDraftRepeatCustom(event.target.checked)}
                          />
                          <label htmlFor={repeatCustomId}>
                            <span className="tick_mark" aria-hidden="true"></span>
                          </label>
                        </div>
                        <label htmlFor={repeatCustomId}>Custom</label>
                      </div>
                    ) : null}
                  </div>
                  <div
                    className={["task-modal__repeat-fields", draftRepeatEnabled ? "" : "is-hidden"].filter(Boolean).join(" ")}
                    aria-hidden={!draftRepeatEnabled}
                  >
                    <div className="task-modal__field-shell task-modal__repeat-frequency-field">
                      <span className="task-modal__field-label">Frequency</span>
                      <RepeatFrequencyDropdown value={draftRepeatFrequency} onChange={setDraftRepeatFrequency} />
                    </div>
                    {draftRepeatCustom ? (
                      <div className="task-modal__repeat-interval-field" aria-label="Custom repeat interval">
                        <span>Every</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          aria-label="Repeat interval count"
                          value={draftRepeatInterval}
                          placeholder="1"
                          onChange={(event) => setDraftRepeatInterval(sanitizeRepeatIntervalInput(event.target.value))}
                          onBlur={() => setDraftRepeatInterval(String(repeatIntervalNumber))}
                        />
                        <span>{repeatIntervalUnit}</span>
                      </div>
                    ) : null}
                    {showRepeatWeekdays ? (
                      <div className="task-modal__repeat-weekdays-field">
                        <span className="task-modal__field-label">Repeat on</span>
                        <div className="task-modal__repeat-weekdays" aria-label="Repeat on weekdays">
                          {WEEKDAY_OPTIONS.map((weekday) => {
                            const isSelected = activeRepeatWeekdays.includes(weekday.value);
                            return (
                              <button
                                key={weekday.value}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => toggleRepeatWeekday(weekday.value)}
                              >
                                <span>{weekday.label}</span>
                                {isSelected ? (
                                  <span className="task-modal__repeat-weekday-check" aria-hidden="true">
                                    <svg viewBox="0 0 16 16" focusable="false">
                                      <path d="M4.4 8.1l2.1 2.1 5-5" />
                                    </svg>
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                    {showRepeatMonthDays ? (
                      <div className="task-modal__repeat-monthdays-field">
                        <div className="task-modal__repeat-monthdays-calendar">
                          <span className="task-modal__field-label">Each</span>
                          <div className="task-modal__repeat-monthdays" aria-label="Repeat on month day">
                            {MONTH_DAY_OPTIONS.map((day) => (
                              <button
                                key={day}
                                type="button"
                                aria-pressed={activeRepeatMonthDays.includes(day)}
                                onClick={() => toggleRepeatMonthDay(day)}
                              >
                                {day}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {showRepeatYearMonths ? (
                      <div className="task-modal__repeat-yearmonths-field">
                        <div className="task-modal__repeat-yearmonths-calendar">
                          <span className="task-modal__field-label">Months</span>
                          <div className="task-modal__repeat-yearmonths" aria-label="Repeat in months">
                            {YEAR_MONTH_OPTIONS.map((month) => (
                              <button
                                key={month.value}
                                type="button"
                                aria-pressed={activeRepeatYearMonths.includes(month.value)}
                                onClick={() => toggleRepeatYearMonth(month.value)}
                              >
                                {month.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {showRepeatMonthDays && overflowRepeatMonthDays.length ? (
                      <div className="task-modal__repeat-month-overflow">
                        <div className="task-modal__repeat-month-overflow-header">
                          <div>
                            <h4>
                              Short months behavior
                              <span className="task-modal__repeat-month-overflow-info">
                                <InfoIcon />
                              </span>
                            </h4>
                            <p>Choose what happens when a month doesn&apos;t have the selected day.</p>
                          </div>
                        </div>
                        <div className="task-modal__repeat-month-overflow-options">
                          {MONTH_OVERFLOW_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                                  aria-pressed={draftRepeatMonthOverflow === option.value}
                                  onClick={() => setDraftRepeatMonthOverflow(option.value)}
                                >
                                  <span className="task-modal__repeat-month-overflow-option-icon" aria-hidden="true">
                                    {option.value === "last-day" ? <LastDayOptionIcon /> : <SkipMonthOptionIcon />}
                                  </span>
                              <span className="task-modal__repeat-month-overflow-option-copy">
                                <strong>{option.title}</strong>
                                <span>{option.description}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="task-modal__field-shell task-modal__repeat-end-field">
                      <span className="task-modal__field-label">End after</span>
                      <GoalDatePicker
                        className="task-modal__date-picker task-modal__repeat-end"
                        value={draftRepeatEndDate}
                        onChange={setDraftRepeatEndDate}
                        allowClear
                        showTodayShortcut={false}
                        minDate={draftDate}
                        ariaLabel="End after"
                        emptyDisplayValue="Never"
                        formatDisplayValue={formatTaskDate}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
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

          {!isEditMode && context !== "plan" ? (
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
                                formatRepeatLabel(item.repeatFrequency, item.repeatEndDate, item.repeatInterval, item.repeatWeekdays, item.repeatMonthDays),
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
                                formatRepeatLabel(item.repeatFrequency, item.repeatEndDate, item.repeatInterval, item.repeatWeekdays, item.repeatMonthDays),
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
            ) : null}
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
                            formatRepeatLabel(item.repeatFrequency, item.repeatEndDate, item.repeatInterval, item.repeatWeekdays, item.repeatMonthDays),
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
          {showRepeatControls && repeatSummary ? (
            <p className="task-modal__repeat-summary" aria-live="polite">
              {repeatSummary}
            </p>
          ) : null}
          <div className="task-modal__footer-actions">
            {isEditMode && onDelete ? (
              <DeleteActionButton
                className="task-modal__delete"
                onClick={() => {
                  if (isEditingRecurring) setConfirmDeleteRepeat(true);
                  else onDelete();
                }}
                disabled={editSaving}
              >
                Delete task
              </DeleteActionButton>
            ) : null}
            <div className="task-modal__footer-main-actions">
              <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" onClick={onClose}>
                Cancel
              </button>
              <button className="task-add" type="submit" disabled={isEditMode ? editSaving : createPending}>
                {isEditMode
                  ? editSaving
                    ? "Saving..."
                    : "Save changes"
                  : createPending
                    ? pendingLabel ?? "Adding..."
                    : submitTaskLabel}
              </button>
            </div>
          </div>
        </footer>
      </form>
      {confirmDisableRepeat ? (
        <RepeatDisableConfirm
          message={disableRepeatConfirmMessage}
          onCancel={() => setConfirmDisableRepeat(false)}
          onConfirm={() => {
            if (isEditMode) void saveEdit({ confirmedDisableRepeat: true });
            else void saveCreate({ confirmedDisableRepeat: true });
          }}
          disabled={isEditMode ? editSaving : createPending}
        />
      ) : null}
      {confirmDeleteRepeat && onDelete ? (
        <RepeatDeleteConfirm
          onCancel={() => setConfirmDeleteRepeat(false)}
          onPick={(scope) => {
            onDelete(scope);
            setConfirmDeleteRepeat(false);
          }}
        />
      ) : null}
    </motion.div>
  );

  if (variant === "dialog") {
    const dialog = (
      <motion.div
        className={`task-modal-backdrop ${context === "plan" ? "task-modal-backdrop--plan" : ""}`.trim()}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {modal}
      </motion.div>
    );

    return createPortal(dialog, document.body);
  }

  return modal;
}
