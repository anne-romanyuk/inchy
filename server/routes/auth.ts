import { createRoute } from "@hono/zod-openapi";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { randomBytes } from "node:crypto";
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

const GOOGLE_STATE_COOKIE = "planner_google_oauth_state";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

type GoogleProfile = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
};

function getGoogleConfig(c: Context) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? new URL("/api/auth/google/callback", c.req.url).toString();
  return clientId && clientSecret ? { clientId, clientSecret, redirectUri } : null;
}

function redirectWithAuthError(c: Context, message: string) {
  return c.redirect(`/?authError=${encodeURIComponent(message)}`, 302);
}

function makeOAuthPasswordHash(provider: string, subject: string) {
  return `oauth:${provider}:${subject}`;
}

function googleFirstName(profile: GoogleProfile, email: string) {
  const source = profile.given_name || profile.name || email.split("@")[0] || "Google user";
  return source.trim().split(/\s+/)[0] || "Google user";
}

async function exchangeGoogleCode(code: string, config: { clientId: string; clientSecret: string; redirectUri: string }) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const payload = await response.json().catch(() => null) as { access_token?: string; error_description?: string } | null;
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description ?? "Could not complete Google sign-in.");
  }
  return payload.access_token;
}

async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = await response.json().catch(() => null) as GoogleProfile | null;
  if (!response.ok || !profile?.sub || !profile.email) {
    throw new Error("Could not read Google profile.");
  }
  return profile;
}

function findOrCreateGoogleUser(profile: GoogleProfile): UserRow {
  if (!profile.email_verified) {
    throw new Error("Google account email is not verified.");
  }

  const byGoogleId = db.prepare("SELECT * FROM users WHERE google_id = ?").get(profile.sub) as UserRow | undefined;
  if (byGoogleId) {
    const name = googleFirstName(profile, byGoogleId.email);
    if (byGoogleId.name !== name) {
      db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, byGoogleId.id);
      return { ...byGoogleId, name };
    }
    return byGoogleId;
  }

  const now = new Date().toISOString();
  const email = profile.email.trim().toLowerCase();
  const name = googleFirstName(profile, email);
  const existing = db.prepare("SELECT * FROM users WHERE lower(email) = ?").get(email) as UserRow | undefined;
  if (existing) {
    if (existing.google_id && existing.google_id !== profile.sub) {
      throw new Error("This email is already connected to another Google account.");
    }
    db.prepare("UPDATE users SET google_id = ?, google_email_verified = 1, name = ? WHERE id = ?").run(profile.sub, name, existing.id);
    return { ...existing, email, name };
  }

  const user: UserRow = {
    id: newId(),
    name,
    email,
    password_hash: makeOAuthPasswordHash("google", profile.sub),
    avatar_id: null,
    created_at: now,
  };

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, avatar_id, created_at, google_id, google_email_verified)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
  ).run(user.id, user.name, user.email, user.password_hash, user.avatar_id, user.created_at, profile.sub);

  return user;
}

authRoutes.get("/auth/google", (c) => {
  const config = getGoogleConfig(c);
  if (!config) {
    return redirectWithAuthError(c, "Google sign-in is not configured yet.");
  }

  const state = randomBytes(24).toString("hex");
  setCookie(c, GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 10 * 60,
  });

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  return c.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`, 302);
});

authRoutes.get("/auth/google/callback", async (c) => {
  const config = getGoogleConfig(c);
  if (!config) {
    return redirectWithAuthError(c, "Google sign-in is not configured yet.");
  }

  const code = c.req.query("code");
  const state = c.req.query("state");
  const expectedState = getCookie(c, GOOGLE_STATE_COOKIE);
  deleteCookie(c, GOOGLE_STATE_COOKIE, { path: "/" });

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithAuthError(c, "Google sign-in could not be verified.");
  }

  try {
    const accessToken = await exchangeGoogleCode(code, config);
    const profile = await fetchGoogleProfile(accessToken);
    const user = findOrCreateGoogleUser(profile);
    setSessionCookie(c, createSession(user.id));
    return c.redirect("/today", 302);
  } catch (error) {
    console.error("[google auth error]", error);
    const message = error instanceof Error ? error.message : "Google sign-in failed.";
    return redirectWithAuthError(c, message);
  }
});

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
