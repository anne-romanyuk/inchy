import type { Occurrence } from "../../../shared/schemas";
import { apiFetch } from "../../shared/api/client";

export type CreateOccurrenceInput =
  | {
      sourceKind: "standalone";
      occurrenceDate: string;
      title: string;
      priority?: "low" | "medium" | "high" | null;
      category?: string;
      duration?: string;
      time?: string;
      saveToDefault?: boolean;
    }
  | {
      sourceKind: "goal_task";
      occurrenceDate: string;
      goalTaskId: string;
    }
  | {
      sourceKind: "goal_subtask";
      occurrenceDate: string;
      goalSubtaskId: string;
    };

export type UpdateOccurrenceInput = Partial<{
  occurrenceDate: string;
  title: string;
  priority: "low" | "medium" | "high" | null;
  category: string;
  duration: string;
  time: string;
  completed: boolean;
  completionScope: "today" | "whole";
}>;

export function fetchOccurrences(date: string) {
  return apiFetch<{ occurrences: Occurrence[] }>(
    `/api/occurrences?date=${encodeURIComponent(date)}`,
  );
}

export function createOccurrence(input: CreateOccurrenceInput) {
  return apiFetch<{ occurrence: Occurrence }>("/api/occurrences", {
    method: "POST",
    body: input,
  });
}

export function updateOccurrence(id: string, updates: UpdateOccurrenceInput) {
  return apiFetch<{ occurrence: Occurrence }>(`/api/occurrences/${id}`, {
    method: "PATCH",
    body: updates,
  });
}

export function deleteOccurrence(id: string) {
  return apiFetch<{ ok: true }>(`/api/occurrences/${id}`, { method: "DELETE" });
}

export function reorderOccurrences(occurrenceDate: string, ids: string[]) {
  return apiFetch<{ ok: true }>("/api/occurrences/reorder", {
    method: "POST",
    body: { occurrenceDate, ids },
  });
}
