// After migration 015, the legacy `tasks` table is gone. Standalone day
// tasks live in `task_occurrences` with source_kind='standalone' and are
// served by /api/occurrences. The only things left in this file:
//   * GET /api/tasks/categories — listing the saved category names. This
//     is stateless w.r.t. tasks/occurrences and we keep the path stable
//     so existing clients don't break.
//   * /api/default-tasks — templates pool, unchanged.
import { createRoute, z } from "@hono/zod-openapi";
import { db } from "../db";
import { listCategoryRows } from "../lib/categoryColors";
import { requireUser, type AuthEnv } from "../middleware/auth";
import { toDefaultTask, type DefaultTaskRow } from "../lib/mappers";
import { createApp } from "../openapi/hono";
import {
  DefaultTasksEnvelopeSchema,
  ErrorResponseSchema,
  OkResponseSchema,
  TaskCategoryDeleteEnvelopeSchema,
  TaskCategoryDeleteInputSchema,
  TaskCategoryEnvelopeSchema,
  TaskCategoryUpdateInputSchema,
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
  return c.json({ categories: listCategoryRows(db, "task_categories", userId) }, 200);
});

const updateTaskCategoryRoute = createRoute({
  method: "patch",
  path: "/categories",
  tags: ["Tasks"],
  summary: "Rename a task category or update its color",
  request: {
    body: { required: true, content: { "application/json": { schema: TaskCategoryUpdateInputSchema } } },
  },
  responses: {
    200: { description: "Updated category", content: { "application/json": { schema: TaskCategoryEnvelopeSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ErrorResponseSchema } } },
    404: { description: "Category not found", content: { "application/json": { schema: ErrorResponseSchema } } },
    409: { description: "Category already exists", content: { "application/json": { schema: ErrorResponseSchema } } },
    422: { description: "Validation failed", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

taskRoutes.openapi(updateTaskCategoryRoute, (c) => {
  const userId = c.get("userId");
  const { name, nextName, color } = c.req.valid("json");
  const existing = db
    .prepare("SELECT id, name, color FROM task_categories WHERE user_id = ? AND lower(name) = lower(?) ORDER BY created_at ASC LIMIT 1")
    .get(userId, name) as { id: string; name: string; color: string } | undefined;

  if (!existing) return c.json({ message: "Category not found." }, 404);

  const conflict = db
    .prepare("SELECT name FROM task_categories WHERE user_id = ? AND lower(name) = lower(?) AND id <> ? LIMIT 1")
    .get(userId, nextName, existing.id) as { name: string } | undefined;

  if (conflict) return c.json({ message: "A category with this name already exists." }, 409);

  const now = new Date().toISOString();
  const save = db.transaction(() => {
    const categoryInfo = db
      .prepare("UPDATE task_categories SET name = ?, color = ? WHERE user_id = ? AND id = ?")
      .run(nextName, color, userId, existing.id);

    if (categoryInfo.changes === 0) return false;

    db.prepare(
      `UPDATE task_occurrences
       SET category = ?, updated_at = ?
       WHERE user_id = ? AND source_kind = 'standalone' AND lower(category) = lower(?)`,
    ).run(nextName, now, userId, existing.name);

    db.prepare("UPDATE default_tasks SET category = ? WHERE user_id = ? AND lower(category) = lower(?)").run(
      nextName,
      userId,
      existing.name,
    );

    db.prepare(
      `UPDATE recurring_tasks
       SET category = ?, updated_at = ?
       WHERE user_id = ? AND lower(category) = lower(?)`,
    ).run(nextName, now, userId, existing.name);

    return true;
  });

  if (!save()) return c.json({ message: "Category not found." }, 404);
  return c.json({ category: { name: nextName, color } }, 200);
});

const deleteTaskCategoryRoute = createRoute({
  method: "delete",
  path: "/categories",
  tags: ["Tasks"],
  summary: "Delete a task category and either detach or delete related tasks",
  request: {
    body: { required: true, content: { "application/json": { schema: TaskCategoryDeleteInputSchema } } },
  },
  responses: {
    200: { description: "Deleted category", content: { "application/json": { schema: TaskCategoryDeleteEnvelopeSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ErrorResponseSchema } } },
    404: { description: "Category not found", content: { "application/json": { schema: ErrorResponseSchema } } },
    422: { description: "Validation failed", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

taskRoutes.openapi(deleteTaskCategoryRoute, (c) => {
  const userId = c.get("userId");
  const { name, mode } = c.req.valid("json");
  const existing = db
    .prepare("SELECT id, name FROM task_categories WHERE user_id = ? AND lower(name) = lower(?) ORDER BY created_at ASC LIMIT 1")
    .get(userId, name) as { id: string; name: string } | undefined;

  if (!existing) return c.json({ message: "Category not found." }, 404);

  const now = new Date().toISOString();
  const remove = db.transaction(() => {
    let affectedTasks = 0;

    if (mode === "delete-tasks") {
      affectedTasks += db
        .prepare("DELETE FROM task_occurrences WHERE user_id = ? AND source_kind = 'standalone' AND lower(category) = lower(?)")
        .run(userId, existing.name).changes;
      affectedTasks += db
        .prepare("DELETE FROM default_tasks WHERE user_id = ? AND lower(category) = lower(?)")
        .run(userId, existing.name).changes;
      db.prepare("DELETE FROM recurring_tasks WHERE user_id = ? AND lower(category) = lower(?)").run(
        userId,
        existing.name,
      );
    } else {
      affectedTasks += db
        .prepare(
          `UPDATE task_occurrences
           SET category = '', updated_at = ?
           WHERE user_id = ? AND source_kind = 'standalone' AND lower(category) = lower(?)`,
        )
        .run(now, userId, existing.name).changes;
      affectedTasks += db
        .prepare("UPDATE default_tasks SET category = '' WHERE user_id = ? AND lower(category) = lower(?)")
        .run(userId, existing.name).changes;
      db.prepare(
        `UPDATE recurring_tasks
         SET category = '', updated_at = ?
         WHERE user_id = ? AND lower(category) = lower(?)`,
      ).run(now, userId, existing.name);
    }

    db.prepare("DELETE FROM task_categories WHERE user_id = ? AND id = ?").run(userId, existing.id);
    return affectedTasks;
  });

  return c.json({ ok: true as const, affectedTasks: remove() }, 200);
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
