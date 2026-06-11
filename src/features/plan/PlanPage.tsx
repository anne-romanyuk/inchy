import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import type { CategoryInfo, Goal, Occurrence } from "../../../shared/schemas";
import { formatTaskTimeDisplay, parseTaskTime } from "../../../shared/time";
import { parseTaskDuration } from "../../../shared/duration";
import { queryKeys } from "../../shared/api/queryClient";
import { categoryColorForName, categoryStyle } from "../today/categoryColor";
import { AddTaskModal } from "../today/AddTaskModal";
import { TaskCategoryPicker } from "../today/TaskCategoryPicker";
import { todayDateKey, useUpdateOccurrence, useDeleteOccurrence } from "../today/useOccurrences";
import { useDefaultTasks, useTaskCategories } from "../today/useTasks";
import { useGoals } from "../goals/useGoals";
import { getOccurrenceCategory, goalTitleLookup, TaskHistoryContent } from "../history/TaskHistoryContent";
import * as occurrencesApi from "../today/occurrencesApi";

type PlanView = "today" | "week";
type TodayPlanMode = "calendar" | "history";

// Deadline urgency of a goal task, matching the goal-health pill labels
// (Overdue / Due today / Due soon). null = a goal task with a future deadline
// (no active alert) or a non-goal task.
type AlertKind = "overdue" | "due-today" | "due-soon" | null;

type PlanEvent = {
  id: string;
  date: string;
  title: string;
  category: string;
  duration: string;
  time: string;
  color: string;
  completed: boolean;
  alert: AlertKind;
  uncategorized?: boolean;
  // Set only for standalone task occurrences — the ones that can be opened,
  // edited and deleted from the calendar. Goal deadlines / goal-linked
  // occurrences are read-only here.
  occurrenceId?: string;
};

// A timed event resolved onto the day's 24h column: top/height as a percentage
// of the full day, and left/width as a percentage so overlapping events sit
// side by side instead of covering each other.
type PlacedEvent = PlanEvent & {
  topPct: number;
  heightPct: number;
  leftPct: number;
  widthPct: number;
  hasDuration: boolean;
};

const PLAN_VIEW_OPTIONS: Array<{ value: PlanView; label: string }> = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
];

const CATEGORY_FILTER_ALL = "All categories";
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_FORMAT = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES_IN_DAY = 24 * 60;
// Tasks that have a start time but no duration still need a visible block.
const DEFAULT_EVENT_MIN = 30;
const MIN_EVENT_MIN = 20;

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const day = date.getDay() || 7;
  return addDays(startOfDay(date), 1 - day);
}

function dateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatHourLabel(hour: number) {
  const period = hour < 12 ? "AM" : "PM";
  const display = hour % 12 || 12;
  return `${display} ${period}`;
}

function viewDates(view: PlanView, anchor: Date) {
  if (view === "today") return [startOfDay(anchor)];
  const weekStart = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function goalLookup(goals: Goal[]) {
  const byGoalId = new Map<string, Goal>();
  const byTaskId = new Map<string, Goal>();
  const bySubtaskId = new Map<string, Goal>();

  goals.forEach((goal) => {
    byGoalId.set(goal.id, goal);
    goal.tasks.forEach((task) => {
      byTaskId.set(task.id, goal);
      task.subtasks.forEach((subtask) => bySubtaskId.set(subtask.id, goal));
    });
  });

  return { byGoalId, byTaskId, bySubtaskId };
}

function occurrenceGoalTitle(occurrence: Occurrence, goals: Goal[]) {
  if (occurrence.sourceKind === "standalone") return "";
  const lookup = goalLookup(goals);
  const goal =
    (occurrence.goalId ? lookup.byGoalId.get(occurrence.goalId) : null) ??
    (occurrence.goalTaskId ? lookup.byTaskId.get(occurrence.goalTaskId) : null) ??
    (occurrence.goalSubtaskId ? lookup.bySubtaskId.get(occurrence.goalSubtaskId) : null);
  return goal?.title ?? "Goal";
}

// Deadline urgency relative to today, matching goals' getTaskHealth so the
// Plan alert colours line up with the goal-health pill labels.
function deadlineAlert(deadline: string | null | undefined, completed: boolean): AlertKind {
  if (completed || !deadline) return null;
  const today = todayDateKey();
  const tomorrow = dateKey(addDays(startOfDay(new Date()), 1));
  if (deadline < today) return "overdue";
  if (deadline === today) return "due-today";
  if (deadline === tomorrow) return "due-soon";
  return null;
}

function buildOccurrenceEvents(occurrences: Occurrence[], goals: Goal[], categories: CategoryInfo[]): PlanEvent[] {
  return occurrences.map((occurrence) => {
    const explicitCategory = occurrence.category.trim();
    const uncategorized = occurrence.sourceKind === "standalone" && !explicitCategory;
    const category = explicitCategory || occurrenceGoalTitle(occurrence, goals) || "Task";
    return {
      id: `occurrence-${occurrence.id}`,
      date: occurrence.occurrenceDate,
      title: occurrence.title,
      category,
      duration: occurrence.duration,
      time: occurrence.time,
      color: categoryColorForName(category, categories),
      completed: occurrence.completed,
      alert: null,
      uncategorized,
      occurrenceId: occurrence.sourceKind === "standalone" ? occurrence.id : undefined,
    };
  });
}

function buildDeadlineEvents(goals: Goal[], dateSet: Set<string>, categories: CategoryInfo[]): PlanEvent[] {
  return goals.flatMap((goal) =>
    goal.tasks
      .filter((task) => task.deadline && dateSet.has(task.deadline))
      .map((task) => {
        const subtasks = task.subtasks ?? [];
        const completed = subtasks.length ? subtasks.every((subtask) => subtask.completed) : task.completed;
        return {
          id: `deadline-${task.id}`,
          date: task.deadline as string,
          title: task.title,
          category: goal.title,
          duration: "",
          time: "",
          color: categoryColorForName(goal.title, categories),
          completed,
          alert: deadlineAlert(task.deadline, completed),
        };
      }),
  );
}

// Greedy lane assignment: events that overlap in time form a cluster and are
// split into the minimum number of side-by-side columns so none fully hides
// another. Returns each timed event positioned within the day column.
function layoutTimedEvents(events: PlanEvent[]): PlacedEvent[] {
  const timed = events
    .map((event) => {
      const parts = parseTaskTime(event.time);
      if (!parts) return null;
      const startMin = parts.hour * 60 + parts.minute;
      const parsedDuration = parseTaskDuration(event.duration);
      const hasDuration = parsedDuration !== null;
      const durationMin = parsedDuration ? parsedDuration.hours * 60 + parsedDuration.minutes : DEFAULT_EVENT_MIN;
      const endMin = Math.min(startMin + Math.max(durationMin, MIN_EVENT_MIN), MINUTES_IN_DAY);
      return { event, startMin, endMin, hasDuration };
    })
    .filter((item): item is { event: PlanEvent; startMin: number; endMin: number; hasDuration: boolean } => item !== null)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const placed: PlacedEvent[] = [];
  let cluster: Array<{ event: PlanEvent; startMin: number; endMin: number; hasDuration: boolean }> = [];
  let clusterEnd = -1;

  const flush = () => {
    const columnEnds: number[] = [];
    const assignments = cluster.map((item) => {
      let column = columnEnds.findIndex((end) => end <= item.startMin);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(item.endMin);
      } else {
        columnEnds[column] = item.endMin;
      }
      return { item, column };
    });
    const columnCount = columnEnds.length || 1;
    for (const { item, column } of assignments) {
      placed.push({
        ...item.event,
        topPct: (item.startMin / MINUTES_IN_DAY) * 100,
        heightPct: ((item.endMin - item.startMin) / MINUTES_IN_DAY) * 100,
        leftPct: (column / columnCount) * 100,
        widthPct: (1 / columnCount) * 100,
        hasDuration: item.hasDuration,
      });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const item of timed) {
    if (cluster.length && item.startMin >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  if (cluster.length) flush();

  return placed;
}

export function PlanPage() {
  const [view, setView] = useState<PlanView>("week");
  const [todayMode, setTodayMode] = useState<TodayPlanMode>("calendar");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [now, setNow] = useState(() => new Date());
  const [categoryFilter, setCategoryFilter] = useState("");
  const [allDayExpanded, setAllDayExpanded] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [editingOccurrenceId, setEditingOccurrenceId] = useState<string | null>(null);
  const updateOccurrence = useUpdateOccurrence();
  const deleteOccurrence = useDeleteOccurrence();
  const today = todayDateKey();
  const categoriesQuery = useTaskCategories();
  const categories = categoriesQuery.data ?? [];
  const defaultTasksQuery = useDefaultTasks();
  const defaultTasks = defaultTasksQuery.data ?? [];
  const goalsQuery = useGoals();
  const goals = goalsQuery.data ?? [];

  const gridRef = useRef<HTMLDivElement>(null);
  const hoursRef = useRef<HTMLDivElement>(null);

  const dates = useMemo(() => viewDates(view, anchor), [anchor, view]);
  const dateKeys = useMemo(() => dates.map(dateKey), [dates]);
  const dateSet = useMemo(() => new Set(dateKeys), [dateKeys]);
  const occurrenceQueries = useQueries({
    queries: dateKeys.map((date) => ({
      queryKey: queryKeys.occurrences(date),
      queryFn: async () => (await occurrencesApi.fetchOccurrences(date)).occurrences,
      staleTime: 2 * 60_000,
    })),
  });

  const occurrences = occurrenceQueries.flatMap((query) => query.data ?? []);
  const historyGoalLookup = useMemo(() => goalTitleLookup(goals), [goals]);
  const historyOccurrences = useMemo(
    () =>
      categoryFilter
        ? occurrences.filter((occurrence) => getOccurrenceCategory(occurrence, historyGoalLookup) === categoryFilter)
        : occurrences,
    [categoryFilter, historyGoalLookup, occurrences],
  );
  const editingOccurrence = useMemo(
    () => occurrences.find((o) => o.id === editingOccurrenceId && o.sourceKind === "standalone") ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingOccurrenceId, occurrences],
  );
  // Stable object so AddTaskModal's "reset drafts" effect doesn't fire on every
  // render (which would wipe what you're typing).
  const editingTaskData = useMemo(
    () =>
      editingOccurrence
        ? {
            title: editingOccurrence.title,
            category: editingOccurrence.category,
            duration: editingOccurrence.duration,
            time: editingOccurrence.time,
            recurringTaskId: editingOccurrence.recurringTaskId,
            repeatFrequency: editingOccurrence.repeatFrequency,
            repeatInterval: editingOccurrence.repeatInterval,
            repeatWeekdays: editingOccurrence.repeatWeekdays,
            repeatMonthDays: editingOccurrence.repeatMonthDays,
            repeatMonthOverflow: editingOccurrence.repeatMonthOverflow,
            repeatYearMonths: editingOccurrence.repeatYearMonths,
            repeatEndDate: editingOccurrence.repeatEndDate,
          }
        : undefined,
    [editingOccurrence],
  );
  const openEvent = (event: PlanEvent) => {
    if (event.occurrenceId) setEditingOccurrenceId(event.occurrenceId);
  };
  const isLoading = goalsQuery.isLoading || categoriesQuery.isLoading || occurrenceQueries.some((query) => query.isLoading);
  const status = goalsQuery.isError || categoriesQuery.isError || occurrenceQueries.some((query) => query.isError)
    ? "Could not load plan items."
    : isLoading
      ? "Loading plan..."
      : "";
  const historyStatus = goalsQuery.isError || categoriesQuery.isError || occurrenceQueries.some((query) => query.isError)
    ? "Could not load task history."
    : isLoading
      ? "Loading task history..."
      : "";

  const allEvents = useMemo(
    () =>
      [
        ...buildDeadlineEvents(goals, dateSet, categories),
        ...buildOccurrenceEvents(occurrences, goals, categories),
      ].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return a.title.localeCompare(b.title);
      }),
    [categories, dateSet, goals, occurrences],
  );

  const categoryFilterOptions = useMemo(() => {
    const names = Array.from(new Set(allEvents.map((event) => event.category).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    );
    return names;
  }, [allEvents]);

  const visibleEvents = useMemo(
    () => (categoryFilter ? allEvents.filter((event) => event.category === categoryFilter) : allEvents),
    [allEvents, categoryFilter],
  );

  const eventsByDate = useMemo(() => {
    return visibleEvents.reduce<Map<string, PlanEvent[]>>((map, event) => {
      const items = map.get(event.date) ?? [];
      items.push(event);
      map.set(event.date, items);
      return map;
    }, new Map());
  }, [visibleEvents]);
  const allDayRowCount = useMemo(() => {
    if (!allDayExpanded) return 1;
    return Math.max(
      1,
      ...dateKeys.map((key) => (eventsByDate.get(key) ?? []).filter((event) => !parseTaskTime(event.time)).length),
    );
  }, [allDayExpanded, dateKeys, eventsByDate]);
  const collapsedAllDayRowCount = useMemo(() => {
    return Math.max(
      1,
      ...dateKeys.map((key) => {
        const count = (eventsByDate.get(key) ?? []).filter((event) => !parseTaskTime(event.time)).length;
        return count <= 3 ? count : 3;
      }),
    );
  }, [dateKeys, eventsByDate]);

  const title = view === "week"
    ? `${DAY_FORMAT.format(dates[0])} - ${DAY_FORMAT.format(dates[dates.length - 1])}`
    : DAY_FORMAT.format(anchor);
  const isHistoryMode = view === "today" && todayMode === "history";

  const hasToday = dateKeys.includes(today);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTopPct = (nowMinutes / MINUTES_IN_DAY) * 100;
  const nowLabel = formatTaskTimeDisplay(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`);

  // Keep the "now" line live without re-rendering on every second.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // When the visible range changes, scroll the grid to the current time (or to
  // the morning if today isn't in view) so the relevant hours are on screen.
  const rangeKey = dateKeys.join("|");
  useEffect(() => {
    if (isHistoryMode) return;
    const grid = gridRef.current;
    const hours = hoursRef.current;
    if (!grid || !hours) return;
    const current = new Date();
    const fraction = hasToday ? (current.getHours() * 60 + current.getMinutes()) / MINUTES_IN_DAY : 7 / 24;
    const target = hours.offsetTop + hours.offsetHeight * fraction - grid.clientHeight * 0.4;
    grid.scrollTop = Math.max(0, target);
  }, [rangeKey, view, hasToday, isHistoryMode]);

  const shift = (direction: -1 | 1) => {
    setAnchor((current) => {
      if (view === "week") return addDays(current, direction * 7);
      return addDays(current, direction);
    });
  };

  const handleHistoryUpdate = async (occurrence: Occurrence, updates: occurrencesApi.UpdateOccurrenceInput) => {
    await updateOccurrence.mutateAsync({
      id: occurrence.id,
      occurrenceDate: occurrence.occurrenceDate,
      updates,
    });
  };

  const handleHistoryMove = async (occurrence: Occurrence, nextDate: string) => {
    if (!nextDate || nextDate === occurrence.occurrenceDate) return;
    await handleHistoryUpdate(occurrence, { occurrenceDate: nextDate });
  };

  const handleHistoryDelete = async (occurrence: Occurrence) => {
    await deleteOccurrence.mutateAsync({
      id: occurrence.id,
      occurrenceDate: occurrence.occurrenceDate,
    });
  };

  return (
    <motion.section
      className={`plan-workspace plan-workspace--${view}`}
      aria-label="Plan"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <section className="plan-calendar ui-card ui-card--elevated" aria-label={`${title} ${isHistoryMode ? "task history" : "calendar"}`}>
        <div className="plan-calendar__toolbar">
          <div className="plan-calendar__left">
            <h1 className="plan-calendar__title">Plan</h1>

            <div className="category-toggle plan-view-toggle" role="tablist" aria-label="Calendar range">
              <div className="category-toggle__track">
                <div className="category-toggle__scroll">
                  <div
                    className="category-toggle__inner"
                    style={{
                      ["--category-toggle-count" as any]: PLAN_VIEW_OPTIONS.length,
                      ["--category-toggle-active" as any]: PLAN_VIEW_OPTIONS.findIndex((option) => option.value === view),
                    }}
                  >
                    <span className="category-toggle__thumb" aria-hidden="true" />
                    {PLAN_VIEW_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={view === option.value}
                        className={`category-toggle__option ${view === option.value ? "is-active" : ""}`.trim()}
                        onClick={() => {
                          setView(option.value);
                          setAnchor(startOfDay(new Date()));
                          if (option.value === "week") setTodayMode("calendar");
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {view === "today" ? (
              <button
                type="button"
                className={`plan-history-toggle ${isHistoryMode ? "is-active" : ""}`.trim()}
                aria-label={isHistoryMode ? "Show calendar" : "Show task history"}
                aria-pressed={isHistoryMode}
                onClick={() => setTodayMode((current) => (current === "history" ? "calendar" : "history"))}
              >
                <ListIcon />
              </button>
            ) : null}
          </div>

          <div className="plan-calendar__nav" aria-label="Calendar navigation">
            <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" aria-label="Previous range" onClick={() => shift(-1)}>
              ‹
            </button>
            <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" aria-label="Next range" onClick={() => shift(1)}>
              ›
            </button>
            <h2 className="plan-calendar__range">{title}</h2>
            <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" onClick={() => setAnchor(startOfDay(new Date()))}>
              Today
            </button>
          </div>

          <div className="plan-calendar__actions">
            <TaskCategoryPicker
              mode="filter"
              className="plan-category-filter"
              ariaLabel="Filter by category"
              value={categoryFilter}
              onChange={setCategoryFilter}
              allValue=""
              allLabel={CATEGORY_FILTER_ALL}
              extraCategoryNames={categoryFilterOptions}
            />
            <button type="button" className="task-add plan-add-task" onClick={() => setAddTaskOpen(true)}>
              <span aria-hidden="true">+</span>
              Add task
            </button>
          </div>
        </div>

        <div className="plan-calendar__body">
          {!isHistoryMode && status ? <p className="plan-calendar__status" role="status">{status}</p> : null}

          {isHistoryMode ? (
            <div className="plan-history-content" aria-label={`${title} task history`}>
              <TaskHistoryContent
                occurrences={historyOccurrences}
                goals={goals}
                categories={categories}
                status={historyStatus}
                editable
                extraCategoryNames={categoryFilterOptions}
                onUpdateOccurrence={handleHistoryUpdate}
                onMoveOccurrence={handleHistoryMove}
                onDeleteOccurrence={handleHistoryDelete}
                emptyTitle={categoryFilter ? "No tasks in this category" : undefined}
                emptyText={
                  categoryFilter
                    ? "Clear the category filter or choose another day."
                    : "Use the day controls above to browse planned or completed tasks."
                }
              />
            </div>
          ) : (
            <div
              className="plan-timegrid app-scroll"
              data-view={view}
              ref={gridRef}
              style={{
                ["--plan-days" as any]: dates.length,
                ["--plan-all-day-rows" as any]: allDayRowCount,
                ["--plan-all-day-collapsed-rows" as any]: collapsedAllDayRowCount,
                ["--plan-all-day-expanded" as any]: allDayExpanded ? 1 : 0,
              }}
            >
              {/* Header row: empty corner above the hour gutter + one head per day. */}
              <div className="plan-timegrid__corner" aria-hidden="true" />
              {dates.map((date) => {
                const key = dateKey(date);
                const isToday = key === today;
                return (
                  <div key={`head-${key}`} className={`plan-timegrid__dayhead ${isToday ? "is-today" : ""}`.trim()}>
                    <span className="plan-timegrid__weekday">{WEEKDAY_LABELS[(date.getDay() + 6) % 7]}</span>
                    <span className="plan-timegrid__daynum">{date.getDate()}</span>
                  </div>
                );
              })}

              {/* Untimed tasks (date but no specific time) — pinned all-day strip. */}
              <div className={`plan-timegrid__anytime-label ${allDayExpanded ? "is-expanded" : ""}`.trim()}>
                <button
                  type="button"
                  className="plan-timegrid__anytime-toggle"
                  aria-label={allDayExpanded ? "Collapse all-day tasks" : "Expand all-day tasks"}
                  aria-expanded={allDayExpanded}
                  onClick={() => setAllDayExpanded((current) => !current)}
                >
                  <span className="plan-timegrid__anytime-chevron" aria-hidden="true">
                    <ChevronDownIcon />
                  </span>
                </button>
              </div>
              {dates.map((date) => {
                const key = dateKey(date);
                const untimed = (eventsByDate.get(key) ?? []).filter((event) => !parseTaskTime(event.time));
                const visibleUntimed = allDayExpanded || untimed.length <= 3 ? untimed : untimed.slice(0, 2);
                const hiddenUntimedCount = allDayExpanded ? 0 : Math.max(untimed.length - visibleUntimed.length, 0);
                return (
                  <div
                    key={`anytime-${key}`}
                    className={`plan-timegrid__anytime-cell ${allDayExpanded ? "is-expanded" : "is-collapsed"}`.trim()}
                  >
                    <div className="plan-timegrid__anytime-stack">
                      {visibleUntimed.map((event) => (
                        <div
                          key={event.id}
                          className={`plan-event plan-event--chip ${event.uncategorized ? "plan-event--uncategorized" : ""} ${event.occurrenceId ? "plan-event--editable" : ""} ${event.alert ? `plan-event--alert plan-event--alert-${event.alert}` : ""} ${event.completed ? "is-completed" : ""}`
                            .replace(/\s+/g, " ")
                            .trim()}
                          style={categoryStyle(event.color)}
                          role={event.occurrenceId ? "button" : undefined}
                          tabIndex={event.occurrenceId ? 0 : undefined}
                          onClick={() => openEvent(event)}
                          onKeyDown={(keyEvent) => {
                            if (event.occurrenceId && (keyEvent.key === "Enter" || keyEvent.key === " ")) {
                              keyEvent.preventDefault();
                              openEvent(event);
                            }
                          }}
                        >
                          <strong>{event.title}</strong>
                        </div>
                      ))}
                      {hiddenUntimedCount > 0 ? (
                        <button
                          type="button"
                          className="plan-timegrid__anytime-more"
                          aria-label={`${hiddenUntimedCount} more all-day task${hiddenUntimedCount === 1 ? "" : "s"}`}
                          onClick={() => setAllDayExpanded(true)}
                        >
                          {hiddenUntimedCount} more
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {/* Hour gutter (left) + one timed column per day. */}
              <div className="plan-timegrid__hours" aria-hidden="true" ref={hoursRef}>
                {HOURS.map((hour) => (
                  <div key={hour} className="plan-timegrid__hour">
                    <span>{formatHourLabel(hour)}</span>
                  </div>
                ))}
              </div>
              {dates.map((date) => {
                const key = dateKey(date);
                const isToday = key === today;
                const placed = layoutTimedEvents(eventsByDate.get(key) ?? []);
                return (
                  <div key={`col-${key}`} className={`plan-timegrid__col ${isToday ? "is-today" : ""}`.trim()}>
                    {isToday ? (
                      <div
                        className="plan-timegrid__now"
                        style={{ top: `${nowTopPct}%` }}
                        role="img"
                        aria-label={`Current time ${nowLabel}`}
                      >
                        <span className="plan-timegrid__now-dot" aria-hidden="true" />
                      </div>
                    ) : null}
                    {placed.map((event) => (
                      <div
                        key={event.id}
                        className={`plan-event plan-event--grid ${event.hasDuration ? "" : "plan-event--grid-line"} ${event.uncategorized ? "plan-event--uncategorized" : ""} ${event.occurrenceId ? "plan-event--editable" : ""} ${event.alert ? `plan-event--alert plan-event--alert-${event.alert}` : ""} ${event.completed ? "is-completed" : ""}`
                          .replace(/\s+/g, " ")
                          .trim()}
                        style={{
                          top: `${event.topPct}%`,
                          ...(event.hasDuration ? { height: `${event.heightPct}%` } : null),
                          left: `calc(${event.leftPct}% + var(--space-1))`,
                          width: `calc(${event.widthPct}% - var(--space-2))`,
                          ...categoryStyle(event.color),
                        }}
                        role={event.occurrenceId ? "button" : undefined}
                        tabIndex={event.occurrenceId ? 0 : undefined}
                        onClick={() => openEvent(event)}
                        onKeyDown={(keyEvent) => {
                          if (event.occurrenceId && (keyEvent.key === "Enter" || keyEvent.key === " ")) {
                            keyEvent.preventDefault();
                            openEvent(event);
                          }
                        }}
                      >
                        <strong>{event.title}</strong>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <AnimatePresence>
        {addTaskOpen ? (
          <AddTaskModal
            categories={categories}
            defaultTasks={defaultTasks}
            context="plan"
            variant="dialog"
            onClose={() => setAddTaskOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {editingOccurrence ? (
          <AddTaskModal
            categories={categories}
            defaultTasks={defaultTasks}
            context="plan"
            variant="dialog"
            editingTask={editingTaskData}
            editingDate={editingOccurrence.occurrenceDate}
            onClose={() => setEditingOccurrenceId(null)}
            onSaveEdit={async ({ date, ...fields }) => {
              const fromDate = editingOccurrence.occurrenceDate;
              const toDate = date ?? fromDate;
              await updateOccurrence.mutateAsync({
                id: editingOccurrence.id,
                occurrenceDate: fromDate,
                updates: {
                  ...fields,
                  ...(toDate !== fromDate ? { occurrenceDate: toDate } : {}),
                },
              });
            }}
            onDelete={(scope) => {
              deleteOccurrence.mutate({
                id: editingOccurrence.id,
                occurrenceDate: editingOccurrence.occurrenceDate,
                recurrenceDeleteScope: scope,
              });
              setEditingOccurrenceId(null);
            }}
          />
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}

function ListIcon() {
  return (
    <svg className="plan-history-toggle__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8.2 6.6h11" />
      <path d="M8.2 12h11" />
      <path d="M8.2 17.4h11" />
      <path d="M4.8 6.6h.1" />
      <path d="M4.8 12h.1" />
      <path d="M4.8 17.4h.1" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 10L12 15L17 10" />
    </svg>
  );
}
