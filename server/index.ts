import "./env";
import "./openapi/setup";

import { swaggerUI } from "@hono/swagger-ui";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { clearExpiredSessions, runMigrations } from "./db";
import { importLegacyJson } from "./migrate-json";
import { authRoutes } from "./routes/auth";
import { focusSessionRoutes } from "./routes/focusSessions";
import { goalRoutes } from "./routes/goals";
import { noteRoutes } from "./routes/notes";
import { occurrenceRoutes } from "./routes/occurrences";
import { taskRoutes, defaultTaskRoutes } from "./routes/tasks";
import { handleStatic } from "./static";
import { createApp } from "./openapi/hono";

runMigrations();
importLegacyJson();
clearExpiredSessions();

const app = createApp();

app.route("/api", authRoutes);
app.route("/api/tasks", taskRoutes);
app.route("/api/default-tasks", defaultTaskRoutes);
app.route("/api/focus-sessions", focusSessionRoutes);
app.route("/api/goals", goalRoutes);
app.route("/api/notes", noteRoutes);
app.route("/api/occurrences", occurrenceRoutes);

app.doc("/api/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Planner API",
    version: "1.0.0",
    description: "Auth, tasks and default task pool for the Inchy planner.",
  },
  servers: [{ url: "/" }],
});

app.get("/api/docs", swaggerUI({ url: "/api/openapi.json" }));

app.onError((error, c) => {
  console.error("[api error]", error);
  return c.json({ message: "Something went wrong." }, 500);
});

async function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", rejectBody);
  });
}

async function nodeRequestToFetch(req: IncomingMessage): Promise<Request> {
  const protocol = (req.socket as any).encrypted ? "https" : "http";
  const host = req.headers.host ?? "localhost";
  const url = `${protocol}://${host}${req.url ?? "/"}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  const method = req.method ?? "GET";
  const init: RequestInit = { method, headers };

  if (method !== "GET" && method !== "HEAD") {
    const body = await readBody(req);
    if (body.length) init.body = new Uint8Array(body);
  }

  return new Request(url, init);
}

async function writeFetchResponse(response: Response, res: ServerResponse) {
  const headers: Record<string, string | string[]> = {};
  const setCookieValues: string[] = [];

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      setCookieValues.push(value);
    } else {
      headers[key] = value;
    }
  });

  res.writeHead(response.status, {
    ...headers,
    ...(setCookieValues.length ? { "Set-Cookie": setCookieValues } : {}),
  });

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) res.write(Buffer.from(value));
  }
  res.end();
}

const port = Number(process.env.PORT) || 3000;

const server = createServer(async (req, res) => {
  try {
    const url = req.url ?? "/";

    if (url.startsWith("/api/")) {
      const fetchReq = await nodeRequestToFetch(req);
      const fetchRes = await app.fetch(fetchReq);
      await writeFetchResponse(fetchRes, res);
      return;
    }

    const served = handleStatic(req, res);
    if (!served) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
  } catch (error) {
    console.error("[server error]", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(JSON.stringify({ message: "Something went wrong." }));
  }
});

server.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
  console.log(`[server] swagger UI:  http://localhost:${port}/api/docs`);
});
