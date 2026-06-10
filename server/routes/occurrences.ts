import { createRoute, z } from "@hono/zod-openapi";
import { checkpointDatabase, db } from "../db";
import { assignCategoryColor } from "../lib/categoryColors";
import { newId } from "../lib/ids";
import { toOccurrence, type OccurrenceRow, type GoalTaskRow, type GoalSubtaskRow } from "../lib/mappers";
import { requireUser, type AuthEnv } from "../middleware/auth";
import { createApp } from "../openapi/hono";
import {
  ErrorResponseSchema,
  OccurrenceCreateInputSchema,
  OccurrenceEnvelopeSchema,
  OccurrenceReorderInputSchema,
  OccurrenceUpdateInputSchema,
  OccurrencesEnvelopeSchema,
  OkResponseSchema,
} from "../../shared/schemas";
import { normalizeTaskDurationValue } from "../../shared/duration";
import { normalizeTaskTimeValue } from "../../shared/time";

export const occurrenceRoutes = createApp<AuthEnv>();
occurrenceRoutes.use("*", requireUser);

const OccurrenceIdParamSchema = z.object({
  id: z.string().min(1).openapi({ param: { name: "id", in: "path" }, example: "occ_123" }),
});

const DateQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.")
    .openapi({ param: { name: "date", in: "query" }, example: "2026-05-28" }),
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
`;

/** Persist a category to the user's task_categories pool. No-op on empty. */
function saveTaskCategory(userId: string, category: string) {
  const name = category.trim();
  if (!name) return;
  assignCategoryColor(db, "task_categories", userId, name);
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
  const rows = db
    .prepare(
      `${SELECT_OCCURRENCES_WITH_RESOLVED}
       WHERE o.user_id = ? AND o.occurrence_date = ?
       ORDER BY o.position ASC, o.created_at ASC`,
    )
    .all(userId, date) as OccurrenceRow[];
  return c.json({ occurrences: rows.map(toOccurrence) }, 200);
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

  // Insert at the top of the day (negative position) so newly added items
  // surface above existing ones, matching the standalone-task UX.
  const minPositionRow = db
    .prepare(
      "SELECT MIN(position) AS min_position FROM task_occurrences WHERE user_id = ? AND occurrence_date = ?",
    )
    .get(userId, input.occurrenceDate) as { min_position: number | null };
  const position = (minPositionRow.min_position ?? 1) - 1;

  let row: OccurrenceRow;

  if (input.sourceKind === "standalone") {
    row = {
      id,
      user_id: userId,
      occurrence_date: input.occurrenceDate,
      source_kind: "standalone",
      goal_id: null,
      goal_task_id: null,
      goal_subtask_id: null,
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
    if (existing) return c.json({ message: "Already added to this date." }, 409);

    row = {
      id,
      user_id: userId,
      occurrence_date: input.occurrenceDate,
      source_kind: "goal_task",
      goal_id: gt.goal_id,
      goal_task_id: gt.id,
      goal_subtask_id: null,
      title: gt.title, // snapshot fallback
      priority: null,
      category: "",
      duration: "",
      time: "",
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
    if (existing) return c.json({ message: "Already added to this date." }, 409);

    row = {
      id,
      user_id: userId,
      occurrence_date: input.occurrenceDate,
      source_kind: "goal_subtask",
      goal_id: gs.parent_goal_id,
      goal_task_id: gs.goal_task_id,
      goal_subtask_id: gs.id,
      title: gs.title,
      priority: null,
      category: "",
      duration: "",
      time: "",
      completed: 0,
      position,
      created_at: now,
      updated_at: now,
    };
  }

  // For standalone occurrences we also persist the category to the user's
  // categories pool and optionally to the default_tasks templates pool —
  // these were features of the old /api/tasks endpoint and we keep them.
  db.transaction(() => {
    db.prepare(
      `INSERT INTO task_occurrences
       (id, user_id, occurrence_date, source_kind, goal_id, goal_task_id, goal_subtask_id,
        title, priority, category, duration, time, completed, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      row.id,
      row.user_id,
      row.occurrence_date,
      row.source_kind,
      row.goal_id,
      row.goal_task_id,
      row.goal_subtask_id,
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

    if (input.sourceKind === "standalone") {
      saveTaskCategory(userId, row.category);
      if (input.saveToDefault) {
        db.prepare(
          `INSERT INTO default_tasks (id, user_id, title, priority, category, duration, time, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(newId(), userId, row.title, row.priority, row.category, row.duration, row.time, row.created_at);
      }
    }
  })();

  const fetched = db
    .prepare(`${SELECT_OCCURRENCES_WITH_RESOLVED} WHERE o.id = ? AND o.user_id = ?`)
    .get(row.id, userId) as OccurrenceRow;
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
  const nextCategory = updates.category !== undefined ? updates.category : existing.category;
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
    db.prepare(
      `UPDATE task_occurrences
       SET occurrence_date = ?, title = ?, priority = ?, category = ?, duration = ?, time = ?, completed = ?, position = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).run(
      nextOccurrenceDate,
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
  request: { params: OccurrenceIdParamSchema },
  responses: {
    200: { description: "Deleted", content: { "application/json": { schema: OkResponseSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

occurrenceRoutes.openapi(deleteOccurrenceRoute, (c) => {
  const userId = c.get("userId");
  const { id } = c.req.valid("param");
  const info = db.prepare("DELETE FROM task_occurrences WHERE id = ? AND user_id = ?").run(id, userId);
  if (info.changes === 0) return c.json({ message: "Occurrence not found." }, 404);
  checkpointDatabase();
  return c.json({ ok: true as const }, 200);
});
