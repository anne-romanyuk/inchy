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
    onSuccess: ({ goal }) => {
      client.setQueryData<Goal[]>(queryKeys.goals, (current = []) =>
        current.map((item) => (item.id === goal.id ? goal : item)),
      );
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
  });
}
