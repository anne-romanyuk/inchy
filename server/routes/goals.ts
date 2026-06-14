import { createRoute, z } from "@hono/zod-openapi";
import { checkpointDatabase, db } from "../db";
import { newId } from "../lib/ids";
import { toGoal, type GoalRow, type GoalTaskRow, type GoalSubtaskRow } from "../lib/mappers";
import { requireUser, type AuthEnv } from "../middleware/auth";
import { createApp } from "../openapi/hono";
import {
  ErrorResponseSchema,
  type GoalActor,
  GoalCreateInputSchema,
  GoalEnvelopeSchema,
  type GoalMember,
  type GoalOccurrenceDeleteAction,
  type GoalOccurrenceDeleteDecision,
  GoalsEnvelopeSchema,
  GoalUpdateInputSchema,
  OkResponseSchema,
} from "../../shared/schemas";

type GoalRole = "owner" | "member";

type ActorRow = { id: string; name: string; avatar_id: string | null; avatar_image: string | null };

function actorFromRow(row: ActorRow): GoalActor {
  return { id: row.id, name: row.name, avatarId: row.avatar_id, avatarImage: row.avatar_image ?? null };
}

// Owner of a goal, plus anyone who's an accepted member. Used for access checks.
function getGoalAccess(userId: string, goalId: string): { goal: GoalRow; role: GoalRole } | null {
  const goal = db.prepare("SELECT * FROM goals WHERE id = ?").get(goalId) as GoalRow | undefined;
  if (!goal) return null;
  if (goal.user_id === userId) return { goal, role: "owner" };
  const member = db
    .prepare("SELECT 1 FROM goal_members WHERE goal_id = ? AND user_id = ? AND status = 'accepted'")
    .get(goalId, userId);
  return member ? { goal, role: "member" } : null;
}

function loadActorsByIds(ids: Array<string | null | undefined>): Map<string, GoalActor> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const map = new Map<string, GoalActor>();
  if (unique.length === 0) return map;
  const placeholders = unique.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT id, name, avatar_id, avatar_image FROM users WHERE id IN (${placeholders})`)
    .all(...unique) as ActorRow[];
  for (const row of rows) map.set(row.id, actorFromRow(row));
  return map;
}

// Owner first, then accepted members — for the avatar stack on a shared goal.
function loadGoalMembers(goal: GoalRow): GoalMember[] {
  const members: GoalMember[] = [];
  const owner = db
    .prepare("SELECT id, name, avatar_id, avatar_image FROM users WHERE id = ?")
    .get(goal.user_id) as ActorRow | undefined;
  if (owner) members.push({ ...actorFromRow(owner), role: "owner", status: "accepted" });
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.avatar_id, u.avatar_image, gm.status
       FROM goal_members gm JOIN users u ON u.id = gm.user_id
       WHERE gm.goal_id = ? AND gm.status IN ('accepted','pending')
       ORDER BY (gm.status = 'accepted') DESC, u.name COLLATE NOCASE`,
    )
    .all(goal.id) as Array<ActorRow & { status: "accepted" | "pending" }>;
  for (const row of rows) members.push({ ...actorFromRow(row), role: "member", status: row.status });
  return members;
}

function loadGoalParticipantIds(goalId: string, fallbackUserId: string): string[] {
  const rows = db
    .prepare(
      `SELECT user_id FROM goals WHERE id = ?
       UNION
       SELECT user_id FROM goal_members WHERE goal_id = ? AND status = 'accepted'`,
    )
    .all(goalId, goalId) as Array<{ user_id: string }>;
  return [...new Set([fallbackUserId, ...rows.map((row) => row.user_id)])];
}

type GoalTaskInput = {
  id?: string;
  title: string;
  deadline?: string | null;
  completed?: boolean;
  iconId?: string | null;
  note?: string | null;
  subtasks?: Array<{ id?: string; title: string; completed?: boolean }>;
};

type GoalOccurrenceDeleteKind = GoalOccurrenceDeleteDecision["kind"];
type GoalOccurrenceDeleteColumn = "goal_task_id" | "goal_subtask_id" | "goal_id";
type GoalOccurrenceDeleteDecisionMap = Map<string, GoalOccurrenceDeleteAction>;

class GoalOccurrencesDecisionRequiredError extends Error {
  target: { kind: GoalOccurrenceDeleteKind; id: string };

  constructor(kind: GoalOccurrenceDeleteKind, id: string) {
    super("Goal occurrence delete decision required.");
    this.target = { kind, id };
  }
}

function decisionKey(kind: GoalOccurrenceDeleteKind, id: string) {
  return `${kind}:${id}`;
}

function buildOccurrenceDeleteDecisionMap(decisions: GoalOccurrenceDeleteDecision[] | undefined) {
  const map: GoalOccurrenceDeleteDecisionMap = new Map();
  for (const decision of decisions ?? []) {
    map.set(decisionKey(decision.kind, decision.id), decision.action);
  }
  return map;
}

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
  const access = getGoalAccess(userId, id);
  if (!access) return null;
  const { goal, role } = access;
  const tasks = db
    .prepare("SELECT * FROM goal_tasks WHERE goal_id = ? ORDER BY position ASC, created_at ASC")
    .all(id) as GoalTaskRow[];
  const subtasks = loadSubtasksByTask(id);

  // Resolve "completed by" actors in one query (covers both tasks and subtasks).
  const actorIds: Array<string | null | undefined> = [];
  for (const task of tasks) actorIds.push(task.completed_by);
  for (const bucket of subtasks.values()) for (const sub of bucket) actorIds.push(sub.completed_by);
  const actorsById = loadActorsByIds(actorIds);
  const members = loadGoalMembers(goal);

  return toGoal(goal, tasks, subtasks, { actorsById, members, viewerRole: role, ownerId: goal.user_id });
}

function todayDateKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Detach (rather than cascade-delete) any task_occurrences tied to goal items
 * that are about to be removed: flip them to `standalone`, drop the goal links,
 * and snapshot the live title. The occurrence is the user's actual record of
 * work — it may be completed on past days and have focus sessions attached — so
 * deleting a goal/task/subtask must NOT erase that history. Instead each
 * participant's Today entry lives on as a plain standalone task.
 *
 * MUST run before the DELETE so the title subqueries still resolve. `column` is
 * a fixed whitelist (not user input), so the interpolation is safe.
 *
 * Note: subtask-linked occurrences also store the parent `goal_task_id`, so
 * detaching by `goal_task_id` covers both the task's own and its subtasks'
 * occurrences in one pass.
 */
function detachOccurrencesByColumn(
  userIds: string[],
  column: GoalOccurrenceDeleteColumn,
  ids: string[],
  now: string,
  options: { beforeDate?: string; completedOnDate?: string; clearRecurringTaskId?: boolean } = {},
) {
  if (ids.length === 0 || userIds.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  const userPlaceholders = userIds.map(() => "?").join(",");
  const datePredicates: string[] = [];
  const dateParams: string[] = [];
  if (options.beforeDate) {
    datePredicates.push("occurrence_date < ?");
    dateParams.push(options.beforeDate);
  }
  if (options.completedOnDate) {
    datePredicates.push("(occurrence_date = ? AND completed = 1)");
    dateParams.push(options.completedOnDate);
  }
  const dateClause = datePredicates.length ? ` AND (${datePredicates.join(" OR ")})` : "";
  db.prepare(
    `UPDATE task_occurrences
     SET title = CASE source_kind
                   WHEN 'goal_subtask' THEN COALESCE((SELECT title FROM goal_subtasks WHERE id = task_occurrences.goal_subtask_id), title)
                   WHEN 'goal_task'    THEN COALESCE((SELECT title FROM goal_tasks    WHERE id = task_occurrences.goal_task_id),    title)
                   ELSE title
                 END,
         category = COALESCE((SELECT title FROM goals WHERE id = task_occurrences.goal_id), category),
         source_kind = 'standalone',
         goal_id = NULL,
         goal_task_id = NULL,
         goal_subtask_id = NULL,
         recurring_task_id = CASE WHEN ? THEN NULL ELSE recurring_task_id END,
         updated_at = ?
     WHERE ${column} IN (${placeholders}) AND user_id IN (${userPlaceholders})${dateClause}`,
  ).run(options.clearRecurringTaskId ? 1 : 0, now, ...ids, ...userIds, ...dateParams);
}

function detachRecurringTasksByColumn(
  userIds: string[],
  column: GoalOccurrenceDeleteColumn,
  ids: string[],
  now: string,
) {
  if (ids.length === 0 || userIds.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  const userPlaceholders = userIds.map(() => "?").join(",");
  db.prepare(
    `UPDATE recurring_tasks
     SET title = CASE source_kind
                   WHEN 'goal_subtask' THEN COALESCE((SELECT title FROM goal_subtasks WHERE id = recurring_tasks.goal_subtask_id), title)
                   WHEN 'goal_task'    THEN COALESCE((SELECT title FROM goal_tasks    WHERE id = recurring_tasks.goal_task_id),    title)
                   ELSE title
                 END,
         category = COALESCE((SELECT title FROM goals WHERE id = recurring_tasks.goal_id), category),
         source_kind = 'standalone',
         goal_id = NULL,
         goal_task_id = NULL,
         goal_subtask_id = NULL,
         updated_at = ?
     WHERE ${column} IN (${placeholders}) AND user_id IN (${userPlaceholders})`,
  ).run(now, ...ids, ...userIds);
}

function countGoalItemOccurrences(
  userIds: string[],
  column: Exclude<GoalOccurrenceDeleteColumn, "goal_id">,
  id: string,
) {
  if (userIds.length === 0) return 0;
  const userPlaceholders = userIds.map(() => "?").join(",");
  const occurrenceRow = db
    .prepare(`SELECT COUNT(*) AS n FROM task_occurrences WHERE user_id IN (${userPlaceholders}) AND ${column} = ?`)
    .get(...userIds, id) as { n: number };
  const recurringRow = db
    .prepare(`SELECT COUNT(*) AS n FROM recurring_tasks WHERE user_id IN (${userPlaceholders}) AND ${column} = ?`)
    .get(...userIds, id) as { n: number };
  return occurrenceRow.n + recurringRow.n;
}

function deleteGoalLinkedOccurrencesByColumn(
  userIds: string[],
  column: Exclude<GoalOccurrenceDeleteColumn, "goal_id">,
  ids: string[],
  dateClause: "all" | "future",
  today: string,
) {
  if (ids.length === 0 || userIds.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  const userPlaceholders = userIds.map(() => "?").join(",");
  const occurrenceDateClause = dateClause === "future" ? " AND (occurrence_date > ? OR (occurrence_date = ? AND completed = 0))" : "";
  db.prepare(
    `DELETE FROM task_occurrences
     WHERE user_id IN (${userPlaceholders}) AND ${column} IN (${placeholders})${occurrenceDateClause}`,
  ).run(...userIds, ...ids, ...(dateClause === "future" ? [today, today] : []));
}

function deleteRecurringTasksByColumn(
  userIds: string[],
  column: Exclude<GoalOccurrenceDeleteColumn, "goal_id">,
  ids: string[],
) {
  if (ids.length === 0 || userIds.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  const userPlaceholders = userIds.map(() => "?").join(",");
  db.prepare(`DELETE FROM recurring_tasks WHERE user_id IN (${userPlaceholders}) AND ${column} IN (${placeholders})`).run(
    ...userIds,
    ...ids,
  );
}

function applyGoalItemOccurrenceDeleteAction(
  userIds: string[],
  column: Exclude<GoalOccurrenceDeleteColumn, "goal_id">,
  ids: string[],
  action: GoalOccurrenceDeleteAction,
  now: string,
  today: string,
) {
  if (ids.length === 0) return;
  if (action === "detach") {
    detachOccurrencesByColumn(userIds, column, ids, now);
    detachRecurringTasksByColumn(userIds, column, ids, now);
    return;
  }
  if (action === "delete-future") {
    detachOccurrencesByColumn(userIds, column, ids, now, {
      beforeDate: today,
      completedOnDate: today,
      clearRecurringTaskId: true,
    });
    deleteGoalLinkedOccurrencesByColumn(userIds, column, ids, "future", today);
    deleteRecurringTasksByColumn(userIds, column, ids);
    return;
  }
  deleteGoalLinkedOccurrencesByColumn(userIds, column, ids, "all", today);
  deleteRecurringTasksByColumn(userIds, column, ids);
}

function requireOrApplyGoalItemOccurrenceAction(
  userIds: string[],
  kind: GoalOccurrenceDeleteKind,
  column: Exclude<GoalOccurrenceDeleteColumn, "goal_id">,
  id: string,
  decisions: GoalOccurrenceDeleteDecisionMap,
  now: string,
  today: string,
) {
  if (countGoalItemOccurrences(userIds, column, id) === 0) return;
  const action = decisions.get(decisionKey(kind, id));
  if (!action) throw new GoalOccurrencesDecisionRequiredError(kind, id);
  applyGoalItemOccurrenceDeleteAction(userIds, column, [id], action, now, today);
}

function goalOccurrenceDecisionColumn(kind: GoalOccurrenceDeleteKind): Exclude<GoalOccurrenceDeleteColumn, "goal_id"> {
  return kind === "goal_task" ? "goal_task_id" : "goal_subtask_id";
}

function goalOccurrenceDecisionBelongsToGoal(goalId: string, decision: GoalOccurrenceDeleteDecision) {
  if (decision.kind === "goal_task") {
    const row = db.prepare("SELECT id FROM goal_tasks WHERE id = ? AND goal_id = ?").get(decision.id, goalId);
    return Boolean(row);
  }
  const row = db
    .prepare(
      `SELECT goal_subtasks.id
       FROM goal_subtasks
       JOIN goal_tasks ON goal_tasks.id = goal_subtasks.goal_task_id
       WHERE goal_subtasks.id = ? AND goal_tasks.goal_id = ?`,
    )
    .get(decision.id, goalId);
  return Boolean(row);
}

function applyExplicitGoalOccurrenceDeleteDecisions(
  userIds: string[],
  goalId: string,
  decisions: GoalOccurrenceDeleteDecision[] | undefined,
  now: string,
  today: string,
) {
  for (const decision of decisions ?? []) {
    if (!goalOccurrenceDecisionBelongsToGoal(goalId, decision)) continue;
    applyGoalItemOccurrenceDeleteAction(
      userIds,
      goalOccurrenceDecisionColumn(decision.kind),
      [decision.id],
      decision.action,
      now,
      today,
    );
  }
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
 * standalone first (see `detachOccurrencesByColumn`) so participants' Today
 * entries and history survive even a deletion.
 *
 * It also enforces the "first subtask appears → reassign open parent
 * occurrences" invariant: when a goal_task gains its first subtask, every
 * still-open occurrence pointing at the parent task is rewritten to point at
 * the first new subtask. This matches the UI rule that a task with subtasks
 * cannot be carried to Today directly.
 */
function replaceGoalTasks(
  userId: string,
  goalId: string,
  tasks: GoalTaskInput[],
  now: string,
  occurrenceDeleteDecisions: GoalOccurrenceDeleteDecisionMap = new Map(),
) {
  const today = todayDateKey();
  const occurrenceUserIds = loadGoalParticipantIds(goalId, userId);
  const existingTasks = db
    .prepare("SELECT id, status, completed_by, completed_at FROM goal_tasks WHERE goal_id = ?")
    .all(goalId) as Array<{ id: string; status: string; completed_by: string | null; completed_at: string | null }>;
  const existingTaskIds = new Set(existingTasks.map((t) => t.id));
  const existingTaskById = new Map(existingTasks.map((t) => [t.id, t]));

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
    for (const taskId of toDelete) {
      requireOrApplyGoalItemOccurrenceAction(
        occurrenceUserIds,
        "goal_task",
        "goal_task_id",
        taskId,
        occurrenceDeleteDecisions,
        now,
        today,
      );
    }
    const placeholders = toDelete.map(() => "?").join(",");
    db.prepare(`DELETE FROM goal_tasks WHERE id IN (${placeholders})`).run(...toDelete);
  }

  const insertTask = db.prepare(
    `INSERT INTO goal_tasks
     (id, goal_id, position, title, status, deadline, icon_id, note, completed_by, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateTask = db.prepare(
    `UPDATE goal_tasks
     SET position = ?, title = ?, status = ?, deadline = ?, icon_id = ?, note = ?, completed_by = ?, completed_at = ?, updated_at = ?
     WHERE id = ?`,
  );
  const insertSubtask = db.prepare(
    `INSERT INTO goal_subtasks
     (id, goal_task_id, position, title, completed, completed_by, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateSubtask = db.prepare(
    `UPDATE goal_subtasks
     SET position = ?, title = ?, completed = ?, completed_by = ?, completed_at = ?, updated_at = ?
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

    // Attribution: stamp completed_by/at on the pending→done transition, keep it
    // while it stays done, clear it when reopened.
    const prevTask = existingTaskById.get(taskId);
    let taskCompletedBy: string | null = null;
    let taskCompletedAt: string | null = null;
    if (status === "done") {
      if (prevTask && prevTask.status === "done") {
        taskCompletedBy = prevTask.completed_by;
        taskCompletedAt = prevTask.completed_at;
      } else {
        taskCompletedBy = userId;
        taskCompletedAt = now;
      }
    }

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
        taskCompletedBy,
        taskCompletedAt,
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
        taskCompletedBy,
        taskCompletedAt,
        now,
        taskId,
      );
    }

    // Diff subtasks for this task.
    const existingSubRows = db
      .prepare("SELECT id, completed, completed_by, completed_at FROM goal_subtasks WHERE goal_task_id = ?")
      .all(taskId) as Array<{ id: string; completed: number; completed_by: string | null; completed_at: string | null }>;
    const existingSubIds = new Set(existingSubRows.map((s) => s.id));
    const existingSubById = new Map(existingSubRows.map((s) => [s.id, s]));
    const wasEmpty = existingSubIds.size === 0;

    const seenSubIds = new Set<string>();
    const subIdInOrder: string[] = [];
    incomingSubtasks.forEach((sub, subIndex) => {
      const subId = sub.id && existingSubIds.has(sub.id) ? sub.id : newId();
      seenSubIds.add(subId);
      subIdInOrder.push(subId);
      const done = sub.completed ? 1 : 0;
      const prevSub = existingSubById.get(subId);
      let subCompletedBy: string | null = null;
      let subCompletedAt: string | null = null;
      if (done) {
        if (prevSub && prevSub.completed === 1) {
          subCompletedBy = prevSub.completed_by;
          subCompletedAt = prevSub.completed_at;
        } else {
          subCompletedBy = userId;
          subCompletedAt = now;
        }
      }
      if (existingSubIds.has(subId)) {
        updateSubtask.run(subIndex, sub.title, done, subCompletedBy, subCompletedAt, now, subId);
      } else {
        insertSubtask.run(subId, taskId, subIndex, sub.title, done, subCompletedBy, subCompletedAt, now, now);
      }
    });

    const subsToDelete = [...existingSubIds].filter((sid) => !seenSubIds.has(sid));
    if (subsToDelete.length > 0) {
      for (const subtaskId of subsToDelete) {
        requireOrApplyGoalItemOccurrenceAction(
          occurrenceUserIds,
          "goal_subtask",
          "goal_subtask_id",
          subtaskId,
          occurrenceDeleteDecisions,
          now,
          today,
        );
      }
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
      const userPlaceholders = occurrenceUserIds.map(() => "?").join(",");
      db.prepare(
        `UPDATE task_occurrences
         SET source_kind = 'goal_subtask',
             goal_subtask_id = ?,
             title = ?,
             updated_at = ?
         WHERE user_id IN (${userPlaceholders}) AND goal_task_id = ? AND source_kind = 'goal_task' AND completed = 0`,
      ).run(firstSubId, subRow?.title ?? task.title, now, ...occurrenceUserIds, taskId);
    }
  }

  applyExplicitGoalOccurrenceDeleteDecisions(
    occurrenceUserIds,
    goalId,
    [...occurrenceDeleteDecisions].map(([key, action]) => {
      const [kind, id] = key.split(":") as [GoalOccurrenceDeleteKind, string];
      return { kind, id, action };
    }),
    now,
    today,
  );
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
  // Goals the user owns, plus shared goals they've accepted into. readGoal
  // resolves members + "completed by" per goal (goal counts are small).
  const ownerIds = (
    db.prepare("SELECT id FROM goals WHERE user_id = ? AND status != 'archived'").all(userId) as Array<{ id: string }>
  ).map((r) => r.id);
  const memberIds = (
    db
      .prepare(
        `SELECT g.id FROM goals g
         JOIN goal_members gm ON gm.goal_id = g.id
         WHERE gm.user_id = ? AND gm.status = 'accepted' AND g.status != 'archived'`,
      )
      .all(userId) as Array<{ id: string }>
  ).map((r) => r.id);

  const ids = [...new Set([...ownerIds, ...memberIds])];
  const goals = ids.map((id) => readGoal(userId, id)).filter((g): g is NonNullable<typeof g> => g !== null);

  // Preserve the previous ordering: nearest deadline first (nulls last), then
  // newest created first.
  goals.sort((a, b) => {
    if (a.deadline && b.deadline) {
      if (a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
    } else if (a.deadline && !b.deadline) {
      return -1;
    } else if (!a.deadline && b.deadline) {
      return 1;
    }
    return a.createdAt < b.createdAt ? 1 : -1;
  });

  return c.json({ goals }, 200);
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
    409: { description: "Occurrence delete decision required", content: { "application/json": { schema: ErrorResponseSchema } } },
    422: { description: "Validation failed", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

goalRoutes.openapi(updateGoalRoute, (c) => {
  const userId = c.get("userId");
  const { id } = c.req.valid("param");
  const input = c.req.valid("json");
  const access = getGoalAccess(userId, id);
  if (!access) return c.json({ message: "Goal not found." }, 404);
  const existing = access.goal;
  const now = new Date().toISOString();

  try {
    db.transaction(() => {
      // Members are content admins: they can fully edit tasks/subtasks/notes.
      // Goal metadata (title/dates/icon) stays owner-only for now — finer-grained
      // permissions come later.
      if (access.role === "owner") {
        db.prepare("UPDATE goals SET title = ?, deadline = ?, icon_id = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(
          input.title ?? existing.title,
          input.deadline !== undefined ? input.deadline : existing.deadline,
          input.iconId !== undefined ? input.iconId : existing.icon_id ?? null,
          now,
          id,
          userId,
        );
      }
      if (input.tasks) {
        replaceGoalTasks(userId, id, input.tasks, now, buildOccurrenceDeleteDecisionMap(input.occurrenceDeleteDecisions));
      }
    })();
  } catch (error) {
    if (error instanceof GoalOccurrencesDecisionRequiredError) {
      return c.json(
        {
          message: "Choose what to do with scheduled occurrences before deleting this goal item.",
          code: "goal_occurrence_delete_decision_required",
          target: error.target,
        },
        409,
      );
    }
    throw error;
  }
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
    // doesn't cascade away participants' Today entries / past-day history. All
    // goal-linked occurrences carry goal_id, so this one pass covers them.
    const occurrenceUserIds = loadGoalParticipantIds(id, userId);
    detachOccurrencesByColumn(occurrenceUserIds, "goal_id", [id], now);
    detachRecurringTasksByColumn(occurrenceUserIds, "goal_id", [id], now);
    const info = db.prepare("DELETE FROM goals WHERE id = ? AND user_id = ?").run(id, userId);
    deleted = info.changes > 0;
  })();
  if (!deleted) return c.json({ message: "Goal not found." }, 404);
  checkpointDatabase();
  return c.json({ ok: true as const }, 200);
});

// ---------------------------------------------------------------------------
// Sharing — owner invites a friend; the friend accepts/declines from Goals.
// Plain Hono handlers (no OpenAPI boilerplate); static `/requests` segment is
// matched ahead of the `/:id` param routes by the router.
// ---------------------------------------------------------------------------

function areFriends(a: string, b: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM friendships
       WHERE status = 'accepted'
         AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`,
    )
    .get(a, b, b, a);
  return Boolean(row);
}

// Incoming, not-yet-answered goal-share invites for the current user.
goalRoutes.get("/requests", (c) => {
  const userId = c.get("userId");
  const rows = db
    .prepare(
      `SELECT g.id AS goalId, g.title AS title, g.icon_id AS iconId,
              u.id AS ownerId, u.name AS ownerName, u.avatar_id AS ownerAvatarId, u.avatar_image AS ownerAvatarImage,
              gm.created_at AS invitedAt
       FROM goal_members gm
       JOIN goals g ON g.id = gm.goal_id
       JOIN users u ON u.id = g.user_id
       WHERE gm.user_id = ? AND gm.status = 'pending' AND g.status != 'archived'
       ORDER BY gm.created_at DESC`,
    )
    .all(userId) as Array<{
    goalId: string;
    title: string;
    iconId: string | null;
    ownerId: string;
    ownerName: string;
    ownerAvatarId: string | null;
    ownerAvatarImage: string | null;
    invitedAt: string;
  }>;

  const requests = rows.map((r) => ({
    goalId: r.goalId,
    title: r.title,
    iconId: r.iconId ?? null,
    owner: { id: r.ownerId, name: r.ownerName, avatarId: r.ownerAvatarId, avatarImage: r.ownerAvatarImage ?? null },
    taskCount: (db.prepare("SELECT COUNT(*) AS n FROM goal_tasks WHERE goal_id = ?").get(r.goalId) as { n: number }).n,
    invitedAt: r.invitedAt,
  }));

  return c.json({ requests }, 200);
});

goalRoutes.post("/requests/:id/accept", (c) => {
  const userId = c.get("userId");
  const goalId = c.req.param("id");
  const now = new Date().toISOString();
  const info = db
    .prepare("UPDATE goal_members SET status = 'accepted', updated_at = ? WHERE goal_id = ? AND user_id = ? AND status = 'pending'")
    .run(now, goalId, userId);
  if (info.changes === 0) return c.json({ message: "Request not found." }, 404);
  checkpointDatabase();
  return c.json({ goal: readGoal(userId, goalId)! }, 200);
});

goalRoutes.post("/requests/:id/decline", (c) => {
  const userId = c.get("userId");
  const goalId = c.req.param("id");
  const now = new Date().toISOString();
  const info = db
    .prepare("UPDATE goal_members SET status = 'declined', updated_at = ? WHERE goal_id = ? AND user_id = ? AND status = 'pending'")
    .run(now, goalId, userId);
  if (info.changes === 0) return c.json({ message: "Request not found." }, 404);
  checkpointDatabase();
  return c.json({ ok: true as const }, 200);
});

// Owner shares a goal with a friend → pending membership + flips goal to 'pool'.
goalRoutes.post("/:id/share", async (c) => {
  const userId = c.get("userId");
  const goalId = c.req.param("id");
  const goal = db.prepare("SELECT * FROM goals WHERE id = ? AND user_id = ?").get(goalId, userId) as GoalRow | undefined;
  if (!goal) return c.json({ message: "Goal not found." }, 404);

  const body = (await c.req.json().catch(() => null)) as { friendId?: string } | null;
  const friendId = body?.friendId?.trim();
  if (!friendId) return c.json({ message: "friendId is required." }, 422);
  if (friendId === userId) return c.json({ message: "You can't share a goal with yourself." }, 400);
  if (!areFriends(userId, friendId)) return c.json({ message: "You can only share goals with friends." }, 400);

  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("UPDATE goals SET share_mode = 'pool', updated_at = ? WHERE id = ?").run(now, goalId);
    const existing = db
      .prepare("SELECT id, status FROM goal_members WHERE goal_id = ? AND user_id = ?")
      .get(goalId, friendId) as { id: string; status: string } | undefined;
    if (!existing) {
      db.prepare(
        `INSERT INTO goal_members (id, goal_id, user_id, role, status, invited_by, created_at, updated_at)
         VALUES (?, ?, ?, 'member', 'pending', ?, ?, ?)`,
      ).run(newId(), goalId, friendId, userId, now, now);
    } else if (existing.status === "declined") {
      // Re-invite someone who previously declined.
      db.prepare("UPDATE goal_members SET status = 'pending', invited_by = ?, updated_at = ? WHERE id = ?").run(
        userId,
        now,
        existing.id,
      );
    }
    // pending / accepted: leave as-is (idempotent re-share).
  })();
  checkpointDatabase();
  return c.json({ goal: readGoal(userId, goalId)! }, 200);
});

// Owner removes a member, or a member leaves a shared goal (targetId === self).
goalRoutes.delete("/:id/members/:memberId", (c) => {
  const userId = c.get("userId");
  const goalId = c.req.param("id");
  const targetId = c.req.param("memberId");
  const goal = db.prepare("SELECT * FROM goals WHERE id = ?").get(goalId) as GoalRow | undefined;
  if (!goal) return c.json({ message: "Goal not found." }, 404);
  const isOwner = goal.user_id === userId;
  if (!isOwner && targetId !== userId) return c.json({ message: "Not allowed." }, 403);

  db.transaction(() => {
    db.prepare("DELETE FROM goal_members WHERE goal_id = ? AND user_id = ?").run(goalId, targetId);
    const remaining = db
      .prepare("SELECT COUNT(*) AS n FROM goal_members WHERE goal_id = ? AND status = 'accepted'")
      .get(goalId) as { n: number };
    if (remaining.n === 0) db.prepare("UPDATE goals SET share_mode = 'personal' WHERE id = ?").run(goalId);
  })();
  checkpointDatabase();
  return c.json({ ok: true as const }, 200);
});
