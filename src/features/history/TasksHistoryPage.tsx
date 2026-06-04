import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import type { Goal, Occurrence } from "../../../shared/schemas";
import { queryKeys } from "../../shared/api/queryClient";
import { categoryTone } from "../today/categoryColor";
import * as occurrencesApi from "../today/occurrencesApi";
import { todayDateKey } from "../today/useOccurrences";
import { useGoals } from "../goals/useGoals";
import { GoalDatePicker } from "../goals/GoalDatePicker";

const FULL_DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function addDays(dateKey: string, days: number) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return todayDateKey(date);
}

function isValidDateKey(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function formatFocusDuration(seconds: number) {
  if (seconds <= 0) return "0m";
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

function goalTitleLookup(goals: Goal[]) {
  const map = new Map<string, string>();
  goals.forEach((goal) => map.set(goal.id, goal.title));
  return map;
}

function getOccurrenceCategory(occurrence: Occurrence, goalTitleById: Map<string, string>) {
  if (occurrence.sourceKind === "standalone") return occurrence.category;
  return occurrence.goalId ? goalTitleById.get(occurrence.goalId) ?? "Goal" : "Goal";
}

function HistoryTaskRow({
  occurrence,
  goalTitleById,
}: {
  occurrence: Occurrence;
  goalTitleById: Map<string, string>;
}) {
  const category = getOccurrenceCategory(occurrence, goalTitleById);
  const tone = category ? categoryTone(category) : "";

  return (
    <motion.li
      className={`history-task ${occurrence.completed ? "is-completed" : ""}`.trim()}
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
    >
      <div className="checkbox-wrapper task-checkbox history-task__check">
        <input
          id={`history-task-checkbox-${occurrence.id}`}
          type="checkbox"
          checked={occurrence.completed}
          readOnly
          disabled
          aria-label={`${occurrence.title} completion status`}
        />
        <label htmlFor={`history-task-checkbox-${occurrence.id}`}>
          <span className="tick_mark" aria-hidden="true" />
        </label>
      </div>

      <span className="history-task__title" title={occurrence.title}>
        {occurrence.title}
      </span>

      <span
        className={`task-category history-task__category${tone ? ` task-category--${tone}` : ""}`.trim()}
        title={category}
      >
        {category}
      </span>

      {occurrence.focusSeconds > 0 ? (
        <span className="task-title__chip history-task__focus">
          {formatFocusDuration(occurrence.focusSeconds)} focus
        </span>
      ) : (
        <span className="history-task__focus" aria-hidden="true" />
      )}
    </motion.li>
  );
}

export function TasksHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDate = isValidDateKey(searchParams.get("date")) ? searchParams.get("date") as string : todayDateKey();
  const occurrencesQuery = useQuery({
    queryKey: queryKeys.occurrences(selectedDate),
    queryFn: async () => (await occurrencesApi.fetchOccurrences(selectedDate)).occurrences,
    placeholderData: [],
  });
  const goalsQuery = useGoals();

  const occurrences = occurrencesQuery.data ?? [];
  const goalTitleById = useMemo(() => goalTitleLookup(goalsQuery.data ?? []), [goalsQuery.data]);
  const selectedDateLabel = FULL_DATE_FORMAT.format(parseDateKey(selectedDate));
  const isLoading = occurrencesQuery.isLoading || goalsQuery.isLoading;
  const status = occurrencesQuery.isError || goalsQuery.isError
    ? "Could not load task history."
    : isLoading
      ? "Loading task history..."
      : "";

  const completedCount = useMemo(
    () => occurrences.filter((occurrence) => occurrence.completed).length,
    [occurrences],
  );
  const totalFocusSeconds = useMemo(
    () => occurrences.reduce((sum, occurrence) => sum + occurrence.focusSeconds, 0),
    [occurrences],
  );

  const setDate = (date: string) => {
    if (!isValidDateKey(date)) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("date", date);
      return next;
    });
  };

  return (
    <motion.section
      className="tasks-history-page"
      aria-label="Tasks History"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="history-header">
        <div>
          <h1 className="tasks-title">Tasks History</h1>
          <p className="goals-page__subtitle">Browse tasks by day without changing them.</p>
        </div>
      </header>

      <section className="history-panel ui-card ui-card--elevated" aria-label={`${selectedDateLabel} task history`}>
        <header className="history-panel__toolbar">
          <GoalDatePicker
            className="history-date-picker"
            value={selectedDate}
            onChange={setDate}
            ariaLabel="Select task history date"
            allowClear={false}
            formatDisplayValue={(value) => FULL_DATE_FORMAT.format(parseDateKey(value))}
            leadingControl={
              <button
                type="button"
                className="history-date-nav"
                aria-label="Previous day"
                onClick={() => setDate(addDays(selectedDate, -1))}
              >
                ‹
              </button>
            }
            trailingControl={
              <button
                type="button"
                className="history-date-nav"
                aria-label="Next day"
                onClick={() => setDate(addDays(selectedDate, 1))}
              >
                ›
              </button>
            }
          />
        </header>

        <div className="history-summary" aria-label="Daily task summary">
          <span><strong>{occurrences.length}</strong> tasks</span>
          <span><strong>{completedCount}</strong> completed</span>
          <span><strong>{formatFocusDuration(totalFocusSeconds)}</strong> focus</span>
        </div>

        {status ? <p className="history-status" role="status">{status}</p> : null}

        <div className="history-list-shell app-scroll">
          {!status && occurrences.length === 0 ? (
            <div className="goals-empty history-empty">
              <strong>No tasks for this day</strong>
              <span>Choose another date to browse planned or completed tasks.</span>
            </div>
          ) : null}

          <AnimatePresence initial={false} mode="popLayout">
            {occurrences.length ? (
              <motion.ol className="history-task-list" layout>
                {occurrences.map((occurrence) => (
                  <HistoryTaskRow
                    key={occurrence.id}
                    occurrence={occurrence}
                    goalTitleById={goalTitleById}
                  />
                ))}
              </motion.ol>
            ) : null}
          </AnimatePresence>
        </div>
      </section>
    </motion.section>
  );
}
