export type TaskTimeParts = {
  hour: number;
  minute: number;
};

const TASK_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTaskTime(value?: string | null): TaskTimeParts | null {
  const match = value?.trim().match(TASK_TIME_PATTERN);
  if (!match) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

export function taskTimeSortMinutes(value?: string | null) {
  const parts = parseTaskTime(value);
  return parts ? parts.hour * 60 + parts.minute : null;
}

export function compareTaskTimeForDisplay(first?: string | null, second?: string | null) {
  const firstMinutes = taskTimeSortMinutes(first);
  const secondMinutes = taskTimeSortMinutes(second);
  if (firstMinutes === null && secondMinutes === null) return 0;
  if (firstMinutes === null) return 1;
  if (secondMinutes === null) return -1;
  return firstMinutes - secondMinutes;
}

export function normalizeTaskTimeValue(value?: string | null) {
  const parts = parseTaskTime(value);
  if (!parts) return "";
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function taskTimeFrom12Hour(hour: number, minute: number, period: "AM" | "PM") {
  const safeMinute = Math.min(Math.max(Math.trunc(minute) || 0, 0), 59);
  const safeHour12 = Math.min(Math.max(Math.trunc(hour) || 12, 1), 12);
  const hour24 = period === "AM"
    ? safeHour12 === 12 ? 0 : safeHour12
    : safeHour12 === 12 ? 12 : safeHour12 + 12;
  return `${String(hour24).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
}

export function taskTimeTo12Hour(value?: string | null) {
  const parts = parseTaskTime(value);
  if (!parts) return null;
  const period = parts.hour >= 12 ? "PM" : "AM";
  const hour = parts.hour % 12 || 12;
  return { hour, minute: parts.minute, period } as const;
}

export function formatTaskTimeDisplay(value?: string | null) {
  const parts = taskTimeTo12Hour(value);
  if (!parts) return "";
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")} ${parts.period}`;
}
