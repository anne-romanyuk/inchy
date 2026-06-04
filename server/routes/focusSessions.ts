import { createRoute, z } from "@hono/zod-openapi";
import { db } from "../db";
import { newId } from "../lib/ids";
import { toFocusSession, type FocusSessionRow } from "../lib/mappers";
import { requireUser, type AuthEnv } from "../middleware/auth";
import { createApp } from "../openapi/hono";
import {
  ActiveFocusSessionEnvelopeSchema,
  ErrorResponseSchema,
  FocusSessionCreateInputSchema,
  FocusSessionEnvelopeSchema,
  FocusSessionFinishInputSchema,
} from "../../shared/schemas";

export const focusSessionRoutes = createApp<AuthEnv>();
focusSessionRoutes.use("*", requireUser);

const FocusSessionIdParamSchema = z.object({
  id: z.string().min(1).openapi({ param: { name: "id", in: "path" }, example: "b88b43fb22fb31e7b1bd4ea5" }),
});

function abandonActiveSessions(userId: string, now: string) {
  db.prepare(
    `UPDATE focus_sessions
     SET ended_at = ?, status = 'abandoned',
         duration_seconds = CAST((julianday(?) - julianday(started_at)) * 86400 AS INTEGER)
     WHERE user_id = ? AND ended_at IS NULL`,
  ).run(now, now, userId);
}

const activeFocusSessionRoute = createRoute({
  method: "get",
  path: "/active",
  tags: ["Focus sessions"],
  summary: "Get the user's active focus session",
  responses: {
    200: { description: "Active focus session", content: { "application/json": { schema: ActiveFocusSessionEnvelopeSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

focusSessionRoutes.openapi(activeFocusSessionRoute, (c) => {
  const userId = c.get("userId");
  const row = db
    .prepare("SELECT * FROM focus_sessions WHERE user_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1")
    .get(userId) as FocusSessionRow | undefined;

  return c.json({ session: row ? toFocusSession(row) : null }, 200);
});

const createFocusSessionRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Focus sessions"],
  summary: "Start a focus session",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: FocusSessionCreateInputSchema } },
    },
  },
  responses: {
    201: { description: "Focus session started", content: { "application/json": { schema: FocusSessionEnvelopeSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ErrorResponseSchema } } },
    404: { description: "Task not found", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

focusSessionRoutes.openapi(createFocusSessionRoute, (c) => {
  const userId = c.get("userId");
  const input = c.req.valid("json");
  const now = new Date().toISOString();
  const id = newId();
  const taskId = input.taskId ?? null;

  if (taskId) {
    const task = db
      .prepare("SELECT id FROM task_occurrences WHERE id = ? AND user_id = ?")
      .get(taskId, userId) as { id: string } | undefined;
    if (!task) return c.json({ message: "Task not found." }, 404);
  }

  const create = db.transaction(() => {
    abandonActiveSessions(userId, now);
    db.prepare(
      `INSERT INTO focus_sessions
       (id, user_id, task_id, started_at, planned_seconds, duration_seconds, mode, label, status)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'active')`,
    ).run(id, userId, taskId, now, input.plannedSeconds, input.mode, input.label ?? "");
  });

  create();

  const row = db.prepare("SELECT * FROM focus_sessions WHERE id = ? AND user_id = ?").get(id, userId) as FocusSessionRow;
  return c.json({ session: toFocusSession(row) }, 201);
});

const finishFocusSessionRoute = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["Focus sessions"],
  summary: "Complete, skip, or abandon a focus session",
  request: {
    params: FocusSessionIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: FocusSessionFinishInputSchema } },
    },
  },
  responses: {
    200: { description: "Focus session updated", content: { "application/json": { schema: FocusSessionEnvelopeSchema } } },
    404: { description: "Focus session not found", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

focusSessionRoutes.openapi(finishFocusSessionRoute, (c) => {
  const userId = c.get("userId");
  const { id } = c.req.valid("param");
  const { status, durationSeconds, taskDurations } = c.req.valid("json");
  const existing = db
    .prepare("SELECT * FROM focus_sessions WHERE id = ? AND user_id = ?")
    .get(id, userId) as FocusSessionRow | undefined;

  if (!existing) {
    return c.json({ message: "Focus session not found." }, 404);
  }

  const now = new Date().toISOString();
  const computedDuration = Math.max(0, Math.round((Date.now() - new Date(existing.started_at).getTime()) / 1000));
  const finalDuration = durationSeconds ?? Math.min(computedDuration, Math.max(existing.planned_seconds, computedDuration));

  const finish = db.transaction(() => {
    const hasTaskDurations = Array.isArray(taskDurations);

    db.prepare(
      `UPDATE focus_sessions
       SET ended_at = ?, duration_seconds = ?, status = ?, task_id = CASE WHEN ? THEN NULL ELSE task_id END
       WHERE id = ? AND user_id = ?`,
    ).run(now, finalDuration, status, hasTaskDurations ? 1 : 0, id, userId);

    if (hasTaskDurations) {
      db.prepare("DELETE FROM focus_task_segments WHERE focus_session_id = ? AND user_id = ?").run(id, userId);

      const insertSegment = db.prepare(
        `INSERT INTO focus_task_segments
         (id, focus_session_id, user_id, task_id, duration_seconds, created_at)
         SELECT ?, ?, ?, task_occurrences.id, ?, ?
         FROM task_occurrences
         WHERE task_occurrences.id = ? AND task_occurrences.user_id = ?`,
      );

      const totals = new Map<string, number>();
      for (const item of taskDurations ?? []) {
        if (item.durationSeconds <= 0) continue;
        totals.set(item.taskId, (totals.get(item.taskId) ?? 0) + item.durationSeconds);
      }

      for (const [taskId, seconds] of totals) {
        insertSegment.run(newId(), id, userId, seconds, now, taskId, userId);
      }
    }
  });

  finish();

  const row = db.prepare("SELECT * FROM focus_sessions WHERE id = ? AND user_id = ?").get(id, userId) as FocusSessionRow;
  return c.json({ session: toFocusSession(row) }, 200);
});
