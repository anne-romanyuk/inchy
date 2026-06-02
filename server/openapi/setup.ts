import { extendZodWithOpenApi } from "@hono/zod-openapi";
import { z } from "zod";

// Enable .openapi() on every plain-zod schema (including those defined in shared/schemas.ts).
extendZodWithOpenApi(z);
