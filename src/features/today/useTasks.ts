// After the storage unification, every "task on Today" is a task_occurrence.
// The standalone day-tasks and goal-linked occurrences share one table and
// one endpoint. This file keeps the old hook names (`useTasks`,
// `useUpdateTask`, etc.) as backward-compatible wrappers over the new
// occurrence hooks for today's date, so the rest of the Today widget code
// doesn't have to thread a different type signature everywhere.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DefaultTask, Occurrence } from "../../../shared/schemas";
import { queryKeys } from "../../shared/api/queryClient";
import { apiFetch } from "../../shared/api/client";
import {
  todayDateKey,
  useCreateOccurrence,
  useDeleteOccurrence,
  useOccurrences,
  useReorderOccurrences,
  useUpdateOccurrence,
} from "./useOccurrences";
import type { UpdateOccurrenceInput } from "./occurrencesApi";

// ---------------------------------------------------------------------------
// Task / category / default-task queries
// ---------------------------------------------------------------------------

export function useTasks() {
  return useOccurrences(todayDateKey());
}

export function useTaskCategories() {
  return useQuery({
    queryKey: queryKeys.taskCategories,
    queryFn: async () =>
      (await apiFetch<{ categories: string[] }>("/api/tasks/categories")).categories,
  });
}

export function useDefaultTasks() {
  return useQuery({
    queryKey: queryKeys.defaultTasks,
    queryFn: async () =>
      (await apiFetch<{ defaultTasks: DefaultTask[] }>("/api/default-tasks")).defaultTasks,
  });
}

// ---------------------------------------------------------------------------
// Mutations — thin wrappers that translate the old "task" call shape into
// the new occurrence calls scoped to today's date.
// ---------------------------------------------------------------------------

export type CreateStandaloneInput = {
  title: string;
  priority?: "low" | "medium" | "high" | "" | null;
  category?: string;
  duration?: string;
  saveToDefault?: boolean;
};

export function useCreateTask() {
  const today = todayDateKey();
  const create = useCreateOccurrence();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateStandaloneInput) => {
      const priority = input.priority === "" || input.priority == null ? null : input.priority;
      const { occurrence } = await create.mutateAsync({
        sourceKind: "standalone",
        occurrenceDate: today,
        title: input.title,
        priority,
        category: input.category ?? "",
        duration: input.duration ?? "",
        saveToDefault: input.saveToDefault ?? false,
      });
      return { task: occurrence };
    },
    onSuccess: ({ task }) => {
      if (task.category) {
        client.setQueryData<string[]>(queryKeys.taskCategories, (current = []) =>
          current.includes(task.category)
            ? current
            : [...current, task.category].sort((a, b) => a.localeCompare(b)),
        );
      }
      // The default-tasks query won't auto-update without a refetch; invalidate.
      client.invalidateQueries({ queryKey: queryKeys.defaultTasks });
    },
  });
}

export function useUpdateTask() {
  const today = todayDateKey();
  const update = useUpdateOccurrence();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateOccurrenceInput }) =>
      update.mutateAsync({ id, occurrenceDate: today, updates }),
    onSuccess: ({ occurrence }) => {
      if (occurrence.category) {
        client.setQueryData<string[]>(queryKeys.taskCategories, (current = []) =>
          current.includes(occurrence.category)
            ? current
            : [...current, occurrence.category].sort((a, b) => a.localeCompare(b)),
        );
      }
    },
  });
}

export function useDeleteTask() {
  const today = todayDateKey();
  const del = useDeleteOccurrence();
  return useMutation({
    mutationFn: (id: string) => del.mutateAsync({ id, occurrenceDate: today }),
  });
}

export function useReorderTasks() {
  const today = todayDateKey();
  const reorder = useReorderOccurrences();
  return useMutation({
    mutationFn: (ids: string[]) =>
      reorder.mutateAsync({ occurrenceDate: today, ids }),
  });
}

export function useDeleteDefaultTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/api/default-tasks/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: queryKeys.defaultTasks });
      const previous = client.getQueryData<DefaultTask[]>(queryKeys.defaultTasks);
      client.setQueryData<DefaultTask[]>(queryKeys.defaultTasks, (current = []) =>
        current.filter((task) => task.id !== id),
      );
      return { previous };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.previous) client.setQueryData(queryKeys.defaultTasks, ctx.previous);
    },
  });
}

// Re-export the occurrence type alias for places that imported `Task`
// from this module by name. The shape is a structural superset.
export type TodayTask = Occurrence;
