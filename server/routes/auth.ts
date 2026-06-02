import { createRoute } from "@hono/zod-openapi";
import { db } from "../db";
import { newId } from "../lib/ids";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  clearSessionCookie,
  createSession,
  destroySession,
  getSessionToken,
  readSessionUserId,
  setSessionCookie,
} from "../lib/session";
import { toPublicUser, type UserRow } from "../lib/mappers";
import { createApp } from "../openapi/hono";
import {
  AvatarInputSchema,
  ErrorResponseSchema,
  LoginInputSchema,
  NullableUserEnvelopeSchema,
  OkResponseSchema,
  RegisterInputSchema,
  UserEnvelopeSchema,
} from "../../shared/schemas";

export const authRoutes = createApp();

const jsonBody = <S extends Parameters<typeof createRoute>[0]["request"] extends infer R ? unknown : never>() => undefined;
void jsonBody;

const registerRoute = createRoute({
  method: "post",
  path: "/register",
  tags: ["Auth"],
  summary: "Create a new account",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: RegisterInputSchema } },
    },
  },
  responses: {
    201: { description: "Account created", content: { "application/json": { schema: UserEnvelopeSchema } } },
    409: { description: "Email already used", content: { "application/json": { schema: ErrorResponseSchema } } },
    422: { description: "Validation failed", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

authRoutes.openapi(registerRoute, async (c) => {
  const { name, email, password } = c.req.valid("json");
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return c.json({ errors: { email: "Account with this email already exists." } }, 409);
  }

  const user: UserRow = {
    id: newId(),
    name,
    email,
    password_hash: await hashPassword(password),
    avatar_id: null,
    created_at: new Date().toISOString(),
  };

  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, avatar_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(user.id, user.name, user.email, user.password_hash, user.avatar_id, user.created_at);

  setSessionCookie(c, createSession(user.id));
  return c.json({ user: toPublicUser(user) }, 201);
});

const loginRoute = createRoute({
  method: "post",
  path: "/login",
  tags: ["Auth"],
  summary: "Log in with email + password",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: LoginInputSchema } },
    },
  },
  responses: {
    200: { description: "Logged in", content: { "application/json": { schema: UserEnvelopeSchema } } },
    401: { description: "Incorrect credentials", content: { "application/json": { schema: ErrorResponseSchema } } },
    422: { description: "Validation failed", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

authRoutes.openapi(loginRoute, async (c) => {
  const { email, password } = c.req.valid("json");
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ message: "Email or password is incorrect." }, 401);
  }

  setSessionCookie(c, createSession(user.id));
  return c.json({ user: toPublicUser(user) }, 200);
});

const meRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["Auth"],
  summary: "Get the currently logged-in user",
  responses: {
    200: { description: "Current user", content: { "application/json": { schema: UserEnvelopeSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: NullableUserEnvelopeSchema } } },
  },
});

authRoutes.openapi(meRoute, (c) => {
  const token = getSessionToken(c);
  const userId = token ? readSessionUserId(token) : null;
  if (!userId) return c.json({ user: null }, 401);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;
  if (!user) return c.json({ user: null }, 401);

  return c.json({ user: toPublicUser(user) }, 200);
});

const logoutRoute = createRoute({
  method: "post",
  path: "/logout",
  tags: ["Auth"],
  summary: "Destroy current session",
  responses: {
    200: { description: "Logged out", content: { "application/json": { schema: OkResponseSchema } } },
  },
});

authRoutes.openapi(logoutRoute, (c) => {
  const token = getSessionToken(c);
  if (token) destroySession(token);
  clearSessionCookie(c);
  return c.json({ ok: true as const }, 200);
});

const avatarRoute = createRoute({
  method: "patch",
  path: "/me/avatar",
  tags: ["Auth"],
  summary: "Set the current user's avatar",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: AvatarInputSchema } },
    },
  },
  responses: {
    200: { description: "Avatar saved", content: { "application/json": { schema: UserEnvelopeSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ErrorResponseSchema } } },
    422: { description: "Validation failed", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

authRoutes.openapi(avatarRoute, async (c) => {
  const token = getSessionToken(c);
  const userId = token ? readSessionUserId(token) : null;
  if (!userId) return c.json({ message: "Authentication required." }, 401);

  const { avatarId } = c.req.valid("json");
  db.prepare("UPDATE users SET avatar_id = ? WHERE id = ?").run(avatarId, userId);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow;
  return c.json({ user: toPublicUser(user) }, 200);
});
