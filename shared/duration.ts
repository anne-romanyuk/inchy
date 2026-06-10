export type TaskDurationParts = {
  hours: number;
  minutes: number;
};

const TASK_DURATION_PATTERN = /^(\d{1,2})h\s+(\d{1,2})m$/i;

export function parseTaskDuration(value?: string | null): TaskDurationParts | null {
  const match = value?.trim().match(TASK_DURATION_PATTERN);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 60) return null;
  if (hours === 0 && minutes === 0) return null;

  return { hours, minutes };
}

export function formatTaskDuration(hours: number, minutes: number) {
  const safeHours = Math.min(Math.max(Math.trunc(hours) || 0, 0), 24);
  const safeMinutes = Math.min(Math.max(Math.trunc(minutes) || 0, 0), 60);
  if (safeHours === 0 && safeMinutes === 0) return "";
  return `${safeHours}h ${safeMinutes}m`;
}

export function normalizeTaskDurationValue(value?: string | null) {
  const parts = parseTaskDuration(value);
  return parts ? formatTaskDuration(parts.hours, parts.minutes) : "";
}
