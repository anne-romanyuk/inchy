import type { MiddlewareHandler } from "hono";
import { getSessionToken, readSessionUserId } from "../lib/session";

export type AuthEnv = {
  Variables: {
    userId: string;
  };
};

export const requireUser: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const token = getSessionToken(c);
  const userId = token ? readSessionUserId(token) : null;

  if (!userId) {
    return c.json({ message: "Authentication required." }, 401);
  }

  c.set("userId", userId);
  await next();
};
