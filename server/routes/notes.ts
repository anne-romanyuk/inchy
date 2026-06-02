import { createRoute } from "@hono/zod-openapi";
import { db } from "../db";
import { newId } from "../lib/ids";
import { toNote, type NoteRow } from "../lib/mappers";
import { requireUser, type AuthEnv } from "../middleware/auth";
import { createApp } from "../openapi/hono";
import {
  ErrorResponseSchema,
  NotesEnvelopeSchema,
  NotesSaveInputSchema,
} from "../../shared/schemas";

export const noteRoutes = createApp<AuthEnv>();
noteRoutes.use("*", requireUser);

function listNotes(userId: string): NoteRow[] {
  return db
    .prepare("SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC")
    .all(userId) as NoteRow[];
}

const listNotesRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Notes"],
  summary: "List the current user's notes",
  responses: {
    200: { description: "Notes", content: { "application/json": { schema: NotesEnvelopeSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

noteRoutes.openapi(listNotesRoute, (c) => {
  const userId = c.get("userId");
  return c.json({ notes: listNotes(userId).map(toNote) }, 200);
});

const saveNotesRoute = createRoute({
  method: "put",
  path: "/",
  tags: ["Notes"],
  summary: "Replace the current user's entire note set (bulk save)",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: NotesSaveInputSchema } },
    },
  },
  responses: {
    200: { description: "Saved notes", content: { "application/json": { schema: NotesEnvelopeSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ErrorResponseSchema } } },
  },
});

noteRoutes.openapi(saveNotesRoute, (c) => {
  const userId = c.get("userId");
  const { notes } = c.req.valid("json");
  const now = new Date().toISOString();

  const save = db.transaction(() => {
    // Preserve created_at and only bump updated_at for notes whose content changed.
    const existing = new Map(
      (db.prepare("SELECT id, title, body, category, created_at, updated_at FROM notes WHERE user_id = ?").all(userId) as Array<{
        id: string;
        title: string;
        body: string;
        category: string;
        created_at: string;
        updated_at: string;
      }>).map((row) => [row.id, row]),
    );

    db.prepare("DELETE FROM notes WHERE user_id = ?").run(userId);

    const insert = db.prepare(
      `INSERT INTO notes (id, user_id, position, title, body, category, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    notes.forEach((note, index) => {
      const id = note.id ?? newId();
      const previous = existing.get(id);
      const category = note.category ?? "";
      const createdAt = previous?.created_at ?? now;
      const updatedAt =
        previous &&
        previous.title === note.title &&
        previous.body === note.body &&
        (previous.category ?? "") === category
          ? previous.updated_at
          : now;
      insert.run(id, userId, index, note.title, note.body, category, createdAt, updatedAt);
    });
  });

  save();

  return c.json({ notes: listNotes(userId).map(toNote) }, 200);
});
