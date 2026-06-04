import type { PublicUser } from "../../../shared/schemas";
import { apiFetch } from "../../shared/api/client";

export type AuthErrors = Partial<Record<"name" | "email" | "password" | "confirmPassword", string>>;

export type LoginInput = { email: string; password: string };
export type RegisterInput = LoginInput & { name: string; confirmPassword: string };

export function login(input: LoginInput) {
  return apiFetch<{ user: PublicUser }>("/api/login", { method: "POST", body: input });
}

export function register(input: RegisterInput) {
  return apiFetch<{ user: PublicUser }>("/api/register", { method: "POST", body: input });
}

export function googleLoginUrl() {
  return "/api/auth/google";
}

export function logout() {
  return apiFetch<{ ok: true }>("/api/logout", { method: "POST" });
}

export function fetchMe() {
  return apiFetch<{ user: PublicUser | null }>("/api/me");
}

export function updateAvatar(avatarId: string) {
  return apiFetch<{ user: PublicUser }>("/api/me/avatar", { method: "PATCH", body: { avatarId } });
}
