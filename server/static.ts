import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const rootDir = process.cwd();
const distDir = join(rootDir, "dist");
const publicDir = join(rootDir, "public");

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function streamFile(res: ServerResponse, filePath: string) {
  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": contentTypes[ext] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  createReadStream(filePath).pipe(res);
}

function safeJoin(base: string, requested: string): string | null {
  const normalized = normalize(requested).replace(/^([./\\])+/, "");
  const resolved = resolve(base, normalized);
  if (!resolved.startsWith(resolve(base))) return null;
  return resolved;
}

export function handleStatic(req: IncomingMessage, res: ServerResponse): boolean {
  if (!req.url || req.method !== "GET") return false;

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith("/api/")) return false;

  // Public assets (avatars).
  if (pathname.startsWith("/avatars/")) {
    const filePath = safeJoin(publicDir, pathname);
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404).end("Not found");
      return true;
    }
    streamFile(res, filePath);
    return true;
  }

  // Built SPA from `npm run build`. In dev Vite handles assets separately.
  if (!existsSync(distDir)) return false;

  const targetPath = pathname === "/" || pathname === "/home" ? "/index.html" : pathname;
  let filePath = safeJoin(distDir, targetPath);

  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = join(distDir, "index.html");
  }

  streamFile(res, filePath);
  return true;
}
