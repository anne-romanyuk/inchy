import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Friend } from "../../../shared/schemas";
import { queryKeys } from "../../shared/api/queryClient";
import * as friendsApi from "./api";

export function useFriends() {
  return useQuery({
    queryKey: queryKeys.friends,
    queryFn: async () => (await friendsApi.fetchFriends()).friends,
  });
}

export function useMyInvite() {
  return useQuery({
    queryKey: queryKeys.friendInvite,
    queryFn: async () => (await friendsApi.fetchMyInvite()).invite,
  });
}

export function useRegenerateInvite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: friendsApi.regenerateInvite,
    onSuccess: (data) => {
      client.setQueryData(queryKeys.friendInvite, data.invite);
    },
  });
}

export function useInvitePreview(code: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.friendInvitePreview(code ?? ""),
    queryFn: async () => (await friendsApi.previewInvite(code!)).preview,
    enabled: Boolean(code) && enabled,
    retry: false,
    staleTime: 0,
  });
}

export function useRedeemInvite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => friendsApi.redeemInvite(code),
    onSuccess: (data) => {
      client.setQueryData<Friend[]>(queryKeys.friends, (prev) => {
        const next = prev ?? [];
        return next.some((f) => f.id === data.friend.id) ? next : [...next, data.friend];
      });
      client.invalidateQueries({ queryKey: queryKeys.friends });
    },
  });
}

export function useRemoveFriend() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => friendsApi.removeFriend(userId),
    onSuccess: (_data, userId) => {
      client.setQueryData<Friend[]>(queryKeys.friends, (prev) => (prev ?? []).filter((f) => f.id !== userId));
    },
  });
}
