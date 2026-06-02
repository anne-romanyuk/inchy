import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Occurrence } from "../../../shared/schemas";
import { queryKeys } from "../../shared/api/queryClient";
import {
  todayDateKey,
  useCreateOccurrence,
  useOccurrences,
} from "../today/useOccurrences";

type Props = {
  // Either goalTaskId OR goalSubtaskId — exactly one. The component decides
  // which kind of occurrence to create based on which one is passed.
  goalTaskId?: string;
  goalSubtaskId?: string;
  label?: string;
  className?: string;
  size?: "sm" | "md";
};

/**
 * Compact "+ Today" button placed next to a goal task or subtask row.
 *
 * Behaviour:
 *  - Disabled (with a tooltip) when the source already has an open
 *    occurrence on today's date — uses the cached occurrences list so we
 *    don't issue an extra request.
 *  - On click, POSTs a new occurrence. On 409 (server detected a race) we
 *    transparently keep the disabled state.
 *  - On 409 because the goal task has subtasks (only relevant for goalTaskId
 *    usage), surfaces a short inline hint.
 */
export function AddToTodayButton({
  goalTaskId,
  goalSubtaskId,
  label,
  className = "",
  size = "sm",
}: Props) {
  const today = todayDateKey();
  const occurrencesQuery = useOccurrences(today);
  const createOccurrence = useCreateOccurrence();
  const client = useQueryClient();
  const [errorHint, setErrorHint] = useState<string | null>(null);

  // Look up today's occurrences from the React Query cache. If the user
  // hasn't visited Today yet this session, the query may still be loading —
  // in that case we err on the side of allowing the click. The server will
  // reject duplicates with 409.
  const occurrences: Occurrence[] = occurrencesQuery.data ?? [];
  const isAlreadyOnToday = occurrences.some((occ) => {
    if (occ.completed) return false;
    if (goalTaskId) return occ.goalTaskId === goalTaskId && occ.sourceKind === "goal_task";
    if (goalSubtaskId) return occ.goalSubtaskId === goalSubtaskId && occ.sourceKind === "goal_subtask";
    return false;
  });

  const handleClick = async () => {
    setErrorHint(null);
    try {
      if (goalSubtaskId) {
        await createOccurrence.mutateAsync({
          sourceKind: "goal_subtask",
          occurrenceDate: today,
          goalSubtaskId,
        });
      } else if (goalTaskId) {
        await createOccurrence.mutateAsync({
          sourceKind: "goal_task",
          occurrenceDate: today,
          goalTaskId,
        });
      }
      // Refresh cache so the "already on today" state takes effect.
      client.invalidateQueries({ queryKey: queryKeys.occurrences(today) });
    } catch (e: any) {
      const payload = e?.payload;
      const message =
        payload?.message ??
        (e instanceof Error ? e.message : "Could not add to today.");
      setErrorHint(message);
      // Auto-clear so the hint doesn't linger.
      setTimeout(() => setErrorHint(null), 4000);
    }
  };

  const isPending = createOccurrence.isPending;
  const disabled = isAlreadyOnToday || isPending;

  return (
    <span className={`add-to-today ${className}`.trim()}>
      <button
        type="button"
        className={`add-to-today__btn add-to-today__btn--${size} ${isAlreadyOnToday ? "is-on-today" : ""} ${disabled ? "is-disabled" : ""}`.trim()}
        onClick={handleClick}
        disabled={disabled}
        aria-label={
          isAlreadyOnToday
            ? "Already on today"
            : isPending
              ? "Adding to today…"
              : label ?? "Add to today"
        }
        title={
          isAlreadyOnToday
            ? "Already on today"
            : isPending
              ? "Adding…"
              : "Add to today"
        }
      >
        <span aria-hidden="true">{isAlreadyOnToday ? "✓" : "+"}</span>
        <span className="add-to-today__btn-label">
          {isAlreadyOnToday ? "Today" : isPending ? "…" : "Today"}
        </span>
      </button>
      {errorHint ? <span className="add-to-today__hint">{errorHint}</span> : null}
    </span>
  );
}
