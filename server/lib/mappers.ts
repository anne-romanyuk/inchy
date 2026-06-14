import type {
  PublicUser,
  Task,
  DefaultTask,
  FocusSession,
  Goal,
  GoalActor,
  GoalMember,
  GoalTask,
  GoalSubtask,
  Note,
  Occurrence,
  OccurrenceSourceKind,
} from "../../shared/schemas";
import { normalizeTaskDurationValue } from "../../shared/duration";
import { normalizeTaskTimeValue } from "../../shared/time";
import { isCategoryColor } from "../../shared/categoryPalette";

export type NoteRow = {
  id: string;
  user_id: string;
  position: number;
  title: string;
  body: string;
  category: string;
  category_color?: string | null;
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
    categoryColor: isCategoryColor(row.category_color) ? row.category_color : undefined,
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
  avatar_image?: string | null;
  birth_date: string;
  country?: string | null;
  google_id?: string | null;
  google_email_verified?: number;
  created_at: string;
};

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    birthDate: row.birth_date ?? "",
    country: row.country ?? "",
    isGoogleAccount: Boolean(row.google_id),
    avatarId: row.avatar_id,
    avatarImage: row.avatar_image ?? null,
    needsAvatar: !row.avatar_id && !row.avatar_image,
  };
}

export type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  priority: "low" | "medium" | "high" | null;
  category: string;
  duration: string;
  time: string;
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
    duration: normalizeTaskDurationValue(row.duration),
    time: normalizeTaskTimeValue(row.time),
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
  time: string;
  created_at: string;
};

export function toDefaultTask(row: DefaultTaskRow): DefaultTask {
  return {
    id: row.id,
    title: row.title,
    priority: row.priority,
    category: row.category,
    duration: normalizeTaskDurationValue(row.duration),
    time: normalizeTaskTimeValue(row.time),
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
  share_mode?: string | null;
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
  completed_by?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at?: string;
};

export type GoalSubtaskRow = {
  id: string;
  goal_task_id: string;
  position: number;
  title: string;
  completed: number;
  completed_by?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
};

// Resolve a completed_by user id to a GoalActor using a prebuilt map (avoids
// per-row DB lookups). Returns null when not completed or the actor is unknown.
function resolveActor(id: string | null | undefined, actorsById?: Map<string, GoalActor>): GoalActor | null {
  if (!id || !actorsById) return null;
  return actorsById.get(id) ?? null;
}

export function toGoalSubtask(row: GoalSubtaskRow, actorsById?: Map<string, GoalActor>): GoalSubtask {
  return {
    id: row.id,
    title: row.title,
    completed: Boolean(row.completed),
    position: row.position,
    completedBy: row.completed ? resolveActor(row.completed_by, actorsById) : null,
  };
}

export function toGoalTask(
  row: GoalTaskRow,
  subtasks: GoalSubtaskRow[] = [],
  actorsById?: Map<string, GoalActor>,
): GoalTask {
  const completed = row.status === "done";
  return {
    id: row.id,
    title: row.title,
    deadline: row.deadline ?? null,
    completed,
    position: row.position,
    createdAt: row.created_at,
    iconId: row.icon_id ?? null,
    note: row.note ?? null,
    subtasks: subtasks.map((sub) => toGoalSubtask(sub, actorsById)),
    completedBy: completed ? resolveActor(row.completed_by, actorsById) : null,
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
  recurring_task_id?: string | null;
  title: string;            // snapshot (used for standalone + fallback)
  priority: "low" | "medium" | "high" | null;
  category: string;
  duration: string;
  time: string;
  completed: number;
  position: number;
  created_at: string;
  updated_at: string;
  // Optional joined columns: live titles & focus_seconds. Only present from
  // the read query in occurrences.ts.
  resolved_title?: string | null;
  focus_seconds?: number | null;
  repeat_frequency?: string | null;
  repeat_interval?: number | null;
  repeat_weekdays?: string | null;
  repeat_month_days?: string | null;
  repeat_month_overflow?: "last-day" | "skip" | null;
  repeat_year_months?: string | null;
  repeat_end_date?: string | null;
};

function parseNumberList(value: string | null | undefined, min: number, max: number) {
  if (!value) return [];
  const unique = new Set<number>();
  for (const item of value.split(",")) {
    const parsed = Number(item);
    if (Number.isInteger(parsed) && parsed >= min && parsed <= max) unique.add(parsed);
  }
  return [...unique].sort((a, b) => a - b);
}

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
    recurringTaskId: row.recurring_task_id ?? null,
    title: liveTitle,
    priority: row.priority,
    category: row.category,
    duration: normalizeTaskDurationValue(row.duration),
    time: normalizeTaskTimeValue(row.time),
    completed: Boolean(row.completed),
    position: row.position,
    focusSeconds: row.focus_seconds ?? 0,
    repeatFrequency:
      row.repeat_frequency === "daily" ||
      row.repeat_frequency === "weekly" ||
      row.repeat_frequency === "monthly" ||
      row.repeat_frequency === "yearly"
        ? row.repeat_frequency
        : null,
    repeatInterval: Math.max(1, Math.trunc(row.repeat_interval ?? 1)),
    repeatWeekdays: parseNumberList(row.repeat_weekdays, 0, 6),
    repeatMonthDays: parseNumberList(row.repeat_month_days, 1, 31),
    repeatMonthOverflow: row.repeat_month_overflow === "last-day" ? "last-day" : "skip",
    repeatYearMonths: parseNumberList(row.repeat_year_months, 0, 11),
    repeatEndDate: row.repeat_end_date ?? null,
    createdAt: row.created_at,
  };
}

export function toGoal(
  row: GoalRow,
  tasks: GoalTaskRow[] = [],
  subtasksByTask: Map<string, GoalSubtaskRow[]> = new Map(),
  opts: {
    actorsById?: Map<string, GoalActor>;
    members?: GoalMember[];
    viewerRole?: "owner" | "member";
    ownerId?: string;
  } = {},
): Goal {
  return {
    id: row.id,
    title: row.title,
    deadline: row.deadline ?? null,
    iconId: row.icon_id ?? null,
    tasks: tasks.map((task) => toGoalTask(task, subtasksByTask.get(task.id) ?? [], opts.actorsById)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    shareMode: row.share_mode === "pool" ? "pool" : "personal",
    ownerId: opts.ownerId ?? row.user_id,
    viewerRole: opts.viewerRole ?? "owner",
    members: opts.members ?? [],
  };
}
