import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { motion } from "motion/react";
import type { Goal, GoalTask, Occurrence } from "../../../shared/schemas";
import { queryKeys } from "../../shared/api/queryClient";
import { useGoals } from "../goals/useGoals";
import { categoryTone, type CategoryTone } from "../today/categoryColor";
import { todayDateKey } from "../today/useOccurrences";
import * as occurrencesApi from "../today/occurrencesApi";

type PlanView = "today" | "week" | "month";
type PlanHealth = "overdue" | "due-today" | "due-soon";
type PlanEventKind = "deadline" | "occurrence";

type PlanEvent = {
  id: string;
  date: string;
  title: string;
  description: string;
  category: string;
  tone: CategoryTone;
  completed: boolean;
  health: PlanHealth | null;
  kind: PlanEventKind;
};

const PLAN_VIEW_OPTIONS: Array<{ value: PlanView; label: string }> = [
  { value: "today", label: "Today" },
  { value: "week", label: "7 days" },
  { value: "month", label: "Month" },
];

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const DAY_FORMAT = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

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

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function dateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getTaskHealth(task: GoalTask, today: string): PlanHealth | null {
  if (!task.deadline || task.completed) return null;
  const tomorrow = dateKey(addDays(parseDateKey(today), 1));
  if (task.deadline < today) return "overdue";
  if (task.deadline === today) return "due-today";
  if (task.deadline === tomorrow) return "due-soon";
  return null;
}

function healthLabel(health: PlanHealth | null) {
  if (health === "overdue") return "Overdue";
  if (health === "due-today") return "Due today";
  if (health === "due-soon") return "Due soon";
  return "Due date";
}

function viewDates(view: PlanView, anchor: Date) {
  if (view === "today") return [startOfDay(anchor)];
  if (view === "week") return Array.from({ length: 7 }, (_, index) => addDays(startOfDay(anchor), index));

  const monthStart = startOfMonth(anchor);
  const gridStart = startOfWeek(monthStart);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const gridEnd = addDays(startOfWeek(monthEnd), 6);
  const days = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1;
  return Array.from({ length: days }, (_, index) => addDays(gridStart, index));
}

function goalLookup(goals: Goal[]) {
  const byGoalId = new Map<string, Goal>();
  const byTaskId = new Map<string, { goal: Goal; task: GoalTask }>();
  const bySubtaskId = new Map<string, { goal: Goal; task: GoalTask; subtaskTitle: string; completed: boolean }>();

  goals.forEach((goal) => {
    byGoalId.set(goal.id, goal);
    goal.tasks.forEach((task) => {
      byTaskId.set(task.id, { goal, task });
      task.subtasks.forEach((subtask) => {
        bySubtaskId.set(subtask.id, {
          goal,
          task,
          subtaskTitle: subtask.title,
          completed: subtask.completed,
        });
      });
    });
  });

  return { byGoalId, byTaskId, bySubtaskId };
}

function buildDeadlineEvents(goals: Goal[], dateSet: Set<string>, today: string): PlanEvent[] {
  return goals.flatMap((goal) =>
    goal.tasks
      .filter((task) => task.deadline && dateSet.has(task.deadline))
      .map((task) => ({
        id: `deadline-${task.id}`,
        date: task.deadline as string,
        title: task.title,
        description: task.note?.trim() ?? "",
        category: goal.title,
        tone: categoryTone(goal.title),
        completed: task.completed,
        health: getTaskHealth(task, today),
        kind: "deadline" as const,
      })),
  );
}

function buildOccurrenceEvents(occurrences: Occurrence[], goals: Goal[]): PlanEvent[] {
  const lookup = goalLookup(goals);

  return occurrences
    .filter((occurrence) => occurrence.sourceKind !== "standalone")
    .map((occurrence) => {
      const taskMatch = occurrence.goalTaskId ? lookup.byTaskId.get(occurrence.goalTaskId) : null;
      const subtaskMatch = occurrence.goalSubtaskId ? lookup.bySubtaskId.get(occurrence.goalSubtaskId) : null;
      const goal = (occurrence.goalId ? lookup.byGoalId.get(occurrence.goalId) : null) ?? taskMatch?.goal ?? subtaskMatch?.goal;
      const category = goal?.title ?? "Goal";

      return {
        id: `occurrence-${occurrence.id}`,
        date: occurrence.occurrenceDate,
        title: occurrence.title,
        description: subtaskMatch ? subtaskMatch.task.title : taskMatch?.task.note?.trim() ?? "",
        category,
        tone: categoryTone(category),
        completed: occurrence.completed || Boolean(subtaskMatch?.completed),
        health: null,
        kind: "occurrence" as const,
      };
    });
}

export function PlanPage() {
  const [view, setView] = useState<PlanView>("month");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const today = todayDateKey();
  const goalsQuery = useGoals();

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

  const goals = goalsQuery.data ?? [];
  const occurrences = occurrenceQueries.flatMap((query) => query.data ?? []);
  const isLoading = goalsQuery.isLoading || occurrenceQueries.some((query) => query.isLoading);
  const status = goalsQuery.isError || occurrenceQueries.some((query) => query.isError)
    ? "Could not load plan items."
    : isLoading
      ? "Loading plan..."
      : "";

  const eventsByDate = useMemo(() => {
    const events = [
      ...buildDeadlineEvents(goals, dateSet, today),
      ...buildOccurrenceEvents(occurrences, goals),
    ].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.kind !== b.kind) return a.kind === "deadline" ? -1 : 1;
      return a.title.localeCompare(b.title);
    });

    return events.reduce<Map<string, PlanEvent[]>>((map, event) => {
      const items = map.get(event.date) ?? [];
      items.push(event);
      map.set(event.date, items);
      return map;
    }, new Map());
  }, [dateSet, goals, occurrences, today]);

  const title = view === "month"
    ? MONTH_FORMAT.format(anchor)
    : view === "week"
      ? `${DAY_FORMAT.format(dates[0])} - ${DAY_FORMAT.format(dates[dates.length - 1])}`
      : DAY_FORMAT.format(anchor);
  const calendarLabels = view === "month"
    ? WEEKDAY_LABELS
    : dates.map((date) => WEEKDAY_LABELS[(date.getDay() + 6) % 7]);

  const shift = (direction: -1 | 1) => {
    setAnchor((current) => {
      if (view === "month") return new Date(current.getFullYear(), current.getMonth() + direction, 1);
      if (view === "week") return addDays(current, direction * 7);
      return addDays(current, direction);
    });
  };

  return (
    <motion.section
      className={`plan-workspace plan-workspace--${view}`}
      aria-label="Plan"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="plan-header">
        <div>
          <h1 className="tasks-title">Plan</h1>
          <p className="goals-page__subtitle">Goal tasks, subtasks, and scheduled goal work.</p>
        </div>
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
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="plan-calendar ui-card ui-card--elevated" aria-label={`${title} calendar`}>
        <div className="plan-calendar__toolbar">
          <div className="plan-calendar__nav" aria-label="Calendar navigation">
            <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" aria-label="Previous range" onClick={() => shift(-1)}>
              ‹
            </button>
            <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" aria-label="Next range" onClick={() => shift(1)}>
              ›
            </button>
            <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" onClick={() => setAnchor(startOfDay(new Date()))}>
              Today
            </button>
          </div>
          <h2>{title}</h2>
          <div className="plan-calendar__legend" aria-label="Legend">
            <span><i className="plan-legend-dot plan-legend-dot--task" /> Task</span>
            <span><i className="plan-legend-dot plan-legend-dot--deadline" /> Deadline</span>
            <span><i className="plan-legend-dot plan-legend-dot--due" /> Due today</span>
            <span><i className="plan-legend-dot plan-legend-dot--overdue" /> Overdue</span>
          </div>
        </div>

        {status ? <p className="plan-calendar__status" role="status">{status}</p> : null}

        <div className="plan-calendar__grid" data-view={view}>
          {calendarLabels.map((label, index) => (
            <div key={`${label}-${index}`} className="plan-calendar__weekday">{label}</div>
          ))}

          {dates.map((date) => {
            const key = dateKey(date);
            const dayEvents = eventsByDate.get(key) ?? [];
            const isToday = key === today;
            const isMuted = view === "month" && date.getMonth() !== anchor.getMonth();

            return (
              <article
                key={key}
                className={`plan-day ${isToday ? "is-today" : ""} ${isMuted ? "is-muted" : ""}`.trim()}
                aria-label={`${DAY_FORMAT.format(date)}: ${dayEvents.length} items`}
              >
                <div className="plan-day__number">
                  <span>{date.getDate()}</span>
                </div>
                <div className="plan-day__events app-scroll">
                  {dayEvents.map((event) => (
                    <div
                      key={event.id}
                      className={`plan-event plan-event--${event.tone} plan-event--${event.kind} ${event.completed ? "is-completed" : ""}`.trim()}
                    >
                      <div className="plan-event__topline">
                        <span className={`task-category task-category--${event.tone}`}>{event.category}</span>
                        <span
                          className={`plan-event__label ${
                            event.completed
                              ? "plan-event__label--completed"
                              : event.health
                                ? `plan-event__label--${event.health}`
                                : ""
                          }`.trim()}
                        >
                          {event.completed ? "Completed" : event.kind === "occurrence" ? "Task" : healthLabel(event.health)}
                        </span>
                      </div>
                      <strong>{event.title}</strong>
                      {event.description ? <p>{event.description}</p> : null}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </motion.section>
  );
}
