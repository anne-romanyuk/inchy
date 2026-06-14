import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Goal } from "../../../shared/schemas";
import { queryKeys } from "../../shared/api/queryClient";
import * as goalsApi from "./api";

export function useGoals() {
  return useQuery({
    queryKey: queryKeys.goals,
    queryFn: async () => (await goalsApi.fetchGoals()).goals,
  });
}

export function useCreateGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: goalsApi.createGoal,
    onSuccess: ({ goal }) => {
      client.setQueryData<Goal[]>(queryKeys.goals, (current = []) => [goal, ...current]);
    },
  });
}

export function useUpdateGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: goalsApi.GoalUpdateInput }) => goalsApi.updateGoal(id, input),
    onSuccess: ({ goal }, variables) => {
      client.setQueryData<Goal[]>(queryKeys.goals, (current = []) =>
        current.map((item) => (item.id === goal.id ? goal : item)),
      );
      // A goal edit can change Today's occurrences server-side: deleting a
      // task/subtask may delete or detach its occurrences, and gaining a first
      // subtask reassigns open parent-task occurrences. Resync so Today drops
      // any stale rows (otherwise completing a removed row 404s).
      client.invalidateQueries({ queryKey: ["occurrences"] });
      for (const decision of variables.input.occurrenceDeleteDecisions ?? []) {
        client.setQueryData(queryKeys.goalLinkedSchedule(decision.kind, decision.id), {
          recurring: null,
          oneOffOccurrences: [],
        });
        client.invalidateQueries({ queryKey: queryKeys.goalLinkedSchedule(decision.kind, decision.id) });
      }
    },
  });
}

export function useGoalRequests() {
  return useQuery({
    queryKey: queryKeys.goalRequests,
    queryFn: async () => (await goalsApi.fetchGoalRequests()).requests,
  });
}

export function useShareGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, friendId }: { goalId: string; friendId: string }) => goalsApi.shareGoal(goalId, friendId),
    onSuccess: ({ goal }) => {
      client.setQueryData<Goal[]>(queryKeys.goals, (current = []) =>
        current.map((item) => (item.id === goal.id ? goal : item)),
      );
    },
  });
}

export function useAcceptGoalRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (goalId: string) => goalsApi.acceptGoalRequest(goalId),
    onSuccess: ({ goal }) => {
      client.setQueryData<Goal[]>(queryKeys.goals, (current = []) =>
        current.some((g) => g.id === goal.id) ? current.map((g) => (g.id === goal.id ? goal : g)) : [goal, ...current],
      );
      client.invalidateQueries({ queryKey: queryKeys.goalRequests });
      client.invalidateQueries({ queryKey: queryKeys.goals });
    },
  });
}

export function useDeclineGoalRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (goalId: string) => goalsApi.declineGoalRequest(goalId),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: queryKeys.goalRequests });
    },
  });
}

export function useRemoveGoalMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, memberId }: { goalId: string; memberId: string }) =>
      goalsApi.removeGoalMember(goalId, memberId),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: queryKeys.goals });
    },
  });
}

export function useDeleteGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: goalsApi.deleteGoal,
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: queryKeys.goals });
      const previous = client.getQueryData<Goal[]>(queryKeys.goals);
      client.setQueryData<Goal[]>(queryKeys.goals, (current = []) => current.filter((goal) => goal.id !== id));
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) client.setQueryData(queryKeys.goals, context.previous);
    },
    onSuccess: () => {
      // Deleting a goal detaches its tasks'/subtasks' occurrences to standalone.
      client.invalidateQueries({ queryKey: ["occurrences"] });
    },
  });
}
