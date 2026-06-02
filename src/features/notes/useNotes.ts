import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Note } from "../../../shared/schemas";
import { queryKeys } from "../../shared/api/queryClient";
import * as notesApi from "./api";

export function useNotes() {
  return useQuery({
    queryKey: queryKeys.notes,
    queryFn: async () => (await notesApi.fetchNotes()).notes,
  });
}

export function useSaveNotes() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (notes: notesApi.NoteInput[]) => notesApi.saveNotes(notes),
    onSuccess: ({ notes }) => {
      client.setQueryData<Note[]>(queryKeys.notes, notes);
    },
  });
}
