import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Occurrence } from "../../../shared/schemas";
import { ApiError } from "../../shared/api/client";
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
      const nextDate = updates.occurrenceDate;
      const nextKey = nextDate && nextDate !== occurrenceDate ? queryKeys.occurrences(nextDate) : null;
      await client.cancelQueries({ queryKey: key });
      if (nextKey) await client.cancelQueries({ queryKey: nextKey });
      const previous = client.getQueryData<Occurrence[]>(key);
      const previousNext = nextKey ? client.getQueryData<Occurrence[]>(nextKey) : undefined;
      let movedOccurrence: Occurrence | null = null;

      client.setQueryData<Occurrence[]>(key, (current = []) => {
        const nextItems = current
          .map((o) => {
            if (o.id !== id) return o;
            const updated = {
              ...o,
              ...(updates.occurrenceDate !== undefined ? { occurrenceDate: updates.occurrenceDate } : {}),
              ...(updates.title !== undefined ? { title: updates.title } : {}),
              ...(updates.priority !== undefined ? { priority: updates.priority } : {}),
              ...(updates.category !== undefined ? { category: updates.category } : {}),
              ...(updates.duration !== undefined ? { duration: updates.duration } : {}),
              ...(updates.time !== undefined ? { time: updates.time } : {}),
              ...(updates.completed !== undefined ? { completed: updates.completed } : {}),
            };
            movedOccurrence = updated;
            return updated;
          })
          .filter((o) => !nextKey || o.id !== id);
        return nextItems;
      });

      if (nextKey && movedOccurrence) {
        client.setQueryData<Occurrence[]>(nextKey, (current = []) => [
          movedOccurrence as Occurrence,
          ...current.filter((o) => o.id !== id),
        ]);
      }

      return { previous, previousNext, key, nextKey };
    },
    onError: (error, variables, ctx) => {
      // 404 = the occurrence is already gone server-side (most often its goal
      // task/subtask was deleted, cascading the occurrence away). Drop the
      // ghost row instead of restoring it, then resync from the server.
      if (error instanceof ApiError && error.status === 404 && ctx?.key) {
        client.setQueryData<Occurrence[]>(ctx.key, (current = []) =>
          current.filter((o) => o.id !== variables.id),
        );
        if (ctx.nextKey) {
          client.setQueryData<Occurrence[]>(ctx.nextKey, (current = []) =>
            current.filter((o) => o.id !== variables.id),
          );
          client.invalidateQueries({ queryKey: ctx.nextKey });
        }
        client.invalidateQueries({ queryKey: ctx.key });
        return;
      }
      if (ctx?.previous) client.setQueryData(ctx.key, ctx.previous);
      if (ctx?.nextKey) client.setQueryData(ctx.nextKey, ctx.previousNext);
    },
    onSuccess: ({ occurrence }, variables) => {
      const oldKey = queryKeys.occurrences(variables.occurrenceDate);
      const newKey = queryKeys.occurrences(occurrence.occurrenceDate);
      if (occurrence.occurrenceDate !== variables.occurrenceDate) {
        client.setQueryData<Occurrence[]>(oldKey, (current = []) => current.filter((o) => o.id !== occurrence.id));
        client.setQueryData<Occurrence[]>(newKey, (current = []) => [
          occurrence,
          ...current.filter((o) => o.id !== occurrence.id),
        ]);
        client.invalidateQueries({ queryKey: oldKey });
        client.invalidateQueries({ queryKey: newKey });
      } else {
        client.setQueryData<Occurrence[]>(
          oldKey,
          (current = []) => current.map((o) => (o.id === occurrence.id ? occurrence : o)),
        );
      }
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
    onError: (error, _v, ctx) => {
      // Already gone server-side (e.g. cascaded away with its goal task/subtask)
      // — the optimistic removal was correct, so keep it removed.
      if (error instanceof ApiError && error.status === 404) return;
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
