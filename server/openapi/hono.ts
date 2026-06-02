import "./setup";

import { OpenAPIHono } from "@hono/zod-openapi";
import type { ZodError } from "zod";

export type FieldErrors = Record<string, string>;

function flattenErrors(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function createApp<E extends object = {}>() {
  return new OpenAPIHono<E>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json({ errors: flattenErrors(result.error) }, 422);
      }
    },
  });
}
