import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublicUser } from "../../../shared/schemas";
import { queryKeys } from "../../shared/api/queryClient";
import { ApiError } from "../../shared/api/client";
import * as authApi from "./api";

const CURRENT_USER_STORAGE_KEY = "planner-current-user";

// Remember the last known user so a refresh can render the app instantly while
// `/api/me` revalidates in the background — instead of flashing a blank screen.
export function readPersistedUser(): PublicUser | undefined {
  try {
    const raw = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PublicUser) : undefined;
  } catch {
    return undefined;
  }
}

export function persistCurrentUser(user: PublicUser | null) {
  try {
    if (user) localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
  } catch {
    // localStorage may be unavailable (private mode); fall back to a network check.
  }
}

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
    // Seed from the last session so there's no loading flash on refresh; mark it
    // stale (updatedAt 0) so `/api/me` still re-checks the session in the background.
    initialData: readPersistedUser,
    initialDataUpdatedAt: 0,
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

export function useUpdateAvatarImage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (avatarImage: string | null) => authApi.updateAvatarImage(avatarImage),
    onSuccess: (data) => {
      client.setQueryData(queryKeys.currentUser, data.user);
    },
  });
}

export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: authApi.updateProfile,
    onSuccess: (data) => {
      client.setQueryData(queryKeys.currentUser, data.user);
    },
  });
}
