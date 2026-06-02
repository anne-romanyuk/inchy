import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Occurrence } from "../../../shared/schemas";
import { queryKeys } from "../../shared/api/queryClient";
import * as api from "./occurrencesApi";

/** YYYY-MM-DD in the user's local timezone. */
export function todayDateKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function useOccurrences(date: string) {
  return useQuery({
    queryKey: queryKeys.occurrences(date),
    queryFn: async () => (await api.fetchOccurrences(date)).occurrences,
  });
}

export function useCreateOccurrence() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createOccurrence,
    onSuccess: ({ occurrence }) => {
      client.setQueryData<Occurrence[]>(
        queryKeys.occurrences(occurrence.occurrenceDate),
        (current = []) => [occurrence, ...current.filter((o) => o.id !== occurrence.id)],
      );
    },
  });
}

export function useUpdateOccurrence() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      occurrenceDate,
      updates,
    }: {
      id: string;
      occurrenceDate: string;
      updates: api.UpdateOccurrenceInput;
    }) => api.updateOccurrence(id, updates),
    onMutate: async ({ id, occurrenceDate, updates }) => {
      const key = queryKeys.occurrences(occurrenceDate);
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<Occurrence[]>(key);
      client.setQueryData<Occurrence[]>(key, (current = []) =>
        current.map((o) =>
          o.id === id
            ? {
                ...o,
                ...(updates.title !== undefined ? { title: updates.title } : {}),
                ...(updates.priority !== undefined ? { priority: updates.priority } : {}),
                ...(updates.category !== undefined ? { category: updates.category } : {}),
                ...(updates.duration !== undefined ? { duration: updates.duration } : {}),
                ...(updates.completed !== undefined ? { completed: updates.completed } : {}),
              }
            : o,
        ),
      );
      return { previous, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) client.setQueryData(ctx.key, ctx.previous);
    },
    onSuccess: ({ occurrence }, variables) => {
      client.setQueryData<Occurrence[]>(
        queryKeys.occurrences(variables.occurrenceDate),
        (current = []) => current.map((o) => (o.id === occurrence.id ? occurrence : o)),
      );
      // If completion propagated to a goal task/subtask, the goals view is stale.
      if (variables.updates.completionScope === "whole") {
        client.invalidateQueries({ queryKey: queryKeys.goals });
      }
    },
  });
}

export function useDeleteOccurrence() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; occurrenceDate: string }) => api.deleteOccurrence(id),
    onMutate: async ({ id, occurrenceDate }) => {
      const key = queryKeys.occurrences(occurrenceDate);
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<Occurrence[]>(key);
      client.setQueryData<Occurrence[]>(key, (current = []) =>
        current.filter((o) => o.id !== id),
      );
      return { previous, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) client.setQueryData(ctx.key, ctx.previous);
    },
  });
}

export function useReorderOccurrences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ occurrenceDate, ids }: { occurrenceDate: string; ids: string[] }) =>
      api.reorderOccurrences(occurrenceDate, ids),
    onMutate: async ({ occurrenceDate, ids }) => {
      const key = queryKeys.occurrences(occurrenceDate);
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<Occurrence[]>(key);
      client.setQueryData<Occurrence[]>(key, (current = []) => {
        const map = new Map(current.map((o) => [o.id, o]));
        const ordered = ids
          .map((id) => map.get(id))
          .filter((o): o is Occurrence => Boolean(o));
        const missing = current.filter((o) => !ids.includes(o.id));
        return [...ordered, ...missing];
      });
      return { previous, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) client.setQueryData(ctx.key, ctx.previous);
    },
  });
}
