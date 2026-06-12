import type { Goal, GoalOccurrenceDeleteDecision } from "../../../shared/schemas";
import { apiFetch } from "../../shared/api/client";

export type GoalSubtaskInput = {
  id?: string;
  title: string;
  completed?: boolean;
};

export type GoalTaskInput = {
  id?: string;
  title: string;
  deadline?: string | null;
  completed?: boolean;
  iconId?: string | null;
  note?: string | null;
  subtasks?: GoalSubtaskInput[];
};

export type GoalCreateInput = {
  title: string;
  deadline: string | null;
  iconId?: string | null;
  tasks: GoalTaskInput[];
};

export type GoalUpdateInput = Partial<GoalCreateInput> & {
  occurrenceDeleteDecisions?: GoalOccurrenceDeleteDecision[];
};

export function fetchGoals() {
  return apiFetch<{ goals: Goal[] }>("/api/goals");
}

export function createGoal(input: GoalCreateInput) {
  return apiFetch<{ goal: Goal }>("/api/goals", { method: "POST", body: input });
}

export function updateGoal(id: string, input: GoalUpdateInput) {
  return apiFetch<{ goal: Goal }>(`/api/goals/${id}`, { method: "PATCH", body: input });
}

export function deleteGoal(id: string) {
  return apiFetch<{ ok: true }>(`/api/goals/${id}`, { method: "DELETE" });
}
