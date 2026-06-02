// Plain runtime constants shared between client and server.
// Keep this file free of any runtime dependencies (no zod, no @hono/...) so it
// is safe to import from the browser bundle without dragging server-only deps.

// Unified title length for every "task-like" entity: standalone tasks,
// goal titles, goal tasks, goal subtasks and task occurrences.
// Existing rows over this limit are tolerated on read; the limit is only
// enforced on write (create/update).
export const MAX_TITLE_LENGTH = 50;

export const MAX_GOAL_TASKS = 80;
export const MAX_GOAL_SUBTASKS = 50;
export const MAX_GOAL_TASK_NOTE = 1000;
// Kept for backwards compat in imports; in the unified model this equals MAX_TITLE_LENGTH.
export const MAX_GOAL_SUBTASK_TITLE = 50;
export const MAX_NOTE_TITLE_LENGTH = MAX_TITLE_LENGTH;

export const MAX_CATEGORY_LENGTH = 15;
export const MAX_DURATION_LENGTH = 32;
