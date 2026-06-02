import type { Priority } from "../../../shared/schemas";

export function priorityLabel(priority: Priority | null): string {
  if (!priority) return "";
  return { low: "Low", medium: "Medium", high: "High" }[priority];
}
