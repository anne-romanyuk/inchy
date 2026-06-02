import type { FocusMode, FocusSession, FocusSessionStatus } from "../../../shared/schemas";
import { apiFetch } from "../../shared/api/client";

export type StartFocusSessionInput = {
  plannedSeconds: number;
  mode: FocusMode;
  taskId?: string;
  label?: string;
};

export type FinishFocusSessionInput = {
  status: Exclude<FocusSessionStatus, "active">;
  durationSeconds?: number;
  taskDurations?: Array<{ taskId: string; durationSeconds: number }>;
};

export function getActiveFocusSession() {
  return apiFetch<{ session: FocusSession | null }>("/api/focus-sessions/active");
}

export function startFocusSession(input: StartFocusSessionInput) {
  return apiFetch<{ session: FocusSession }>("/api/focus-sessions", {
    method: "POST",
    body: input,
  });
}

export function finishFocusSession(id: string, input: FinishFocusSessionInput) {
  return apiFetch<{ session: FocusSession }>(`/api/focus-sessions/${id}`, {
    method: "PATCH",
    body: input,
  });
}
