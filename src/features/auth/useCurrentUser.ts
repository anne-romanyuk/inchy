import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../shared/api/queryClient";
import { ApiError } from "../../shared/api/client";
import * as authApi from "./api";

export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: async () => {
      try {
        const { user } = await authApi.fetchMe();
        return user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      // Wipe ALL cached data so the next user doesn't see stale data of the previous one.
      client.clear();
      client.setQueryData(queryKeys.currentUser, null);
    },
  });
}

export function useUpdateAvatar() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (avatarId: string) => authApi.updateAvatar(avatarId),
    onSuccess: (data) => {
      client.setQueryData(queryKeys.currentUser, data.user);
    },
  });
}
