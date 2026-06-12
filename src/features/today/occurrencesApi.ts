import type { GoalLinkedScheduleEnvelope, Occurrence, RecurrenceDeleteScope, RecurrenceUpdateScope, RepeatFrequency } from "../../../shared/schemas";
import { apiFetch } from "../../shared/api/client";

type CreateOccurrenceRepeatInput = {
  repeatFrequency?: RepeatFrequency | null;
  repeatInterval?: number;
  repeatWeekdays?: number[];
  repeatMonthDay?: number | null;
  repeatMonthDays?: number[];
  repeatMonthOverflow?: "last-day" | "skip";
  repeatYearMonths?: number[];
  repeatEndDate?: string | null;
};

export type CreateOccurrenceInput =
  | ({
      sourceKind: "standalone";
      occurrenceDate: string;
      title: string;
      priority?: "low" | "medium" | "high" | null;
      category?: string;
      duration?: string;
      time?: string;
      saveToDefault?: boolean;
    } & CreateOccurrenceRepeatInput)
  | ({
      sourceKind: "goal_task";
      occurrenceDate: string;
      goalTaskId: string;
      duration?: string;
      time?: string;
    } & CreateOccurrenceRepeatInput)
  | ({
      sourceKind: "goal_subtask";
      occurrenceDate: string;
      goalSubtaskId: string;
      duration?: string;
      time?: string;
    } & CreateOccurrenceRepeatInput);

export type UpdateOccurrenceInput = Partial<{
  occurrenceDate: string;
  title: string;
  priority: "low" | "medium" | "high" | null;
  category: string;
  duration: string;
  time: string;
  repeatFrequency: RepeatFrequency | null;
  repeatInterval: number;
  repeatWeekdays: number[];
  repeatMonthDay: number | null;
  repeatMonthDays: number[];
  repeatMonthOverflow: "last-day" | "skip";
  repeatYearMonths: number[];
  repeatEndDate: string | null;
  recurrenceUpdateScope: RecurrenceUpdateScope;
  completed: boolean;
  completionScope: "today" | "whole";
}>;

export function fetchOccurrences(date: string) {
  return apiFetch<{ occurrences: Occurrence[] }>(
    `/api/occurrences?date=${encodeURIComponent(date)}`,
  );
}

export function fetchGoalLinkedSchedule(input: { goalTaskId?: string; goalSubtaskId?: string }) {
  const params = new URLSearchParams();
  if (input.goalTaskId) params.set("goalTaskId", input.goalTaskId);
  if (input.goalSubtaskId) params.set("goalSubtaskId", input.goalSubtaskId);
  return apiFetch<GoalLinkedScheduleEnvelope>(`/api/occurrences/goal-schedule?${params.toString()}`);
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

export function updateGoalLinkedSchedule(id: string, updates: UpdateOccurrenceInput) {
  return apiFetch<GoalLinkedScheduleEnvelope>(`/api/occurrences/goal-schedule/${id}`, {
    method: "PATCH",
    body: updates,
  });
}

export function deleteOccurrence(id: string, recurrenceDeleteScope: RecurrenceDeleteScope = "single") {
  return apiFetch<{ ok: true }>(
    `/api/occurrences/${id}?recurrenceDeleteScope=${encodeURIComponent(recurrenceDeleteScope)}`,
    { method: "DELETE" },
  );
}

export function reorderOccurrences(occurrenceDate: string, ids: string[]) {
  return apiFetch<{ ok: true }>("/api/occurrences/reorder", {
    method: "POST",
    body: { occurrenceDate, ids },
  });
}
