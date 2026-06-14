import { createRoute, z } from "@hono/zod-openapi";
import { checkpointDatabase, db } from "../db";
import { assignCategoryColor } from "../lib/categoryColors";
import { newId } from "../lib/ids";
import { toOccurrence, type OccurrenceRow, type GoalTaskRow, type GoalSubtaskRow } from "../lib/mappers";
import { requireUser, type AuthEnv } from "../middleware/auth";
import { createApp } from "../openapi/hono";
import {
  ErrorResponseSchema,
  GoalLinkedScheduleEnvelopeSchema,
  OccurrenceCreateInputSchema,
  OccurrenceDeleteInputSchema,
  OccurrenceEnvelopeSchema,
  OccurrenceReorderInputSchema,
  OccurrenceUpdateInputSchema,
  OccurrencesEnvelopeSchema,
  OkResponseSchema,
  type RepeatFrequency,
} from "../../shared/schemas";
import { normalizeTaskDurationValue } from "../../shared/duration";
import { normalizeTaskTimeValue } from "../../shared/time";

export const occurrenceRoutes = createApp<AuthEnv>();
occurrenceRoutes.use("*", requireUser);

const OccurrenceIdParamSchema = z.object({
  id: z.string().min(1).openapi({ param: { name: "id", in: "path" }, example: "occ_123" }),
});

const OccurrenceDeleteQuerySchema = OccurrenceDeleteInputSchema.openapi("OccurrenceDeleteQuery");

const DateQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.")
    .openapi({ param: { name: "date", in: "query" }, example: "2026-05-28" }),
});

const GoalLinkedScheduleQuerySchema = z
  .object({
    goalTaskId: z.string().min(1).optional(),
    goalSubtaskId: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.goalTaskId) !== Boolean(value.goalSubtaskId), {
    message: "Provide exactly one goalTaskId or goalSubtaskId.",
  });

const RecurringTaskIdParamSchema = z.object({
  id: z.string().min(1).openapi({ param: { name: "id", in: "path" }, example: "rec_123" }),
});

// SELECT helper that joins live goal_task / goal_subtask titles + focus
// seconds. After migration 015, focus_task_segments.task_id and
// focus_sessions.task_id both reference task_occurrences(id), so we can
// aggregate focus time per occurrence using the same logic the old
// /api/tasks endpoint used to use against the (now retired) `tasks` table.
const SELECT_OCCURRENCES_WITH_RESOLVED = `
  SELECT o.*,
    CASE o.source_kind
      WHEN 'goal_task'    THEN gt.title
      WHEN 'goal_subtask' THEN gs.title
      ELSE NULL
    END AS resolved_title,
    rt.frequency AS repeat_frequency,
    rt.interval_count AS repeat_interval,
    rt.repeat_weekdays AS repeat_weekdays,
    rt.repeat_month_days AS repeat_month_days,
    rt.repeat_month_overflow AS repeat_month_overflow,
    rt.repeat_year_months AS repeat_year_months,
    rt.ends_on AS repeat_end_date,
    COALESCE((
      SELECT SUM(duration_seconds)
      FROM (
        SELECT focus_task_segments.duration_seconds AS duration_seconds
        FROM focus_task_segments
        JOIN focus_sessions ON focus_sessions.id = focus_task_segments.focus_session_id
        WHERE focus_task_segments.task_id = o.id
          AND focus_task_segments.user_id = o.user_id
          AND focus_sessions.mode = 'focus'
          AND focus_sessions.status IN ('completed', 'skipped', 'abandoned')
        UNION ALL
        SELECT focus_sessions.duration_seconds AS duration_seconds
        FROM focus_sessions
        WHERE focus_sessions.task_id = o.id
          AND focus_sessions.user_id = o.user_id
          AND focus_sessions.mode = 'focus'
          AND focus_sessions.status IN ('completed', 'skipped', 'abandoned')
          AND NOT EXISTS (
            SELECT 1 FROM focus_task_segments
            WHERE focus_task_segments.focus_session_id = focus_sessions.id
          )
      ) AS focus_time
    ), 0) AS focus_seconds
  FROM task_occurrences o
  LEFT JOIN goal_tasks    gt ON gt.id = o.goal_task_id
  LEFT JOIN goal_subtasks gs ON gs.id = o.goal_subtask_id
  LEFT JOIN recurring_tasks rt ON rt.id = o.recurring_task_id AND rt.user_id = o.user_id
`;

/** Persist a category to the user's task_categories pool. No-op on empty. */
function saveTaskCategory(userId: string, category: string) {
  const name = category.trim();
  if (!name) return;
  assignCategoryColor(db, "task_categories", userId, name);
}

type RecurringTaskRow = {
  id: string;
  user_id: string;
  starts_on: string;
  source_kind: "standalone" | "goal_task" | "goal_subtask";
  goal_id: string | null;
  goal_task_id: string | null;
  goal_subtask_id: string | null;
  frequency: RepeatFrequency;
  interval_count: number;
  repeat_weekdays: string;
  repeat_month_day: number | null;
  repeat_month_days: string;
  repeat_month_overflow: "last-day" | "skip";
  repeat_year_months: string;
  ends_on: string | null;
  title: string;
  priority: "low" | "medium" | "high" | null;
  category: string;
  duration: string;
  time: string;
  created_at: string;
  updated_at: string;
};

function parseDateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function daysBetween(from: string, to: string) {
  const a = parseDateParts(from);
  const b = parseDateParts(to);
  const start = Date.UTC(a.year, a.month - 1, a.day);
  const end = Date.UTC(b.year, b.month - 1, b.day);
  return Math.floor((end - start) / 86_400_000);
}

function dateToUtcTime(value: string) {
  const { year, month, day } = parseDateParts(value);
  return Date.UTC(year, month - 1, day);
}

function plannerWeekday(value: string) {
  const day = new Date(dateToUtcTime(value)).getUTCDay();
  return (day + 6) % 7;
}

function plannerWeekStartUtc(value: string) {
  return dateToUtcTime(value) - plannerWeekday(value) * 86_400_000;
}

function weeksBetween(from: string, to: string) {
  return Math.floor((plannerWeekStartUtc(to) - plannerWeekStartUtc(from)) / (7 * 86_400_000));
}

function monthsBetween(from: string, to: string) {
  const start = parseDateParts(from);
  const target = parseDateParts(to);
  return (target.year - start.year) * 12 + (target.month - start.month);
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDaysToDateKey(value: string, days: number) {
  const { year, month, day } = parseDateParts(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function todayDateKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseRepeatWeekdays(value: string | null | undefined) {
  if (!value) return [];
  const unique = new Set<number>();
  for (const item of value.split(",")) {
    const weekday = Number(item);
    if (Number.isInteger(weekday) && weekday >= 0 && weekday <= 6) unique.add(weekday);
  }
  return [...unique].sort((a, b) => a - b);
}

function serializeRepeatWeekdays(values: number[] | null | undefined) {
  if (!values) return "";
  return parseRepeatWeekdays(values.join(",")).join(",");
}

function parseRepeatMonthDays(value: string | null | undefined) {
  if (!value) return [];
  const unique = new Set<number>();
  for (const item of value.split(",")) {
    const monthDay = Number(item);
    if (Number.isInteger(monthDay) && monthDay >= 1 && monthDay <= 31) unique.add(monthDay);
  }
  return [...unique].sort((a, b) => a - b);
}

function serializeRepeatMonthDays(values: number[] | null | undefined) {
  if (!values) return "";
  return parseRepeatMonthDays(values.join(",")).join(",");
}

function parseRepeatYearMonths(value: string | null | undefined) {
  if (!value) return [];
  const unique = new Set<number>();
  for (const item of value.split(",")) {
    const month = Number(item);
    if (Number.isInteger(month) && month >= 0 && month <= 11) unique.add(month);
  }
  return [...unique].sort((a, b) => a - b);
}

function serializeRepeatYearMonths(values: number[] | null | undefined) {
  if (!values) return "";
  return parseRepeatYearMonths(values.join(",")).join(",");
}

// preserveCompleted keeps rows the user already checked off (their completion
// history and cascading focus segments must survive schedule edits); the
// unique index on (user_id, recurring_task_id, occurrence_date) stops
// re-materialization from duplicating the preserved rows.
function deleteFutureMaterializedOccurrences(recurringTaskId: string, userId: string, fromDate: string, includeCurrent: boolean, preserveCompleted = false) {
  db.prepare(
    `DELETE FROM task_occurrences
     WHERE user_id = ?
       AND recurring_task_id = ?
       AND occurrence_date ${includeCurrent ? ">=" : ">"} ?${preserveCompleted ? " AND completed = 0" : ""}`,
  ).run(userId, recurringTaskId, fromDate);
}

function recurrenceMatchesDate(rule: RecurringTaskRow, date: string) {
  if (date < rule.starts_on) return false;
  if (rule.ends_on && date > rule.ends_on) return false;
  const interval = Math.max(1, Math.trunc(rule.interval_count || 1));
  if (rule.frequency === "daily") return daysBetween(rule.starts_on, date) % interval === 0;
  const start = parseDateParts(rule.starts_on);
  const target = parseDateParts(date);
  if (rule.frequency === "weekly") {
    const weekdays = parseRepeatWeekdays(rule.repeat_weekdays);
    if (weekdays.length && !weekdays.includes(plannerWeekday(date))) return false;
    if (!weekdays.length && daysBetween(rule.starts_on, date) % 7 !== 0) return false;
    return weeksBetween(rule.starts_on, date) % interval === 0;
  }
  if (rule.frequency === "monthly") {
    const monthDays = parseRepeatMonthDays(rule.repeat_month_days);
    const selectedMonthDays = monthDays.length ? monthDays : [rule.repeat_month_day ?? start.day];
    if (monthsBetween(rule.starts_on, date) % interval !== 0) return false;
    if (selectedMonthDays.includes(target.day)) return true;
    if (rule.repeat_month_overflow !== "last-day") return false;
    const lastDay = daysInMonth(target.year, target.month);
    return target.day === lastDay && selectedMonthDays.some((monthDay) => monthDay > lastDay);
  }
  const yearMonths = parseRepeatYearMonths(rule.repeat_year_months);
  const selectedMonths = yearMonths.length ? yearMonths.map((month) => month + 1) : [start.month];
  return selectedMonths.includes(target.month) && target.day === start.day && (target.year - start.year) % interval === 0;
}

function materializeRecurringOccurrences(userId: string, date: string) {
  const rules = db
    .prepare(
      `SELECT * FROM recurring_tasks
       WHERE user_id = ?
         AND starts_on <= ?
         AND (ends_on IS NULL OR ends_on >= ?)
         AND NOT EXISTS (
           SELECT 1 FROM recurring_task_exceptions
           WHERE recurring_task_exceptions.recurring_task_id = recurring_tasks.id
             AND recurring_task_exceptions.occurrence_date = ?
         )
       ORDER BY created_at ASC`,
    )
    .all(userId, date, date, date) as RecurringTaskRow[];
  const matching = rules.filter((rule) => recurrenceMatchesDate(rule, date));
  if (!matching.length) return;

  const now = new Date().toISOString();
  const minPositionRow = db
    .prepare(
      "SELECT MIN(position) AS min_position FROM task_occurrences WHERE user_id = ? AND occurrence_date = ?",
    )
    .get(userId, date) as { min_position: number | null };
  let nextPosition = (minPositionRow.min_position ?? 1) - 1;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO task_occurrences
     (id, user_id, occurrence_date, source_kind, goal_id, goal_task_id, goal_subtask_id,
      recurring_task_id, title, priority, category, duration, time, completed, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
  );

  db.transaction(() => {
    for (const rule of matching) {
      if (rule.source_kind === "goal_task" && rule.goal_task_id) {
        const subtaskCount = db
          .prepare("SELECT COUNT(*) AS n FROM goal_subtasks WHERE goal_task_id = ?")
          .get(rule.goal_task_id) as { n: number };
        if (subtaskCount.n > 0) continue;
        const duplicate = db
          .prepare(
            `SELECT id FROM task_occurrences
             WHERE user_id = ? AND occurrence_date = ? AND goal_task_id = ? AND completed = 0`,
          )
          .get(userId, date, rule.goal_task_id) as { id: string } | undefined;
        if (duplicate) continue;
      }
      if (rule.source_kind === "goal_subtask" && rule.goal_subtask_id) {
        const duplicate = db
          .prepare(
            `SELECT id FROM task_occurrences
             WHERE user_id = ? AND occurrence_date = ? AND goal_subtask_id = ? AND completed = 0`,
          )
          .get(userId, date, rule.goal_subtask_id) as { id: string } | undefined;
        if (duplicate) continue;
      }
      insert.run(
        newId(),
        userId,
        date,
        rule.source_kind,
        rule.goal_id,
        rule.goal_task_id,
        rule.goal_subtask_id,
        rule.id,
        rule.title,
        rule.priority,
        rule.category,
        normalizeTaskDurationValue(rule.duration),
        normalizeTaskTimeValue(rule.time),
        nextPosition,
        now,
        now,
      );
      nextPosition -= 1;
    }
  })();
}

function materializeRecurringEndBoundary(userId: string, endDate: string | null | undefined) {
  if (!endDate) return;
  materializeRecurringOccurrences(userId, endDate);
}

function goalScheduleColumn(sourceKind: "goal_task" | "goal_subtask") {
  return sourceKind === "goal_task" ? "goal_task_id" : "goal_subtask_id";
}

function nextRecurringDates(rule: RecurringTaskRow, fromDate: string, limit = 5) {
  const dates: string[] = [];
  let cursor = fromDate < rule.starts_on ? rule.starts_on : fromDate;
  for (let i = 0; dates.length < limit && i < 730; i += 1) {
    if (rule.ends_on && cursor > rule.ends_on) break;
    if (recurrenceMatchesDate(rule, cursor)) dates.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
  }
  return dates;
}

function toGoalLinkedRecurringSchedule(rule: RecurringTaskRow, fromDate: string) {
  const repeatMonthDays = parseRepeatMonthDays(rule.repeat_month_days);
  return {
    id: rule.id,
    startsOn: rule.starts_on,
    repeatFrequency: rule.frequency,
    repeatInterval: Math.max(1, Math.trunc(rule.interval_count || 1)),
    repeatWeekdays: parseRepeatWeekdays(rule.repeat_weekdays),
    repeatMonthDays: repeatMonthDays.length ? repeatMonthDays : rule.repeat_month_day ? [rule.repeat_month_day] : [],
    repeatMonthOverflow: rule.repeat_month_overflow,
    repeatYearMonths: parseRepeatYearMonths(rule.repeat_year_months),
    repeatEndDate: rule.ends_on,
    duration: normalizeTaskDurationValue(rule.duration),
    time: normalizeTaskTimeValue(rule.time),
    nextDates: nextRecurringDates(rule, fromDate),
  };
}

function findActiveGoalRecurringRule(
  userId: string,
  sourceKind: "goal_task" | "goal_subtask",
  sourceId: string,
  today: string,
  excludeId?: string,
) {
  const column = goalScheduleColumn(sourceKind);
  return db
    .prepare(
      `SELECT * FROM recurring_tasks
       WHERE user_id = ?
         AND source_kind = ?
         AND ${column} = ?
         AND (ends_on IS NULL OR ends_on >= ?)
         AND (? IS NULL OR id <> ?)
       ORDER BY starts_on DESC, created_at DESC
       LIMIT 1`,
    )
    .get(userId, sourceKind, sourceId, today, excludeId ?? null, excludeId ?? null) as RecurringTaskRow | undefined;
}

function loadGoalLinkedSchedule(
  userId: string,
  sourceKind: "goal_task" | "goal_subtask",
  sourceId: string,
) {
  const today = todayDateKey();
  const column = goalScheduleColumn(sourceKind);
  const recurring = findActiveGoalRecurringRule(userId, sourceKind, sourceId, today);
  const oneOffOccurrences = db
    .prepare(
      `SELECT id, occurrence_date, duration, time
       FROM task_occurrences
       WHERE user_id = ?
         AND source_kind = ?
         AND ${column} = ?
         AND recurring_task_id IS NULL
         AND occurrence_date >= ?
       ORDER BY occurrence_date ASC, time = '', time ASC
       LIMIT 12`,
    )
    .all(userId, sourceKind, sourceId, today) as Array<{ id: string; occurrence_date: string; duration: string; time: string }>;
  return {
    recurring: recurring ? toGoalLinkedRecurringSchedule(recurring, today) : null,
    oneOffOccurrences: oneOffOccurrences.map((row) => ({
      id: row.id,
      occurrenceDate: row.occurrence_date,
      duration: normalizeTaskDurationValue(row.duration),
      time: normalizeTaskTimeValue(row.time),
    })),
  };
}

function ensureNoActiveGoalRecurringRule(
  userId: string,
  sourceKind: "goal_task" | "goal_subtask",
  sourceId: string,
  excludeId?: string,
) {
  const existing = findActiveGoalRecurringRule(userId, sourceKind, sourceId, todayDateKey(), excludeId);
  if (!existing) return null;
  return existing;
}

const listOccurrencesRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Occurrences"],
  summary: "List occurrences on a given date (YYYY-MM-DD).",
  request: { query: DateQuerySchema },
  responses: {
    200: { description: "Occurrences", content: { "application/json": { schema: OccurrencesEnvelopeSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ErrorResponseSchema } } },
    422: { description: "Validation failed", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

occurrenceRoutes.openapi(listOccurrencesRoute, (c) => {
  const userId = c.get("userId");
  const { date } = c.req.valid("query");
  materializeRecurringOccurrences(userId, date);
  const rows = db
    .prepare(
      `${SELECT_OCCURRENCES_WITH_RESOLVED}
       WHERE o.user_id = ? AND o.occurrence_date = ?
       ORDER BY o.position ASC, o.created_at ASC`,
    )
    .all(userId, date) as OccurrenceRow[];
  return c.json({ occurrences: rows.map(toOccurrence) }, 200);
});

const getGoalLinkedScheduleRoute = createRoute({
  method: "get",
  path: "/goal-schedule",
  tags: ["Occurrences"],
  summary: "Read the current schedule for a goal task or subtask.",
  request: { query: GoalLinkedScheduleQuerySchema },
  responses: {
    200: { description: "Goal-linked schedule", content: { "application/json": { schema: GoalLinkedScheduleEnvelopeSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ErrorResponseSchema } } },
    422: { description: "Validation failed", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

occurrenceRoutes.openapi(getGoalLinkedScheduleRoute, (c) => {
  const userId = c.get("userId");
  const { goalTaskId, goalSubtaskId } = c.req.valid("query");
  const sourceKind = goalTaskId ? "goal_task" : "goal_subtask";
  const sourceId = goalTaskId ?? goalSubtaskId!;
  return c.json(loadGoalLinkedSchedule(userId, sourceKind, sourceId), 200);
});

const updateGoalLinkedScheduleRoute = createRoute({
  method: "patch",
  path: "/goal-schedule/{id}",
  tags: ["Occurrences"],
  summary: "Update a goal-linked recurring schedule.",
  request: {
    params: RecurringTaskIdParamSchema,
    body: { required: true, content: { "application/json": { schema: OccurrenceUpdateInputSchema } } },
  },
  responses: {
    200: { description: "Goal-linked schedule", content: { "application/json": { schema: GoalLinkedScheduleEnvelopeSchema } } },
    404: { description: "Recurring schedule not found", content: { "application/json": { schema: ErrorResponseSchema } } },
    409: { description: "Recurring schedule already exists", content: { "application/json": { schema: ErrorResponseSchema } } },
    422: { description: "Validation failed", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

occurrenceRoutes.openapi(updateGoalLinkedScheduleRoute, (c) => {
  const userId = c.get("userId");
  const { id } = c.req.valid("param");
  const updates = c.req.valid("json");
  const rule = db
    .prepare("SELECT * FROM recurring_tasks WHERE id = ? AND user_id = ?")
    .get(id, userId) as RecurringTaskRow | undefined;
  if (!rule || (rule.source_kind !== "goal_task" && rule.source_kind !== "goal_subtask")) {
    return c.json({ message: "Recurring schedule not found." }, 404);
  }
  const sourceId = rule.source_kind === "goal_task" ? rule.goal_task_id : rule.goal_subtask_id;
  if (!sourceId) return c.json({ message: "Recurring schedule not found." }, 404);
  const goalSourceKind = rule.source_kind;

  const nextOccurrenceDate = updates.occurrenceDate ?? rule.starts_on;
  const nextRepeatFrequency = updates.repeatFrequency ?? null;
  const nextDuration = normalizeTaskDurationValue(updates.duration ?? rule.duration);
  const nextTime = normalizeTaskTimeValue(updates.time ?? rule.time);
  const now = new Date().toISOString();

  if (nextRepeatFrequency && updates.repeatEndDate && updates.repeatEndDate < nextOccurrenceDate) {
    return c.json({ errors: { repeatEndDate: "End repeat must be on or after the start date." } }, 422);
  }

  const duplicate = nextRepeatFrequency
    ? ensureNoActiveGoalRecurringRule(userId, rule.source_kind, sourceId, id)
    : null;
  if (duplicate) {
    return c.json({ message: "This goal item already has a recurring schedule." }, 409);
  }

  db.transaction(() => {
    if (nextRepeatFrequency) {
      const nextRepeatInterval = Math.max(1, Math.trunc(updates.repeatInterval ?? rule.interval_count ?? 1));
      const nextRepeatMonthDay =
        nextRepeatFrequency === "monthly"
          ? updates.repeatMonthDay ?? (updates.repeatMonthDays?.length ? updates.repeatMonthDays[0] : null)
          : null;
      db.prepare(
        `UPDATE recurring_tasks
         SET starts_on = ?, frequency = ?, interval_count = ?, repeat_weekdays = ?, repeat_month_day = ?,
             repeat_month_days = ?, repeat_month_overflow = ?, repeat_year_months = ?, ends_on = ?,
             duration = ?, time = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      ).run(
        nextOccurrenceDate,
        nextRepeatFrequency,
        nextRepeatInterval,
        nextRepeatFrequency === "weekly" ? serializeRepeatWeekdays(updates.repeatWeekdays) : "",
        nextRepeatMonthDay,
        nextRepeatFrequency === "monthly"
          ? serializeRepeatMonthDays(updates.repeatMonthDays?.length ? updates.repeatMonthDays : nextRepeatMonthDay ? [nextRepeatMonthDay] : [])
          : "",
        nextRepeatFrequency === "monthly" ? updates.repeatMonthOverflow ?? "skip" : "skip",
        nextRepeatFrequency === "yearly"
          ? serializeRepeatYearMonths(updates.repeatYearMonths?.length ? updates.repeatYearMonths : [parseDateParts(nextOccurrenceDate).month - 1])
          : "",
        updates.repeatEndDate ?? null,
        nextDuration,
        nextTime,
        now,
        id,
        userId,
      );
      deleteFutureMaterializedOccurrences(id, userId, todayDateKey(), true, true);
      materializeRecurringEndBoundary(userId, updates.repeatEndDate);
    } else {
      const today = todayDateKey();
      db.prepare(
        `UPDATE recurring_tasks
         SET ends_on = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      ).run(addDaysToDateKey(today, -1), now, id, userId);
      deleteFutureMaterializedOccurrences(id, userId, today, true, true);
    }
  })();

  checkpointDatabase();
  return c.json(loadGoalLinkedSchedule(userId, goalSourceKind, sourceId), 200);
});

const createOccurrenceRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Occurrences"],
  summary: "Add an occurrence to a date (standalone, goal_task, or goal_subtask).",
  request: { body: { required: true, content: { "application/json": { schema: OccurrenceCreateInputSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: OccurrenceEnvelopeSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ErrorResponseSchema } } },
    404: { description: "Source not found", content: { "application/json": { schema: ErrorResponseSchema } } },
    409: { description: "Already exists / invariant violated", content: { "application/json": { schema: ErrorResponseSchema } } },
    422: { description: "Validation failed", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

occurrenceRoutes.openapi(createOccurrenceRoute, (c) => {
  const userId = c.get("userId");
  const input = c.req.valid("json");
  const now = new Date().toISOString();
  const id = newId();
  const hasRepeat = Boolean(input.repeatFrequency);
  const repeatInterval = hasRepeat ? input.repeatInterval : 1;
  const repeatWeekdays =
    input.repeatFrequency === "weekly"
      ? serializeRepeatWeekdays(input.repeatWeekdays)
      : "";
  const repeatMonthDay =
    input.repeatFrequency === "monthly"
      ? input.repeatMonthDay
      : null;
  const repeatMonthDays =
    input.repeatFrequency === "monthly"
      ? serializeRepeatMonthDays(input.repeatMonthDays?.length ? input.repeatMonthDays : input.repeatMonthDay ? [input.repeatMonthDay] : [])
      : "";
  const repeatMonthOverflow =
    input.repeatFrequency === "monthly"
      ? input.repeatMonthOverflow
      : "skip";
  const repeatYearMonths =
    input.repeatFrequency === "yearly"
      ? serializeRepeatYearMonths(input.repeatYearMonths?.length ? input.repeatYearMonths : [parseDateParts(input.occurrenceDate).month - 1])
      : "";

  // Insert at the top of the day (negative position) so newly added items
  // surface above existing ones, matching the standalone-task UX.
  const minPositionRow = db
    .prepare(
      "SELECT MIN(position) AS min_position FROM task_occurrences WHERE user_id = ? AND occurrence_date = ?",
    )
    .get(userId, input.occurrenceDate) as { min_position: number | null };
  const position = (minPositionRow.min_position ?? 1) - 1;

  let row: OccurrenceRow;
  let skipInitialOccurrence = false;
  let responseOccurrenceId = id;

  if (input.sourceKind === "standalone") {
    const recurringTaskId = input.repeatFrequency ? newId() : null;
    row = {
      id,
      user_id: userId,
      occurrence_date: input.occurrenceDate,
      source_kind: "standalone",
      goal_id: null,
      goal_task_id: null,
      goal_subtask_id: null,
      recurring_task_id: hasRepeat ? recurringTaskId : null,
      title: input.title,
      priority: input.priority ?? null,
      category: input.category ?? "",
      duration: normalizeTaskDurationValue(input.duration),
      time: normalizeTaskTimeValue(input.time),
      completed: 0,
      position,
      created_at: now,
      updated_at: now,
    };
  } else if (input.sourceKind === "goal_task") {
    const gt = db
      .prepare(
        `SELECT goal_tasks.* FROM goal_tasks
         JOIN goals ON goals.id = goal_tasks.goal_id
         WHERE goal_tasks.id = ? AND goals.user_id = ?`,
      )
      .get(input.goalTaskId, userId) as GoalTaskRow | undefined;
    if (!gt) return c.json({ message: "Goal task not found." }, 404);

    const subtaskCount = db
      .prepare("SELECT COUNT(*) AS n FROM goal_subtasks WHERE goal_task_id = ?")
      .get(input.goalTaskId) as { n: number };
    if (subtaskCount.n > 0) {
      return c.json(
        { message: "This task has subtasks — add a subtask to today instead." },
        409,
      );
    }

    // Prevent duplicate open occurrence on same date.
    const existing = db
      .prepare(
        `SELECT id FROM task_occurrences
         WHERE user_id = ? AND occurrence_date = ? AND goal_task_id = ? AND completed = 0`,
      )
      .get(userId, input.occurrenceDate, input.goalTaskId) as { id: string } | undefined;
    if (existing) {
      if (!hasRepeat) return c.json({ message: "Already added to this date." }, 409);
      skipInitialOccurrence = true;
      responseOccurrenceId = existing.id;
    }

    row = {
      id,
      user_id: userId,
      occurrence_date: input.occurrenceDate,
      source_kind: "goal_task",
      goal_id: gt.goal_id,
      goal_task_id: gt.id,
      goal_subtask_id: null,
      recurring_task_id: hasRepeat ? newId() : null,
      title: gt.title, // snapshot fallback
      priority: null,
      category: "",
      duration: normalizeTaskDurationValue(input.duration),
      time: normalizeTaskTimeValue(input.time),
      completed: 0,
      position,
      created_at: now,
      updated_at: now,
    };
  } else {
    // goal_subtask
    const gs = db
      .prepare(
        `SELECT goal_subtasks.*, goal_tasks.goal_id AS parent_goal_id
         FROM goal_subtasks
         JOIN goal_tasks ON goal_tasks.id = goal_subtasks.goal_task_id
         JOIN goals ON goals.id = goal_tasks.goal_id
         WHERE goal_subtasks.id = ? AND goals.user_id = ?`,
      )
      .get(input.goalSubtaskId, userId) as (GoalSubtaskRow & { parent_goal_id: string }) | undefined;
    if (!gs) return c.json({ message: "Goal subtask not found." }, 404);

    const existing = db
      .prepare(
        `SELECT id FROM task_occurrences
         WHERE user_id = ? AND occurrence_date = ? AND goal_subtask_id = ? AND completed = 0`,
      )
      .get(userId, input.occurrenceDate, input.goalSubtaskId) as { id: string } | undefined;
    if (existing) {
      if (!hasRepeat) return c.json({ message: "Already added to this date." }, 409);
      skipInitialOccurrence = true;
      responseOccurrenceId = existing.id;
    }

    row = {
      id,
      user_id: userId,
      occurrence_date: input.occurrenceDate,
      source_kind: "goal_subtask",
      goal_id: gs.parent_goal_id,
      goal_task_id: gs.goal_task_id,
      goal_subtask_id: gs.id,
      recurring_task_id: hasRepeat ? newId() : null,
      title: gs.title,
      priority: null,
      category: "",
      duration: normalizeTaskDurationValue(input.duration),
      time: normalizeTaskTimeValue(input.time),
      completed: 0,
      position,
      created_at: now,
      updated_at: now,
    };
  }

  // For standalone occurrences we also persist the category to the user's
  // categories pool and optionally to the default_tasks templates pool —
  // these were features of the old /api/tasks endpoint and we keep them.
  if (hasRepeat && input.repeatEndDate && input.repeatEndDate < input.occurrenceDate) {
    return c.json({ errors: { repeatEndDate: "End repeat must be on or after the start date." } }, 422);
  }

  if (hasRepeat && input.repeatFrequency && input.sourceKind !== "standalone") {
    const sourceId = input.sourceKind === "goal_task" ? input.goalTaskId : input.goalSubtaskId;
    const existingRecurring = ensureNoActiveGoalRecurringRule(userId, input.sourceKind, sourceId);
    if (existingRecurring) {
      return c.json({ message: "This goal item already has a recurring schedule." }, 409);
    }
  }

  db.transaction(() => {
    if (hasRepeat && input.repeatFrequency && row.recurring_task_id) {
      db.prepare(
        `INSERT INTO recurring_tasks
         (id, user_id, starts_on, source_kind, goal_id, goal_task_id, goal_subtask_id,
          frequency, interval_count, repeat_weekdays, repeat_month_day, repeat_month_days,
          repeat_month_overflow, repeat_year_months, ends_on, title, priority, category,
          duration, time, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        row.recurring_task_id,
        userId,
        input.occurrenceDate,
        row.source_kind,
        row.goal_id,
        row.goal_task_id,
        row.goal_subtask_id,
        input.repeatFrequency,
        repeatInterval,
        repeatWeekdays,
        repeatMonthDay,
        repeatMonthDays,
        repeatMonthOverflow,
        repeatYearMonths,
        input.repeatEndDate ?? null,
        row.title,
        row.priority,
        row.category,
        row.duration,
        row.time,
        row.created_at,
        row.updated_at,
      );
    }

    if (!skipInitialOccurrence) {
      db.prepare(
        `INSERT INTO task_occurrences
         (id, user_id, occurrence_date, source_kind, goal_id, goal_task_id, goal_subtask_id,
          recurring_task_id, title, priority, category, duration, time, completed, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        row.id,
        row.user_id,
        row.occurrence_date,
        row.source_kind,
        row.goal_id,
        row.goal_task_id,
        row.goal_subtask_id,
        row.recurring_task_id ?? null,
        row.title,
        row.priority,
        row.category,
        row.duration,
        row.time,
        row.completed,
        row.position,
        row.created_at,
        row.updated_at,
      );
    }

    if (input.sourceKind === "standalone" && !skipInitialOccurrence) {
      saveTaskCategory(userId, row.category);
      if (input.saveToDefault) {
        db.prepare(
          `INSERT INTO default_tasks (id, user_id, title, priority, category, duration, time, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(newId(), userId, row.title, row.priority, row.category, row.duration, row.time, row.created_at);
      }
    }
  })();

  if (hasRepeat) {
    materializeRecurringEndBoundary(userId, input.repeatEndDate);
  }

  const fetched = db
    .prepare(`${SELECT_OCCURRENCES_WITH_RESOLVED} WHERE o.id = ? AND o.user_id = ?`)
    .get(responseOccurrenceId, userId) as OccurrenceRow;
  return c.json({ occurrence: toOccurrence(fetched) }, 201);
});

const updateOccurrenceRoute = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["Occurrences"],
  summary: "Update an occurrence (fields and/or completion).",
  request: {
    params: OccurrenceIdParamSchema,
    body: { required: true, content: { "application/json": { schema: OccurrenceUpdateInputSchema } } },
  },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: OccurrenceEnvelopeSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorResponseSchema } } },
    409: { description: "Already exists / invariant violated", content: { "application/json": { schema: ErrorResponseSchema } } },
    422: { description: "Validation failed", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

occurrenceRoutes.openapi(updateOccurrenceRoute, (c) => {
  const userId = c.get("userId");
  const { id } = c.req.valid("param");
  const updates = c.req.valid("json");

  const existing = db
    .prepare("SELECT * FROM task_occurrences WHERE id = ? AND user_id = ?")
    .get(id, userId) as OccurrenceRow | undefined;
  if (!existing) return c.json({ message: "Occurrence not found." }, 404);

  const isGoalLinked = existing.source_kind !== "standalone";
  const nextOccurrenceDate = updates.occurrenceDate ?? existing.occurrence_date;
  const nextTitle = !isGoalLinked && updates.title !== undefined ? updates.title : existing.title;
  const nextPriority = !isGoalLinked && updates.priority !== undefined ? updates.priority : existing.priority;
  const nextCategory = !isGoalLinked && updates.category !== undefined ? updates.category : existing.category;
  const nextDuration =
    updates.duration !== undefined
      ? normalizeTaskDurationValue(updates.duration)
      : normalizeTaskDurationValue(existing.duration);
  const nextTime =
    updates.time !== undefined
      ? normalizeTaskTimeValue(updates.time)
      : normalizeTaskTimeValue(existing.time);
  const nextCompleted =
    typeof updates.completed === "boolean" ? (updates.completed ? 1 : 0) : existing.completed;
  const now = new Date().toISOString();
  const isMovingDate = nextOccurrenceDate !== existing.occurrence_date;
  const hasRecurrenceUpdate = Object.prototype.hasOwnProperty.call(updates, "repeatFrequency");
  const recurrenceScope = updates.recurrenceUpdateScope ?? "single";
  const nextRepeatFrequency = updates.repeatFrequency ?? null;
  const nextRepeatInterval = updates.repeatFrequency ? updates.repeatInterval ?? 1 : 1;
  const nextRepeatWeekdays =
    updates.repeatFrequency === "weekly" ? serializeRepeatWeekdays(updates.repeatWeekdays) : "";
  const nextRepeatMonthDay =
    updates.repeatFrequency === "monthly"
      ? updates.repeatMonthDay ?? (updates.repeatMonthDays?.length ? updates.repeatMonthDays[0] : null)
      : null;
  const nextRepeatMonthDays =
    updates.repeatFrequency === "monthly"
      ? serializeRepeatMonthDays(updates.repeatMonthDays?.length ? updates.repeatMonthDays : nextRepeatMonthDay ? [nextRepeatMonthDay] : [])
      : "";
  const nextRepeatMonthOverflow =
    updates.repeatFrequency === "monthly" ? updates.repeatMonthOverflow ?? "skip" : "skip";
  const nextRepeatYearMonths =
    updates.repeatFrequency === "yearly"
      ? serializeRepeatYearMonths(updates.repeatYearMonths?.length ? updates.repeatYearMonths : [parseDateParts(nextOccurrenceDate).month - 1])
      : "";

  if (hasRecurrenceUpdate && nextRepeatFrequency && updates.repeatEndDate && updates.repeatEndDate < nextOccurrenceDate) {
    return c.json({ errors: { repeatEndDate: "End repeat must be on or after the start date." } }, 422);
  }

  if (isMovingDate && nextCompleted === 0) {
    if (existing.source_kind === "goal_task" && existing.goal_task_id) {
      const duplicate = db
        .prepare(
          `SELECT id FROM task_occurrences
           WHERE user_id = ? AND occurrence_date = ? AND goal_task_id = ? AND completed = 0 AND id <> ?`,
        )
        .get(userId, nextOccurrenceDate, existing.goal_task_id, id) as { id: string } | undefined;
      if (duplicate) return c.json({ message: "Already added to this date." }, 409);
    } else if (existing.source_kind === "goal_subtask" && existing.goal_subtask_id) {
      const duplicate = db
        .prepare(
          `SELECT id FROM task_occurrences
           WHERE user_id = ? AND occurrence_date = ? AND goal_subtask_id = ? AND completed = 0 AND id <> ?`,
        )
        .get(userId, nextOccurrenceDate, existing.goal_subtask_id, id) as { id: string } | undefined;
      if (duplicate) return c.json({ message: "Already added to this date." }, 409);
    }
  }

  const nextPosition = isMovingDate
    ? ((db
        .prepare(
          "SELECT MIN(position) AS min_position FROM task_occurrences WHERE user_id = ? AND occurrence_date = ?",
        )
        .get(userId, nextOccurrenceDate) as { min_position: number | null }).min_position ?? 1) - 1
    : existing.position;

  db.transaction(() => {
    if (nextCategory) saveTaskCategory(userId, nextCategory);

    let nextRecurringTaskId = existing.recurring_task_id ?? null;

    if (hasRecurrenceUpdate) {
      if (nextRepeatFrequency) {
        if (existing.recurring_task_id) {
          db.prepare(
            `UPDATE recurring_tasks
             SET starts_on = ?, frequency = ?, interval_count = ?, repeat_weekdays = ?, repeat_month_day = ?,
                 repeat_month_days = ?, repeat_month_overflow = ?, repeat_year_months = ?, ends_on = ?,
                 title = ?, priority = ?, category = ?, duration = ?, time = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`,
          ).run(
            nextOccurrenceDate,
            nextRepeatFrequency,
            nextRepeatInterval,
            nextRepeatWeekdays,
            nextRepeatMonthDay,
            nextRepeatMonthDays,
            nextRepeatMonthOverflow,
            nextRepeatYearMonths,
            updates.repeatEndDate ?? null,
            nextTitle,
            nextPriority,
            nextCategory,
            nextDuration,
            nextTime,
            now,
            existing.recurring_task_id,
            userId,
          );
          if (recurrenceScope === "series") {
            deleteFutureMaterializedOccurrences(existing.recurring_task_id, userId, existing.occurrence_date, false, true);
          }
        } else {
          nextRecurringTaskId = newId();
          db.prepare(
            `INSERT INTO recurring_tasks
             (id, user_id, starts_on, source_kind, goal_id, goal_task_id, goal_subtask_id,
              frequency, interval_count, repeat_weekdays, repeat_month_day, repeat_month_days,
              repeat_month_overflow, repeat_year_months, ends_on, title, priority, category, duration, time, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            nextRecurringTaskId,
            userId,
            nextOccurrenceDate,
            existing.source_kind,
            existing.goal_id,
            existing.goal_task_id,
            existing.goal_subtask_id,
            nextRepeatFrequency,
            nextRepeatInterval,
            nextRepeatWeekdays,
            nextRepeatMonthDay,
            nextRepeatMonthDays,
            nextRepeatMonthOverflow,
            nextRepeatYearMonths,
            updates.repeatEndDate ?? null,
            nextTitle,
            nextPriority,
            nextCategory,
            nextDuration,
            nextTime,
            now,
            now,
          );
        }
      } else if (existing.recurring_task_id && recurrenceScope === "series") {
        db.prepare(
          `UPDATE recurring_tasks
           SET ends_on = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`,
        ).run(addDaysToDateKey(existing.occurrence_date, -1), now, existing.recurring_task_id, userId);
        deleteFutureMaterializedOccurrences(existing.recurring_task_id, userId, existing.occurrence_date, false, true);
        nextRecurringTaskId = null;
      } else if (existing.recurring_task_id) {
        db.prepare(
          `INSERT OR IGNORE INTO recurring_task_exceptions
           (recurring_task_id, occurrence_date, created_at)
           VALUES (?, ?, ?)`,
        ).run(existing.recurring_task_id, existing.occurrence_date, now);
        nextRecurringTaskId = null;
      }
    }

    db.prepare(
      `UPDATE task_occurrences
       SET occurrence_date = ?, recurring_task_id = ?, title = ?, priority = ?, category = ?, duration = ?, time = ?, completed = ?, position = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).run(
      nextOccurrenceDate,
      nextRecurringTaskId,
      nextTitle,
      nextPriority,
      nextCategory,
      nextDuration,
      nextTime,
      nextCompleted,
      nextPosition,
      now,
      id,
      userId,
    );

    // Propagate to parent goal_task/goal_subtask if asked to.
    if (
      updates.completionScope === "whole" &&
      typeof updates.completed === "boolean" &&
      updates.completed === true
    ) {
      if (existing.source_kind === "goal_task" && existing.goal_task_id) {
        db.prepare(
          `UPDATE goal_tasks
           SET status = 'done', updated_at = ?
           WHERE id = ?
             AND EXISTS (
               SELECT 1 FROM goals
               WHERE goals.id = goal_tasks.goal_id
                 AND goals.user_id = ?
             )`,
        ).run(now, existing.goal_task_id, userId);
      } else if (existing.source_kind === "goal_subtask" && existing.goal_subtask_id) {
        db.prepare(
          `UPDATE goal_subtasks
           SET completed = 1, updated_at = ?
           WHERE id = ?
             AND EXISTS (
               SELECT 1
               FROM goal_tasks
               JOIN goals ON goals.id = goal_tasks.goal_id
               WHERE goal_tasks.id = goal_subtasks.goal_task_id
                 AND goals.user_id = ?
             )`,
        ).run(now, existing.goal_subtask_id, userId);
      }
    }
  })();

  if (hasRecurrenceUpdate && nextRepeatFrequency) {
    materializeRecurringEndBoundary(userId, updates.repeatEndDate);
  }

  const fetched = db
    .prepare(`${SELECT_OCCURRENCES_WITH_RESOLVED} WHERE o.id = ? AND o.user_id = ?`)
    .get(id, userId) as OccurrenceRow;
  return c.json({ occurrence: toOccurrence(fetched) }, 200);
});

const reorderOccurrencesRoute = createRoute({
  method: "post",
  path: "/reorder",
  tags: ["Occurrences"],
  summary: "Reorder occurrences within a single date.",
  request: { body: { required: true, content: { "application/json": { schema: OccurrenceReorderInputSchema } } } },
  responses: {
    200: { description: "Reordered", content: { "application/json": { schema: OkResponseSchema } } },
    422: { description: "Validation failed", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

occurrenceRoutes.openapi(reorderOccurrencesRoute, (c) => {
  const userId = c.get("userId");
  const { ids, occurrenceDate } = c.req.valid("json");
  const update = db.prepare(
    "UPDATE task_occurrences SET position = ? WHERE id = ? AND user_id = ? AND occurrence_date = ?",
  );
  db.transaction((items: string[]) => {
    items.forEach((occId, index) => update.run(index, occId, userId, occurrenceDate));
  })(ids);
  return c.json({ ok: true as const }, 200);
});

const deleteOccurrenceRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Occurrences"],
  summary: "Remove an occurrence from a date.",
  request: { params: OccurrenceIdParamSchema, query: OccurrenceDeleteQuerySchema },
  responses: {
    200: { description: "Deleted", content: { "application/json": { schema: OkResponseSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

occurrenceRoutes.openapi(deleteOccurrenceRoute, (c) => {
  const userId = c.get("userId");
  const { id } = c.req.valid("param");
  const { recurrenceDeleteScope } = c.req.valid("query");
  const existing = db
    .prepare("SELECT id, recurring_task_id, occurrence_date FROM task_occurrences WHERE id = ? AND user_id = ?")
    .get(id, userId) as Pick<OccurrenceRow, "id" | "recurring_task_id" | "occurrence_date"> | undefined;
  if (!existing) return c.json({ message: "Occurrence not found." }, 404);
  const info = db.transaction(() => {
    if (existing.recurring_task_id) {
      const now = new Date().toISOString();
      if (recurrenceDeleteScope === "series") {
        db.prepare("DELETE FROM task_occurrences WHERE user_id = ? AND recurring_task_id = ?").run(userId, existing.recurring_task_id);
        db.prepare("DELETE FROM recurring_tasks WHERE id = ? AND user_id = ?").run(existing.recurring_task_id, userId);
        return { changes: 1 };
      }
      if (recurrenceDeleteScope === "future") {
        db.prepare(
          `UPDATE recurring_tasks
           SET ends_on = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`,
        ).run(addDaysToDateKey(existing.occurrence_date, -1), now, existing.recurring_task_id, userId);
        deleteFutureMaterializedOccurrences(existing.recurring_task_id, userId, existing.occurrence_date, true);
        return { changes: 1 };
      }
      db.prepare(
        `INSERT OR IGNORE INTO recurring_task_exceptions
         (recurring_task_id, occurrence_date, created_at)
         VALUES (?, ?, ?)`,
      ).run(existing.recurring_task_id, existing.occurrence_date, now);
    }
    return db.prepare("DELETE FROM task_occurrences WHERE id = ? AND user_id = ?").run(id, userId);
  })();
  if (info.changes === 0) return c.json({ message: "Occurrence not found." }, 404);
  checkpointDatabase();
  return c.json({ ok: true as const }, 200);
});
