import { createRoute, z } from "@hono/zod-openapi";
import { checkpointDatabase, db } from "../db";
import { newId } from "../lib/ids";
import { toGoal, type GoalRow, type GoalTaskRow, type GoalSubtaskRow } from "../lib/mappers";
import { requireUser, type AuthEnv } from "../middleware/auth";
import { createApp } from "../openapi/hono";
import {
  ErrorResponseSchema,
  GoalCreateInputSchema,
  GoalEnvelopeSchema,
  GoalsEnvelopeSchema,
  GoalUpdateInputSchema,
  OkResponseSchema,
} from "../../shared/schemas";

type GoalTaskInput = {
  id?: string;
  title: string;
  deadline?: string | null;
  completed?: boolean;
  iconId?: string | null;
  note?: string | null;
  subtasks?: Array<{ id?: string; title: string; completed?: boolean }>;
};

function loadSubtasksByTask(goalId: string): Map<string, GoalSubtaskRow[]> {
  const rows = db
    .prepare(
      `SELECT goal_subtasks.* FROM goal_subtasks
       JOIN goal_tasks ON goal_tasks.id = goal_subtasks.goal_task_id
       WHERE goal_tasks.goal_id = ?
       ORDER BY goal_subtasks.position ASC, goal_subtasks.created_at ASC`,
    )
    .all(goalId) as GoalSubtaskRow[];
  const map = new Map<string, GoalSubtaskRow[]>();
  for (const row of rows) {
    const bucket = map.get(row.goal_task_id) ?? [];
    bucket.push(row);
    map.set(row.goal_task_id, bucket);
  }
  return map;
}

export const goalRoutes = createApp<AuthEnv>();
goalRoutes.use("*", requireUser);

const GoalIdParamSchema = z.object({
  id: z.string().min(1).openapi({ param: { name: "id", in: "path" }, example: "goal_123" }),
});

function readGoal(userId: string, id: string) {
  const goal = db.prepare("SELECT * FROM goals WHERE id = ? AND user_id = ?").get(id, userId) as GoalRow | undefined;
  if (!goal) return null;
  const tasks = db
    .prepare("SELECT * FROM goal_tasks WHERE goal_id = ? ORDER BY position ASC, created_at ASC")
    .all(id) as GoalTaskRow[];
  const subtasks = loadSubtasksByTask(id);
  return toGoal(goal, tasks, subtasks);
}

/**
 * Detach (rather than cascade-delete) any task_occurrences tied to goal items
 * that are about to be removed: flip them to `standalone`, drop the goal links,
 * and snapshot the live title. The occurrence is the user's actual record of
 * work — it may be completed on past days and have focus sessions attached — so
 * deleting a goal/task/subtask must NOT erase that history. Instead the Today
 * entry lives on as a plain standalone task.
 *
 * MUST run before the DELETE so the title subqueries still resolve. `column` is
 * a fixed whitelist (not user input), so the interpolation is safe.
 *
 * Note: subtask-linked occurrences also store the parent `goal_task_id`, so
 * detaching by `goal_task_id` covers both the task's own and its subtasks'
 * occurrences in one pass.
 */
function detachOccurrencesByColumn(
  userId: string,
  column: "goal_task_id" | "goal_subtask_id" | "goal_id",
  ids: string[],
  now: string,
) {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `UPDATE task_occurrences
     SET title = CASE source_kind
                   WHEN 'goal_subtask' THEN COALESCE((SELECT title FROM goal_subtasks WHERE id = task_occurrences.goal_subtask_id), title)
                   WHEN 'goal_task'    THEN COALESCE((SELECT title FROM goal_tasks    WHERE id = task_occurrences.goal_task_id),    title)
                   ELSE title
                 END,
         source_kind = 'standalone',
         goal_id = NULL,
         goal_task_id = NULL,
         goal_subtask_id = NULL,
         updated_at = ?
     WHERE ${column} IN (${placeholders}) AND user_id = ?`,
  ).run(now, ...ids, userId);
}

/**
 * Diff-based upsert of a goal's tasks and subtasks.
 *
 * Why not just DELETE+INSERT?  task_occurrences has FK ON DELETE CASCADE to
 * goal_tasks/goal_subtasks. Wiping and re-inserting (even with the same id)
 * would cascade-delete every occurrence the user has scheduled for those
 * tasks.  This diff approach keeps the goal_task / goal_subtask rows alive
 * for items whose id was reused and only deletes the ones the client truly
 * dropped.  For those truly-dropped items we DETACH their occurrences to
 * standalone first (see `detachOccurrencesByColumn`) so the user's Today
 * entries and history survive even a deletion.
 *
 * It also enforces the "first subtask appears → reassign open parent
 * occurrences" invariant: when a goal_task gains its first subtask, every
 * still-open occurrence pointing at the parent task is rewritten to point at
 * the first new subtask. This matches the UI rule that a task with subtasks
 * cannot be carried to Today directly.
 */
function replaceGoalTasks(userId: string, goalId: string, tasks: GoalTaskInput[], now: string) {
  const existingTasks = db
    .prepare("SELECT id FROM goal_tasks WHERE goal_id = ?")
    .all(goalId) as Array<{ id: string }>;
  const existingTaskIds = new Set(existingTasks.map((t) => t.id));

  const seenTaskIds = new Set<string>();
  const taskInsertsOrUpdates: Array<{
    id: string;
    index: number;
    task: GoalTaskInput;
    isNew: boolean;
  }> = [];

  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i];
    const id = task.id && existingTaskIds.has(task.id) ? task.id : newId();
    seenTaskIds.add(id);
    taskInsertsOrUpdates.push({ id, index: i, task, isNew: !existingTaskIds.has(id) });
  }

  // Delete tasks that disappeared from the input — but first detach their
  // occurrences (and their subtasks' occurrences) so history isn't cascaded away.
  const toDelete = [...existingTaskIds].filter((id) => !seenTaskIds.has(id));
  if (toDelete.length > 0) {
    detachOccurrencesByColumn(userId, "goal_task_id", toDelete, now);
    const placeholders = toDelete.map(() => "?").join(",");
    db.prepare(`DELETE FROM goal_tasks WHERE id IN (${placeholders})`).run(...toDelete);
  }

  const insertTask = db.prepare(
    `INSERT INTO goal_tasks
     (id, goal_id, position, title, status, deadline, icon_id, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateTask = db.prepare(
    `UPDATE goal_tasks
     SET position = ?, title = ?, status = ?, deadline = ?, icon_id = ?, note = ?, updated_at = ?
     WHERE id = ?`,
  );
  const insertSubtask = db.prepare(
    `INSERT INTO goal_subtasks
     (id, goal_task_id, position, title, completed, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateSubtask = db.prepare(
    `UPDATE goal_subtasks
     SET position = ?, title = ?, completed = ?, updated_at = ?
     WHERE id = ?`,
  );

  for (const entry of taskInsertsOrUpdates) {
    const { id: taskId, index, task, isNew } = entry;
    const incomingSubtasks = task.subtasks ?? [];
    const derivedCompleted =
      incomingSubtasks.length > 0
        ? incomingSubtasks.every((sub) => Boolean(sub.completed))
        : Boolean(task.completed);
    const status = derivedCompleted ? "done" : "pending";

    if (isNew) {
      insertTask.run(
        taskId,
        goalId,
        index,
        task.title,
        status,
        task.deadline || null,
        task.iconId || null,
        task.note ?? null,
        now,
        now,
      );
    } else {
      updateTask.run(
        index,
        task.title,
        status,
        task.deadline || null,
        task.iconId || null,
        task.note ?? null,
        now,
        taskId,
      );
    }

    // Diff subtasks for this task.
    const existingSubRows = db
      .prepare("SELECT id FROM goal_subtasks WHERE goal_task_id = ?")
      .all(taskId) as Array<{ id: string }>;
    const existingSubIds = new Set(existingSubRows.map((s) => s.id));
    const wasEmpty = existingSubIds.size === 0;

    const seenSubIds = new Set<string>();
    const subIdInOrder: string[] = [];
    incomingSubtasks.forEach((sub, subIndex) => {
      const subId = sub.id && existingSubIds.has(sub.id) ? sub.id : newId();
      seenSubIds.add(subId);
      subIdInOrder.push(subId);
      if (existingSubIds.has(subId)) {
        updateSubtask.run(subIndex, sub.title, sub.completed ? 1 : 0, now, subId);
      } else {
        insertSubtask.run(subId, taskId, subIndex, sub.title, sub.completed ? 1 : 0, now, now);
      }
    });

    const subsToDelete = [...existingSubIds].filter((sid) => !seenSubIds.has(sid));
    if (subsToDelete.length > 0) {
      detachOccurrencesByColumn(userId, "goal_subtask_id", subsToDelete, now);
      const placeholders = subsToDelete.map(() => "?").join(",");
      db.prepare(`DELETE FROM goal_subtasks WHERE id IN (${placeholders})`).run(...subsToDelete);
    }

    // Invariant: if this task just gained its first subtask AND there are
    // still-open parent-task occurrences, reassign them to the first subtask.
    if (wasEmpty && incomingSubtasks.length > 0 && subIdInOrder.length > 0) {
      const firstSubId = subIdInOrder[0];
      const subRow = db
        .prepare(
          "SELECT goal_subtasks.title AS title FROM goal_subtasks WHERE id = ?",
        )
        .get(firstSubId) as { title: string } | undefined;
      db.prepare(
        `UPDATE task_occurrences
         SET source_kind = 'goal_subtask',
             goal_subtask_id = ?,
             title = ?,
             updated_at = ?
         WHERE user_id = ? AND goal_task_id = ? AND source_kind = 'goal_task' AND completed = 0`,
      ).run(firstSubId, subRow?.title ?? task.title, now, userId, taskId);
    }
  }
}

const listGoalsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Goals"],
  summary: "List goals with ordered tasks",
  responses: {
    200: { description: "Goals", content: { "application/json": { schema: GoalsEnvelopeSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

goalRoutes.openapi(listGoalsRoute, (c) => {
  const userId = c.get("userId");
  const rows = db
    .prepare("SELECT * FROM goals WHERE user_id = ? AND status != 'archived' ORDER BY deadline IS NULL, deadline ASC, created_at DESC")
    .all(userId) as GoalRow[];
  const stageRows = db
    .prepare(`SELECT goal_tasks.* FROM goal_tasks JOIN goals ON goals.id = goal_tasks.goal_id WHERE goals.user_id = ? ORDER BY goal_tasks.position ASC, goal_tasks.created_at ASC`)
    .all(userId) as GoalTaskRow[];
  const stagesByGoal = new Map<string, GoalTaskRow[]>();
  for (const stage of stageRows) {
    const bucket = stagesByGoal.get(stage.goal_id) ?? [];
    bucket.push(stage);
    stagesByGoal.set(stage.goal_id, bucket);
  }
  const subtaskRows = db
    .prepare(
      `SELECT goal_subtasks.* FROM goal_subtasks
       JOIN goal_tasks ON goal_tasks.id = goal_subtasks.goal_task_id
       JOIN goals ON goals.id = goal_tasks.goal_id
       WHERE goals.user_id = ?
       ORDER BY goal_subtasks.position ASC, goal_subtasks.created_at ASC`,
    )
    .all(userId) as GoalSubtaskRow[];
  const subtasksByTask = new Map<string, GoalSubtaskRow[]>();
  for (const sub of subtaskRows) {
    const bucket = subtasksByTask.get(sub.goal_task_id) ?? [];
    bucket.push(sub);
    subtasksByTask.set(sub.goal_task_id, bucket);
  }
  return c.json({ goals: rows.map((row) => toGoal(row, stagesByGoal.get(row.id) ?? [], subtasksByTask)) }, 200);
});

const createGoalRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Goals"],
  summary: "Create a goal with ordered tasks",
  request: { body: { required: true, content: { "application/json": { schema: GoalCreateInputSchema } } } },
  responses: {
    201: { description: "Goal created", content: { "application/json": { schema: GoalEnvelopeSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ErrorResponseSchema } } },
    422: { description: "Validation failed", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

goalRoutes.openapi(createGoalRoute, (c) => {
  const userId = c.get("userId");
  const input = c.req.valid("json");
  const id = newId();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      "INSERT INTO goals (id, user_id, title, description, deadline, icon_id, status, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?, 'active', ?, ?)",
    ).run(id, userId, input.title, input.deadline ?? null, input.iconId ?? null, now, now);
    replaceGoalTasks(userId, id, input.tasks ?? [], now);
  })();
  checkpointDatabase();
  const goal = readGoal(userId, id)!;
  return c.json({ goal }, 201);
});

const updateGoalRoute = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["Goals"],
  summary: "Update a goal and replace/reorder its tasks",
  request: {
    params: GoalIdParamSchema,
    body: { required: true, content: { "application/json": { schema: GoalUpdateInputSchema } } },
  },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: GoalEnvelopeSchema } } },
    404: { description: "Goal not found", content: { "application/json": { schema: ErrorResponseSchema } } },
    422: { description: "Validation failed", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

goalRoutes.openapi(updateGoalRoute, (c) => {
  const userId = c.get("userId");
  const { id } = c.req.valid("param");
  const input = c.req.valid("json");
  const existing = db.prepare("SELECT * FROM goals WHERE id = ? AND user_id = ?").get(id, userId) as GoalRow | undefined;
  if (!existing) return c.json({ message: "Goal not found." }, 404);
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("UPDATE goals SET title = ?, deadline = ?, icon_id = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(
      input.title ?? existing.title,
      input.deadline !== undefined ? input.deadline : existing.deadline,
      input.iconId !== undefined ? input.iconId : existing.icon_id ?? null,
      now,
      id,
      userId,
    );
    if (input.tasks) replaceGoalTasks(userId, id, input.tasks, now);
  })();
  checkpointDatabase();
  return c.json({ goal: readGoal(userId, id)! }, 200);
});

const deleteGoalRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Goals"],
  summary: "Delete a goal",
  request: { params: GoalIdParamSchema },
  responses: {
    200: { description: "Deleted", content: { "application/json": { schema: OkResponseSchema } } },
    404: { description: "Goal not found", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

goalRoutes.openapi(deleteGoalRoute, (c) => {
  const userId = c.get("userId");
  const { id } = c.req.valid("param");
  const now = new Date().toISOString();
  let deleted = false;
  db.transaction(() => {
    // Detach this goal's occurrences to standalone first so deleting the goal
    // doesn't cascade away the user's Today entries / past-day history. All
    // goal-linked occurrences carry goal_id, so this one pass covers them.
    detachOccurrencesByColumn(userId, "goal_id", [id], now);
    const info = db.prepare("DELETE FROM goals WHERE id = ? AND user_id = ?").run(id, userId);
    deleted = info.changes > 0;
  })();
  if (!deleted) return c.json({ message: "Goal not found." }, 404);
  checkpointDatabase();
  return c.json({ ok: true as const }, 200);
});
