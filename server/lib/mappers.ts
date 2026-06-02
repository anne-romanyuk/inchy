import type {
  PublicUser,
  Task,
  DefaultTask,
  FocusSession,
  Goal,
  GoalTask,
  GoalSubtask,
  Note,
  Occurrence,
  OccurrenceSourceKind,
} from "../../shared/schemas";

export type NoteRow = {
  id: string;
  user_id: string;
  position: number;
  title: string;
  body: string;
  category: string;
  pinned: number;
  created_at: string;
  updated_at: string;
};

export function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category ?? "",
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  avatar_id: string | null;
  created_at: string;
};

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarId: row.avatar_id,
    needsAvatar: !row.avatar_id,
  };
}

export type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  priority: "low" | "medium" | "high" | null;
  category: string;
  duration: string;
  focus_seconds?: number;
  completed: number;
  position: number;
  created_at: string;
};

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    priority: row.priority,
    category: row.category,
    duration: row.duration,
    focusSeconds: row.focus_seconds ?? 0,
    completed: Boolean(row.completed),
    createdAt: row.created_at,
  };
}

export type DefaultTaskRow = {
  id: string;
  user_id: string;
  title: string;
  priority: "low" | "medium" | "high" | null;
  category: string;
  duration: string;
  created_at: string;
};

export function toDefaultTask(row: DefaultTaskRow): DefaultTask {
  return {
    id: row.id,
    title: row.title,
    priority: row.priority,
    category: row.category,
    duration: row.duration,
    createdAt: row.created_at,
  };
}

export type FocusSessionRow = {
  id: string;
  user_id: string;
  task_id: string | null;
  goal_id: string | null;
  started_at: string;
  ended_at: string | null;
  planned_seconds: number;
  duration_seconds: number;
  mode: "focus" | "short_break" | "long_break";
  label: string;
  status: "active" | "completed" | "skipped" | "abandoned";
};

export function toFocusSession(row: FocusSessionRow): FocusSession {
  return {
    id: row.id,
    taskId: row.task_id,
    goalId: row.goal_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    plannedSeconds: row.planned_seconds,
    durationSeconds: row.duration_seconds,
    mode: row.mode,
    label: row.label,
    status: row.status,
  };
}


export type GoalRow = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  deadline: string | null;
  icon_id?: string | null;
  pace_target: number | null;
  pace_unit: string | null;
  status: "active" | "paused" | "done" | "archived";
  created_at: string;
  updated_at: string;
};

export type GoalTaskRow = {
  id: string;
  goal_id: string;
  position: number;
  title: string;
  status: "pending" | "active" | "done" | "skipped";
  deadline: string | null;
  icon_id: string | null;
  note: string | null;
  created_at: string;
  updated_at?: string;
};

export type GoalSubtaskRow = {
  id: string;
  goal_task_id: string;
  position: number;
  title: string;
  completed: number;
  created_at: string;
  updated_at: string;
};

export function toGoalSubtask(row: GoalSubtaskRow): GoalSubtask {
  return {
    id: row.id,
    title: row.title,
    completed: Boolean(row.completed),
    position: row.position,
  };
}

export function toGoalTask(row: GoalTaskRow, subtasks: GoalSubtaskRow[] = []): GoalTask {
  return {
    id: row.id,
    title: row.title,
    deadline: row.deadline ?? null,
    completed: row.status === "done",
    position: row.position,
    createdAt: row.created_at,
    iconId: row.icon_id ?? null,
    note: row.note ?? null,
    subtasks: subtasks.map(toGoalSubtask),
  };
}

export type OccurrenceRow = {
  id: string;
  user_id: string;
  occurrence_date: string;
  source_kind: OccurrenceSourceKind;
  goal_id: string | null;
  goal_task_id: string | null;
  goal_subtask_id: string | null;
  title: string;            // snapshot (used for standalone + fallback)
  priority: "low" | "medium" | "high" | null;
  category: string;
  duration: string;
  completed: number;
  position: number;
  created_at: string;
  updated_at: string;
  // Optional joined columns: live titles & focus_seconds. Only present from
  // the read query in occurrences.ts.
  resolved_title?: string | null;
  focus_seconds?: number | null;
};

export function toOccurrence(row: OccurrenceRow): Occurrence {
  const liveTitle =
    typeof row.resolved_title === "string" && row.resolved_title.length > 0
      ? row.resolved_title
      : row.title;
  return {
    id: row.id,
    occurrenceDate: row.occurrence_date,
    sourceKind: row.source_kind,
    goalId: row.goal_id,
    goalTaskId: row.goal_task_id,
    goalSubtaskId: row.goal_subtask_id,
    title: liveTitle,
    priority: row.priority,
    category: row.category,
    duration: row.duration,
    completed: Boolean(row.completed),
    position: row.position,
    focusSeconds: row.focus_seconds ?? 0,
    createdAt: row.created_at,
  };
}

export function toGoal(
  row: GoalRow,
  tasks: GoalTaskRow[] = [],
  subtasksByTask: Map<string, GoalSubtaskRow[]> = new Map(),
): Goal {
  return {
    id: row.id,
    title: row.title,
    deadline: row.deadline ?? null,
    iconId: row.icon_id ?? null,
    tasks: tasks.map((task) => toGoalTask(task, subtasksByTask.get(task.id) ?? [])),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
