import { z } from "zod";

export const priorityValues = ["low", "medium", "high"] as const;
export const PrioritySchema = z.enum(priorityValues).openapi("Priority");
export type Priority = z.infer<typeof PrioritySchema>;

export const focusModeValues = ["focus", "short_break", "long_break"] as const;
export const FocusModeSchema = z.enum(focusModeValues).openapi("FocusMode");
export type FocusMode = z.infer<typeof FocusModeSchema>;

export const focusSessionStatusValues = ["active", "completed", "skipped", "abandoned"] as const;
export const FocusSessionStatusSchema = z.enum(focusSessionStatusValues).openapi("FocusSessionStatus");
export type FocusSessionStatus = z.infer<typeof FocusSessionStatusSchema>;

export const avatarIds = ["avatar-1", "avatar-2", "avatar-3", "avatar-4", "avatar-5", "avatar-6"] as const;
export const AvatarIdSchema = z.enum(avatarIds).openapi("AvatarId");

export const PublicUserSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    avatarId: z.string().nullable(),
    needsAvatar: z.boolean(),
  })
  .openapi("PublicUser");
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const TaskSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    priority: PrioritySchema.nullable(),
    category: z.string(),
    duration: z.string(),
    focusSeconds: z.number().int().nonnegative(),
    completed: z.boolean(),
    createdAt: z.string(),
  })
  .openapi("Task");
export type Task = z.infer<typeof TaskSchema>;

export const DefaultTaskSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    priority: PrioritySchema.nullable(),
    category: z.string(),
    duration: z.string(),
    createdAt: z.string(),
  })
  .openapi("DefaultTask");
export type DefaultTask = z.infer<typeof DefaultTaskSchema>;

export const FocusSessionSchema = z
  .object({
    id: z.string(),
    taskId: z.string().nullable(),
    goalId: z.string().nullable(),
    startedAt: z.string(),
    endedAt: z.string().nullable(),
    plannedSeconds: z.number().int().nonnegative(),
    durationSeconds: z.number().int().nonnegative(),
    mode: FocusModeSchema,
    label: z.string(),
    status: FocusSessionStatusSchema,
  })
  .openapi("FocusSession");
export type FocusSession = z.infer<typeof FocusSessionSchema>;

export const MIN_PASSWORD_LENGTH = 8;
// Re-export the unified caps from shared/constants. The originals live there.
import {
  MAX_TITLE_LENGTH,
  MAX_NOTE_TITLE_LENGTH,
  MAX_CATEGORY_LENGTH,
  MAX_DURATION_LENGTH,
} from "./constants";
export { MAX_TITLE_LENGTH, MAX_NOTE_TITLE_LENGTH, MAX_CATEGORY_LENGTH, MAX_DURATION_LENGTH };

// Single source of truth for any task-like title: standalone task, goal,
// goal task, goal subtask, occurrence. Trimmed, non-empty, max MAX_TITLE_LENGTH.
export const TitleSchema = z
  .string()
  .trim()
  .min(1, "Title is required.")
  .max(MAX_TITLE_LENGTH, `Title must be ${MAX_TITLE_LENGTH} characters or less.`);

export const CategorySchema = z.string().trim().max(MAX_CATEGORY_LENGTH);
export const DurationSchema = z.string().trim().max(MAX_DURATION_LENGTH);

// 'YYYY-MM-DD'. Stored as the user's local date.
export const OccurrenceDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.");

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required.")
  .email("Enter a valid email address.");

export const PasswordSchema = z
  .string()
  .min(1, "Password is required.")
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);

export const LoginInputSchema = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
  })
  .openapi("LoginInput");

export const RegisterInputSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters."),
    email: EmailSchema,
    password: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })
  .openapi("RegisterInput");

export const AvatarInputSchema = z
  .object({
    avatarId: AvatarIdSchema,
  })
  .openapi("AvatarInput");

export const TaskCreateInputSchema = z
  .object({
    title: TitleSchema,
    priority: PrioritySchema.nullable().optional().default(null),
    category: CategorySchema.optional().default(""),
    duration: DurationSchema.optional().default(""),
    saveToDefault: z.boolean().optional().default(false),
  })
  .openapi("TaskCreateInput");

export const TaskReorderInputSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1),
  })
  .openapi("TaskReorderInput");

export const TaskUpdateInputSchema = z
  .object({
    title: TitleSchema.optional(),
    priority: PrioritySchema.nullable().optional(),
    category: CategorySchema.optional(),
    duration: DurationSchema.optional(),
    completed: z.boolean().optional(),
  })
  .openapi("TaskUpdateInput");

export const FocusSessionCreateInputSchema = z
  .object({
    plannedSeconds: z.number().int().min(1).max(24 * 60 * 60),
    mode: FocusModeSchema,
    taskId: z.string().trim().min(1).optional(),
    label: z.string().trim().max(120).optional().default(""),
  })
  .openapi("FocusSessionCreateInput");

export const FocusSessionFinishInputSchema = z
  .object({
    status: z.enum(["completed", "skipped", "abandoned"]),
    durationSeconds: z.number().int().nonnegative().max(24 * 60 * 60).optional(),
    taskDurations: z
      .array(
        z.object({
          taskId: z.string().trim().min(1),
          durationSeconds: z.number().int().nonnegative().max(24 * 60 * 60),
        }),
      )
      .optional(),
  })
  .openapi("FocusSessionFinishInput");


import {
  MAX_GOAL_TASKS as _MAX_GOAL_TASKS,
  MAX_GOAL_SUBTASKS as _MAX_GOAL_SUBTASKS,
  MAX_GOAL_TASK_NOTE as _MAX_GOAL_TASK_NOTE,
  MAX_GOAL_SUBTASK_TITLE as _MAX_GOAL_SUBTASK_TITLE,
} from "./constants";
export {
  MAX_GOAL_TASKS,
  MAX_GOAL_SUBTASKS,
  MAX_GOAL_TASK_NOTE,
  MAX_GOAL_SUBTASK_TITLE,
} from "./constants";

export const GoalSubtaskSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    completed: z.boolean(),
    position: z.number().int().nonnegative(),
  })
  .openapi("GoalSubtask");
export type GoalSubtask = z.infer<typeof GoalSubtaskSchema>;

export const GoalTaskSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    deadline: z.string().nullable(),
    completed: z.boolean(),
    position: z.number().int().nonnegative(),
    createdAt: z.string(),
    iconId: z.string().nullable(),
    note: z.string().nullable(),
    subtasks: z.array(GoalSubtaskSchema),
  })
  .openapi("GoalTask");
export type GoalTask = z.infer<typeof GoalTaskSchema>;

export const GoalSubtaskInputSchema = z.object({
  id: z.string().optional(),
  title: TitleSchema,
  completed: z.boolean().optional().default(false),
});

export const GoalSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    deadline: z.string().nullable(),
    iconId: z.string().nullable(),
    tasks: z.array(GoalTaskSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Goal");
export type Goal = z.infer<typeof GoalSchema>;

export const GoalTaskInputSchema = z.object({
  id: z.string().optional(),
  title: TitleSchema,
  deadline: z.string().trim().max(10).nullable().optional(),
  completed: z.boolean().optional().default(false),
  iconId: z.string().trim().max(48).nullable().optional(),
  note: z.string().max(_MAX_GOAL_TASK_NOTE).nullable().optional(),
  subtasks: z.array(GoalSubtaskInputSchema).max(_MAX_GOAL_SUBTASKS).optional(),
});

export const GoalCreateInputSchema = z
  .object({
    title: TitleSchema,
    deadline: z.string().trim().max(10).nullable().optional().default(null),
    iconId: z.string().trim().max(48).nullable().optional().default(null),
    tasks: z.array(GoalTaskInputSchema).max(_MAX_GOAL_TASKS).optional().default([]),
  })
  .openapi("GoalCreateInput");

export const GoalUpdateInputSchema = z
  .object({
    title: TitleSchema.optional(),
    deadline: z.string().trim().max(10).nullable().optional(),
    iconId: z.string().trim().max(48).nullable().optional(),
    tasks: z.array(GoalTaskInputSchema).max(_MAX_GOAL_TASKS).optional(),
  })
  .openapi("GoalUpdateInput");

export const FieldErrorsSchema = z
  .record(z.string(), z.string())
  .openapi("FieldErrors", { description: "Map of field name to validation message." });

export const ErrorResponseSchema = z
  .object({
    message: z.string().optional(),
    errors: FieldErrorsSchema.optional(),
  })
  .openapi("ErrorResponse");

export const OkResponseSchema = z.object({ ok: z.literal(true) }).openapi("OkResponse");

export const UserEnvelopeSchema = z.object({ user: PublicUserSchema }).openapi("UserEnvelope");

export const NullableUserEnvelopeSchema = z
  .object({ user: PublicUserSchema.nullable() })
  .openapi("NullableUserEnvelope");

export const TasksEnvelopeSchema = z.object({ tasks: z.array(TaskSchema) }).openapi("TasksEnvelope");
export const GoalsEnvelopeSchema = z.object({ goals: z.array(GoalSchema) }).openapi("GoalsEnvelope");
export const GoalEnvelopeSchema = z.object({ goal: GoalSchema }).openapi("GoalEnvelope");
export const TaskCategoriesEnvelopeSchema = z
  .object({ categories: z.array(z.string()) })
  .openapi("TaskCategoriesEnvelope");
export const TaskEnvelopeSchema = z
  .object({ task: TaskSchema, defaultTask: DefaultTaskSchema.nullable() })
  .openapi("TaskCreateEnvelope");
export const TaskUpdateEnvelopeSchema = z
  .object({ task: TaskSchema })
  .openapi("TaskUpdateEnvelope");
export const DefaultTasksEnvelopeSchema = z
  .object({ defaultTasks: z.array(DefaultTaskSchema) })
  .openapi("DefaultTasksEnvelope");

export const ActiveFocusSessionEnvelopeSchema = z
  .object({ session: FocusSessionSchema.nullable() })
  .openapi("ActiveFocusSessionEnvelope");
export const FocusSessionEnvelopeSchema = z.object({ session: FocusSessionSchema }).openapi("FocusSessionEnvelope");

// ---------------------------------------------------------------------------
// Notes — free-writing surface with user-named tabs.
// ---------------------------------------------------------------------------
export const MAX_NOTE_BODY_LENGTH = 100_000;

export const NoteSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    body: z.string(),
    category: CategorySchema.optional().default(""),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .openapi("Note");
export type Note = z.infer<typeof NoteSchema>;

// One item in a bulk save. `id` is optional — the server keeps a provided id
// (so client-generated ids stay stable) or assigns a fresh one.
export const NoteInputSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().max(MAX_NOTE_TITLE_LENGTH).default(""),
  body: z.string().max(MAX_NOTE_BODY_LENGTH).default(""),
  category: CategorySchema.optional().default(""),
});

// Save replaces the user's entire note set in one shot (matches the page's
// Save / Cancel model). Order in the array is the persisted tab order.
export const NotesSaveInputSchema = z
  .object({ notes: z.array(NoteInputSchema).max(200) })
  .openapi("NotesSaveInput");

export const NotesEnvelopeSchema = z.object({ notes: z.array(NoteSchema) }).openapi("NotesEnvelope");

// ---------------------------------------------------------------------------
// Task occurrences — units of "I'm working on this on date X".
// One goal task / goal subtask / standalone task can produce many occurrences
// across different dates. Completing an occurrence does NOT auto-complete the
// underlying goal task/subtask; the client passes `completionScope` to choose.
// ---------------------------------------------------------------------------

export const occurrenceSourceKindValues = ["standalone", "goal_task", "goal_subtask"] as const;
export const OccurrenceSourceKindSchema = z
  .enum(occurrenceSourceKindValues)
  .openapi("OccurrenceSourceKind");
export type OccurrenceSourceKind = z.infer<typeof OccurrenceSourceKindSchema>;

export const OccurrenceSchema = z
  .object({
    id: z.string(),
    occurrenceDate: z.string(),
    sourceKind: OccurrenceSourceKindSchema,
    goalId: z.string().nullable(),
    goalTaskId: z.string().nullable(),
    goalSubtaskId: z.string().nullable(),
    // Resolved title: live goal_task/goal_subtask title for goal-linked,
    // snapshot for standalone. Always present.
    title: z.string(),
    priority: PrioritySchema.nullable(),
    category: z.string(),
    duration: z.string(),
    completed: z.boolean(),
    position: z.number().int(),
    focusSeconds: z.number().int().nonnegative(),
    createdAt: z.string(),
  })
  .openapi("Occurrence");
export type Occurrence = z.infer<typeof OccurrenceSchema>;

export const OccurrenceStandaloneCreateSchema = z.object({
  sourceKind: z.literal("standalone"),
  occurrenceDate: OccurrenceDateSchema,
  title: TitleSchema,
  priority: PrioritySchema.nullable().optional().default(null),
  category: CategorySchema.optional().default(""),
  duration: DurationSchema.optional().default(""),
  saveToDefault: z.boolean().optional().default(false),
});

export const OccurrenceFromGoalTaskCreateSchema = z.object({
  sourceKind: z.literal("goal_task"),
  occurrenceDate: OccurrenceDateSchema,
  goalTaskId: z.string().min(1),
});

export const OccurrenceFromGoalSubtaskCreateSchema = z.object({
  sourceKind: z.literal("goal_subtask"),
  occurrenceDate: OccurrenceDateSchema,
  goalSubtaskId: z.string().min(1),
});

export const OccurrenceCreateInputSchema = z
  .discriminatedUnion("sourceKind", [
    OccurrenceStandaloneCreateSchema,
    OccurrenceFromGoalTaskCreateSchema,
    OccurrenceFromGoalSubtaskCreateSchema,
  ])
  .openapi("OccurrenceCreateInput");

export const OccurrenceUpdateInputSchema = z
  .object({
    // Only meaningful for standalone — server ignores for goal-linked.
    title: TitleSchema.optional(),
    priority: PrioritySchema.nullable().optional(),
    category: CategorySchema.optional(),
    duration: DurationSchema.optional(),
    // When true: server marks this occurrence done. If scope === 'whole' and
    // the occurrence is goal-linked, the parent goal_task/goal_subtask is also
    // marked done (and, for the last subtask of a task, the client should
    // separately confirm whether to close the parent goal_task).
    completed: z.boolean().optional(),
    completionScope: z.enum(["today", "whole"]).optional(),
  })
  .openapi("OccurrenceUpdateInput");

export const OccurrenceReorderInputSchema = z
  .object({
    occurrenceDate: OccurrenceDateSchema,
    ids: z.array(z.string().min(1)).min(1),
  })
  .openapi("OccurrenceReorderInput");

export const OccurrenceEnvelopeSchema = z
  .object({ occurrence: OccurrenceSchema })
  .openapi("OccurrenceEnvelope");
export const OccurrencesEnvelopeSchema = z
  .object({ occurrences: z.array(OccurrenceSchema) })
  .openapi("OccurrencesEnvelope");
