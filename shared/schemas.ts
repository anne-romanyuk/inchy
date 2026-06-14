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
    birthDate: z.string(),
    country: z.string(),
    isGoogleAccount: z.boolean(),
    avatarId: z.string().nullable(),
    avatarImage: z.string().nullable(),
    needsAvatar: z.boolean(),
  })
  .openapi("PublicUser");
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const UserProfileUpdateInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(80, "Name must be 80 characters or less."),
    email: z.string().trim().toLowerCase().min(1, "Email is required.").email("Enter a valid email address."),
    birthDate: z.string().trim().regex(/^$|^\d{4}-\d{2}-\d{2}$/, "Birth date must be YYYY-MM-DD."),
    country: z.string().trim().max(80, "Country must be 80 characters or less."),
  })
  .openapi("UserProfileUpdateInput");
export type UserProfileUpdateInput = z.infer<typeof UserProfileUpdateInputSchema>;

export const TaskSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    priority: PrioritySchema.nullable(),
    category: z.string(),
    duration: z.string(),
    time: z.string(),
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
    time: z.string(),
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
import { CATEGORY_COLORS } from "./categoryPalette";
export { MAX_TITLE_LENGTH, MAX_NOTE_TITLE_LENGTH, MAX_CATEGORY_LENGTH, MAX_DURATION_LENGTH };

// Single source of truth for any task-like title: standalone task, goal,
// goal task, goal subtask, occurrence. Trimmed, non-empty, max MAX_TITLE_LENGTH.
export const TitleSchema = z
  .string()
  .trim()
  .min(1, "Title is required.")
  .max(MAX_TITLE_LENGTH, `Title must be ${MAX_TITLE_LENGTH} characters or less.`);

export const CategorySchema = z.string().trim().max(MAX_CATEGORY_LENGTH);
const ManagedCategoryNameSchema = CategorySchema.refine((value) => value.length > 0, "Category name is required.");
export const CategoryColorSchema = z.enum(CATEGORY_COLORS).openapi("CategoryColor");
export const CategoryInfoSchema = z
  .object({
    name: CategorySchema,
    color: CategoryColorSchema,
  })
  .openapi("CategoryInfo");
export type CategoryInfo = z.infer<typeof CategoryInfoSchema>;
export const TaskCategoryUpdateInputSchema = z
  .object({
    name: ManagedCategoryNameSchema,
    nextName: ManagedCategoryNameSchema,
    color: CategoryColorSchema,
  })
  .openapi("TaskCategoryUpdateInput");
export type TaskCategoryUpdateInput = z.infer<typeof TaskCategoryUpdateInputSchema>;
export const TaskCategoryDeleteInputSchema = z
  .object({
    name: ManagedCategoryNameSchema,
    mode: z.enum(["detach", "delete-tasks"]),
  })
  .openapi("TaskCategoryDeleteInput");
export type TaskCategoryDeleteInput = z.infer<typeof TaskCategoryDeleteInputSchema>;
export const DurationSchema = z.string().trim().max(MAX_DURATION_LENGTH);
export const TaskTimeSchema = z
  .string()
  .trim()
  .regex(/^$|^(?:[01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM.");

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

export const UserAvatarImageInputSchema = z
  .object({
    avatarImage: z.union([
      z
        .string()
        .trim()
        .max(1_200_000, "Avatar photo is too large.")
        .regex(/^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/, "Avatar photo must be a JPEG, PNG, or WEBP image."),
      z.null(),
    ]),
  })
  .openapi("UserAvatarImageInput");
export type UserAvatarImageInput = z.infer<typeof UserAvatarImageInputSchema>;

export const TaskCreateInputSchema = z
  .object({
    title: TitleSchema,
    priority: PrioritySchema.nullable().optional().default(null),
    category: CategorySchema.optional().default(""),
    duration: DurationSchema.optional().default(""),
    time: TaskTimeSchema.optional().default(""),
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
    time: TaskTimeSchema.optional(),
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

// A minimal person reference used for goal sharing: "completed by" attribution
// and the member list. Never includes private fields like email.
export const GoalActorSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    avatarId: z.string().nullable(),
    avatarImage: z.string().nullable(),
  })
  .openapi("GoalActor");
export type GoalActor = z.infer<typeof GoalActorSchema>;

export const goalMemberRoleValues = ["owner", "member"] as const;
export const goalMemberStatusValues = ["pending", "accepted", "declined"] as const;
export const GoalMemberSchema = GoalActorSchema.extend({
  role: z.enum(goalMemberRoleValues),
  status: z.enum(goalMemberStatusValues),
}).openapi("GoalMember");
export type GoalMember = z.infer<typeof GoalMemberSchema>;

export const GoalSubtaskSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    completed: z.boolean(),
    position: z.number().int().nonnegative(),
    completedBy: GoalActorSchema.nullable().optional(),
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
    completedBy: GoalActorSchema.nullable().optional(),
  })
  .openapi("GoalTask");
export type GoalTask = z.infer<typeof GoalTaskSchema>;

export const GoalSubtaskInputSchema = z.object({
  id: z.string().optional(),
  title: TitleSchema,
  completed: z.boolean().optional().default(false),
});

export const goalShareModeValues = ["personal", "pool"] as const;
export const GoalShareModeSchema = z.enum(goalShareModeValues).openapi("GoalShareMode");
export type GoalShareMode = z.infer<typeof GoalShareModeSchema>;

export const GoalSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    deadline: z.string().nullable(),
    iconId: z.string().nullable(),
    tasks: z.array(GoalTaskSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
    // Sharing. For personal goals: shareMode 'personal', viewerRole 'owner',
    // members []. For shared goals these describe the pool.
    shareMode: GoalShareModeSchema.optional().default("personal"),
    ownerId: z.string().optional(),
    viewerRole: z.enum(goalMemberRoleValues).optional().default("owner"),
    members: z.array(GoalMemberSchema).optional().default([]),
  })
  .openapi("Goal");
export type Goal = z.infer<typeof GoalSchema>;

// An incoming, not-yet-answered goal-share invite shown in the invitee's Goals.
export const GoalShareRequestSchema = z
  .object({
    goalId: z.string(),
    title: z.string(),
    iconId: z.string().nullable(),
    owner: GoalActorSchema,
    taskCount: z.number().int().nonnegative(),
    invitedAt: z.string(),
  })
  .openapi("GoalShareRequest");
export type GoalShareRequest = z.infer<typeof GoalShareRequestSchema>;

export const GoalShareInputSchema = z
  .object({ friendId: z.string().min(1) })
  .openapi("GoalShareInput");

export const GoalShareRequestsEnvelopeSchema = z
  .object({ requests: z.array(GoalShareRequestSchema) })
  .openapi("GoalShareRequestsEnvelope");

export const GoalTaskInputSchema = z.object({
  id: z.string().optional(),
  title: TitleSchema,
  deadline: z.string().trim().max(10).nullable().optional(),
  completed: z.boolean().optional().default(false),
  iconId: z.string().trim().max(48).nullable().optional(),
  note: z.string().max(_MAX_GOAL_TASK_NOTE).nullable().optional(),
  subtasks: z.array(GoalSubtaskInputSchema).max(_MAX_GOAL_SUBTASKS).optional(),
});

export const goalOccurrenceDeleteActionValues = ["delete-all", "delete-future", "detach"] as const;
export const GoalOccurrenceDeleteActionSchema = z
  .enum(goalOccurrenceDeleteActionValues)
  .openapi("GoalOccurrenceDeleteAction");
export type GoalOccurrenceDeleteAction = z.infer<typeof GoalOccurrenceDeleteActionSchema>;

export const GoalOccurrenceDeleteDecisionSchema = z.object({
  kind: z.enum(["goal_task", "goal_subtask"]),
  id: z.string().min(1),
  action: GoalOccurrenceDeleteActionSchema,
});
export type GoalOccurrenceDeleteDecision = z.infer<typeof GoalOccurrenceDeleteDecisionSchema>;

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
    occurrenceDeleteDecisions: z.array(GoalOccurrenceDeleteDecisionSchema).optional().default([]),
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

// ---------------------------------------------------------------------------
// Friends — social graph + shareable invite codes.
// ---------------------------------------------------------------------------

// A friend, as seen by the current user: just the public bits needed to render
// a row (never the email or other private profile fields).
export const FriendSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    avatarId: z.string().nullable(),
    avatarImage: z.string().nullable(),
    since: z.string(),
  })
  .openapi("Friend");
export type Friend = z.infer<typeof FriendSchema>;

export const FriendsEnvelopeSchema = z.object({ friends: z.array(FriendSchema) }).openapi("FriendsEnvelope");

// The current user's own invite code. The full shareable URL is composed on the
// client from window.location.origin so it always points at the app origin.
export const FriendInviteSchema = z
  .object({
    code: z.string(),
    createdAt: z.string(),
  })
  .openapi("FriendInvite");
export type FriendInvite = z.infer<typeof FriendInviteSchema>;

export const FriendInviteEnvelopeSchema = z.object({ invite: FriendInviteSchema }).openapi("FriendInviteEnvelope");

// Reasons an invite cannot be redeemed (shown on the landing page).
export const friendInviteReasons = ["not_found", "revoked", "expired", "exhausted", "self", "already_friends"] as const;
export const FriendInviteReasonSchema = z.enum(friendInviteReasons).openapi("FriendInviteReason");
export type FriendInviteReason = z.infer<typeof FriendInviteReasonSchema>;

// Preview shown to a (logged-in) user opening someone's invite link, before
// they accept. `valid` true means redeem will succeed.
export const FriendInvitePreviewSchema = z
  .object({
    valid: z.boolean(),
    reason: FriendInviteReasonSchema.nullable(),
    inviter: z
      .object({
        id: z.string(),
        name: z.string(),
        avatarId: z.string().nullable(),
        avatarImage: z.string().nullable(),
      })
      .nullable(),
  })
  .openapi("FriendInvitePreview");
export type FriendInvitePreview = z.infer<typeof FriendInvitePreviewSchema>;

export const FriendInvitePreviewEnvelopeSchema = z
  .object({ preview: FriendInvitePreviewSchema })
  .openapi("FriendInvitePreviewEnvelope");

export const FriendEnvelopeSchema = z.object({ friend: FriendSchema }).openapi("FriendEnvelope");

export const TasksEnvelopeSchema = z.object({ tasks: z.array(TaskSchema) }).openapi("TasksEnvelope");
export const GoalsEnvelopeSchema = z.object({ goals: z.array(GoalSchema) }).openapi("GoalsEnvelope");
export const GoalEnvelopeSchema = z.object({ goal: GoalSchema }).openapi("GoalEnvelope");
export const TaskCategoriesEnvelopeSchema = z
  .object({ categories: z.array(CategoryInfoSchema) })
  .openapi("TaskCategoriesEnvelope");
export const TaskCategoryEnvelopeSchema = z
  .object({ category: CategoryInfoSchema })
  .openapi("TaskCategoryEnvelope");
export const TaskCategoryDeleteEnvelopeSchema = z
  .object({
    ok: z.literal(true),
    affectedTasks: z.number().int().nonnegative(),
  })
  .openapi("TaskCategoryDeleteEnvelope");
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
    categoryColor: CategoryColorSchema.optional(),
    pinned: z.boolean().optional().default(false),
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
  pinned: z.boolean().optional().default(false),
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
export const repeatFrequencyValues = ["daily", "weekly", "monthly", "yearly"] as const;
export const RepeatFrequencySchema = z.enum(repeatFrequencyValues).openapi("RepeatFrequency");
export type RepeatFrequency = z.infer<typeof RepeatFrequencySchema>;
export const repeatMonthOverflowValues = ["last-day", "skip"] as const;
export const RepeatMonthOverflowSchema = z.enum(repeatMonthOverflowValues).openapi("RepeatMonthOverflow");
export const recurrenceUpdateScopeValues = ["single", "series"] as const;
export const RecurrenceUpdateScopeSchema = z.enum(recurrenceUpdateScopeValues).openapi("RecurrenceUpdateScope");
export type RecurrenceUpdateScope = z.infer<typeof RecurrenceUpdateScopeSchema>;
export const recurrenceDeleteScopeValues = ["single", "future", "series"] as const;
export const RecurrenceDeleteScopeSchema = z.enum(recurrenceDeleteScopeValues).openapi("RecurrenceDeleteScope");
export type RecurrenceDeleteScope = z.infer<typeof RecurrenceDeleteScopeSchema>;

export const OccurrenceSchema = z
  .object({
    id: z.string(),
    occurrenceDate: z.string(),
    sourceKind: OccurrenceSourceKindSchema,
    goalId: z.string().nullable(),
    goalTaskId: z.string().nullable(),
    goalSubtaskId: z.string().nullable(),
    recurringTaskId: z.string().nullable(),
    // Resolved title: live goal_task/goal_subtask title for goal-linked,
    // snapshot for standalone. Always present.
    title: z.string(),
    priority: PrioritySchema.nullable(),
    category: z.string(),
    duration: z.string(),
    time: z.string(),
    completed: z.boolean(),
    position: z.number().int(),
    focusSeconds: z.number().int().nonnegative(),
    repeatFrequency: RepeatFrequencySchema.nullable(),
    repeatInterval: z.number().int().min(1).max(999),
    repeatWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
    repeatMonthDays: z.array(z.number().int().min(1).max(31)).max(31),
    repeatMonthOverflow: RepeatMonthOverflowSchema,
    repeatYearMonths: z.array(z.number().int().min(0).max(11)).max(12),
    repeatEndDate: OccurrenceDateSchema.nullable(),
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
  time: TaskTimeSchema.optional().default(""),
  saveToDefault: z.boolean().optional().default(false),
  repeatFrequency: RepeatFrequencySchema.nullable().optional().default(null),
  repeatInterval: z.number().int().min(1).max(999).optional().default(1),
  repeatWeekdays: z.array(z.number().int().min(0).max(6)).max(7).optional().default([]),
  repeatMonthDay: z.number().int().min(1).max(31).nullable().optional().default(null),
  repeatMonthDays: z.array(z.number().int().min(1).max(31)).max(31).optional().default([]),
  repeatMonthOverflow: RepeatMonthOverflowSchema.optional().default("skip"),
  repeatYearMonths: z.array(z.number().int().min(0).max(11)).max(12).optional().default([]),
  repeatEndDate: OccurrenceDateSchema.nullable().optional().default(null),
});

const OccurrenceCreateRepeatFields = {
  repeatFrequency: RepeatFrequencySchema.nullable().optional().default(null),
  repeatInterval: z.number().int().min(1).max(999).optional().default(1),
  repeatWeekdays: z.array(z.number().int().min(0).max(6)).max(7).optional().default([]),
  repeatMonthDay: z.number().int().min(1).max(31).nullable().optional().default(null),
  repeatMonthDays: z.array(z.number().int().min(1).max(31)).max(31).optional().default([]),
  repeatMonthOverflow: RepeatMonthOverflowSchema.optional().default("skip"),
  repeatYearMonths: z.array(z.number().int().min(0).max(11)).max(12).optional().default([]),
  repeatEndDate: OccurrenceDateSchema.nullable().optional().default(null),
};

export const OccurrenceFromGoalTaskCreateSchema = z.object({
  sourceKind: z.literal("goal_task"),
  occurrenceDate: OccurrenceDateSchema,
  goalTaskId: z.string().min(1),
  duration: DurationSchema.optional().default(""),
  time: TaskTimeSchema.optional().default(""),
  ...OccurrenceCreateRepeatFields,
});

export const OccurrenceFromGoalSubtaskCreateSchema = z.object({
  sourceKind: z.literal("goal_subtask"),
  occurrenceDate: OccurrenceDateSchema,
  goalSubtaskId: z.string().min(1),
  duration: DurationSchema.optional().default(""),
  time: TaskTimeSchema.optional().default(""),
  ...OccurrenceCreateRepeatFields,
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
    occurrenceDate: OccurrenceDateSchema.optional(),
    // Title/priority are only meaningful for standalone — goal-linked titles
    // resolve live from the parent goal task/subtask.
    title: TitleSchema.optional(),
    priority: PrioritySchema.nullable().optional(),
    category: CategorySchema.optional(),
    duration: DurationSchema.optional(),
    time: TaskTimeSchema.optional(),
    repeatFrequency: RepeatFrequencySchema.nullable().optional(),
    repeatInterval: z.number().int().min(1).max(999).optional(),
    repeatWeekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    repeatMonthDay: z.number().int().min(1).max(31).nullable().optional(),
    repeatMonthDays: z.array(z.number().int().min(1).max(31)).max(31).optional(),
    repeatMonthOverflow: RepeatMonthOverflowSchema.optional(),
    repeatYearMonths: z.array(z.number().int().min(0).max(11)).max(12).optional(),
    repeatEndDate: OccurrenceDateSchema.nullable().optional(),
    recurrenceUpdateScope: RecurrenceUpdateScopeSchema.optional(),
    // When true: server marks this occurrence done. If scope === 'whole' and
    // the occurrence is goal-linked, the parent goal_task/goal_subtask is also
    // marked done (and, for the last subtask of a task, the client should
    // separately confirm whether to close the parent goal_task).
    completed: z.boolean().optional(),
    completionScope: z.enum(["today", "whole"]).optional(),
  })
  .openapi("OccurrenceUpdateInput");

export const OccurrenceDeleteInputSchema = z
  .object({
    recurrenceDeleteScope: RecurrenceDeleteScopeSchema.optional().default("single"),
  })
  .openapi("OccurrenceDeleteInput");

export const GoalLinkedRecurringScheduleSchema = z
  .object({
    id: z.string(),
    startsOn: OccurrenceDateSchema,
    repeatFrequency: RepeatFrequencySchema,
    repeatInterval: z.number().int().min(1).max(999),
    repeatWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
    repeatMonthDays: z.array(z.number().int().min(1).max(31)).max(31),
    repeatMonthOverflow: RepeatMonthOverflowSchema,
    repeatYearMonths: z.array(z.number().int().min(0).max(11)).max(12),
    repeatEndDate: OccurrenceDateSchema.nullable(),
    duration: DurationSchema,
    time: TaskTimeSchema,
    nextDates: z.array(OccurrenceDateSchema).max(5),
  })
  .openapi("GoalLinkedRecurringSchedule");
export type GoalLinkedRecurringSchedule = z.infer<typeof GoalLinkedRecurringScheduleSchema>;

export const GoalLinkedOneOffScheduleSchema = z
  .object({
    id: z.string(),
    occurrenceDate: OccurrenceDateSchema,
    duration: DurationSchema,
    time: TaskTimeSchema,
  })
  .openapi("GoalLinkedOneOffSchedule");
export type GoalLinkedOneOffSchedule = z.infer<typeof GoalLinkedOneOffScheduleSchema>;

export const GoalLinkedScheduleEnvelopeSchema = z
  .object({
    recurring: GoalLinkedRecurringScheduleSchema.nullable(),
    oneOffOccurrences: z.array(GoalLinkedOneOffScheduleSchema),
  })
  .openapi("GoalLinkedScheduleEnvelope");
export type GoalLinkedScheduleEnvelope = z.infer<typeof GoalLinkedScheduleEnvelopeSchema>;

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
