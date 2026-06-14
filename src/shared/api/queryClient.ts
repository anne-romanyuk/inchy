import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 2 * 60_000,
      gcTime: 10 * 60_000,
      placeholderData: (previousData: unknown) => previousData,
    },
  },
});

export const queryKeys = {
  currentUser: ["currentUser"] as const,
  tasks: ["tasks"] as const,
  taskCategories: ["taskCategories"] as const,
  defaultTasks: ["defaultTasks"] as const,
  activeFocusSession: ["activeFocusSession"] as const,
  goals: ["goals"] as const,
  goalRequests: ["goalRequests"] as const,
  friends: ["friends"] as const,
  friendInvite: ["friendInvite"] as const,
  friendInvitePreview: (code: string) => ["friendInvitePreview", code] as const,
  notes: ["notes"] as const,
  occurrencesRoot: ["occurrences"] as const,
  occurrences: (date: string) => ["occurrences", date] as const,
  goalLinkedSchedule: (sourceKind: "goal_task" | "goal_subtask", id: string) => ["goalLinkedSchedule", sourceKind, id] as const,
};
