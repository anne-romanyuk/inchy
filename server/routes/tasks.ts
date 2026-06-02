// After migration 015, the legacy `tasks` table is gone. Standalone day
// tasks live in `task_occurrences` with source_kind='standalone' and are
// served by /api/occurrences. The only things left in this file:
//   * GET /api/tasks/categories — listing the saved category names. This
//     is stateless w.r.t. tasks/occurrences and we keep the path stable
//     so existing clients don't break.
//   * /api/default-tasks — templates pool, unchanged.
import { createRoute, z } from "@hono/zod-openapi";
import { db } from "../db";
import { requireUser, type AuthEnv } from "../middleware/auth";
import { toDefaultTask, type DefaultTaskRow } from "../lib/mappers";
import { createApp } from "../openapi/hono";
import {
  DefaultTasksEnvelopeSchema,
  ErrorResponseSchema,
  OkResponseSchema,
  TaskCategoriesEnvelopeSchema,
} from "../../shared/schemas";

export const taskRoutes = createApp<AuthEnv>();
taskRoutes.use("*", requireUser);

const TaskIdParamSchema = z.object({
  id: z.string().min(1).openapi({ param: { name: "id", in: "path" }, example: "default_123" }),
});

const listTaskCategoriesRoute = createRoute({
  method: "get",
  path: "/categories",
  tags: ["Tasks"],
  summary: "List the user's saved task categories",
  responses: {
    200: { description: "Task categories", content: { "application/json": { schema: TaskCategoriesEnvelopeSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

taskRoutes.openapi(listTaskCategoriesRoute, (c) => {
  const userId = c.get("userId");
  const rows = db
    .prepare("SELECT name FROM task_categories WHERE user_id = ? ORDER BY lower(name)")
    .all(userId) as Array<{ name: string }>;
  return c.json({ categories: rows.map((row) => row.name) }, 200);
});

export const defaultTaskRoutes = createApp<AuthEnv>();
defaultTaskRoutes.use("*", requireUser);

const listDefaultTasksRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Default tasks"],
  summary: "List the user's default task pool",
  responses: {
    200: { description: "Default tasks", content: { "application/json": { schema: DefaultTasksEnvelopeSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

defaultTaskRoutes.openapi(listDefaultTasksRoute, (c) => {
  const userId = c.get("userId");
  const rows = db
    .prepare("SELECT * FROM default_tasks WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as DefaultTaskRow[];
  return c.json({ defaultTasks: rows.map(toDefaultTask) }, 200);
});

const deleteDefaultTaskRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Default tasks"],
  summary: "Delete a task from the user's default pool",
  request: { params: TaskIdParamSchema },
  responses: {
    200: { description: "Deleted", content: { "application/json": { schema: OkResponseSchema } } },
    404: { description: "Default task not found", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

defaultTaskRoutes.openapi(deleteDefaultTaskRoute, (c) => {
  const userId = c.get("userId");
  const { id } = c.req.valid("param");
  const info = db.prepare("DELETE FROM default_tasks WHERE id = ? AND user_id = ?").run(id, userId);
  if (info.changes === 0) return c.json({ message: "Default task not found." }, 404);
  return c.json({ ok: true as const }, 200);
});
