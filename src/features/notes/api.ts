import type { Note } from "../../../shared/schemas";
import { apiFetch } from "../../shared/api/client";

export type NoteInput = { id?: string; title: string; body: string; category?: string; pinned?: boolean };

export function fetchNotes() {
  return apiFetch<{ notes: Note[] }>("/api/notes");
}

/** Replace the user's entire note set (bulk save). Returns the saved notes. */
export function saveNotes(notes: NoteInput[]) {
  return apiFetch<{ notes: Note[] }>("/api/notes", {
    method: "PUT",
    body: { notes },
  });
}
