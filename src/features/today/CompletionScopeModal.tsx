import { useEffect } from "react";
import { motion } from "motion/react";
import type { Occurrence } from "../../../shared/schemas";

type Props = {
  occurrence: Occurrence | null;
  onClose: () => void;
  onPick: (scope: "today" | "whole") => void;
};

/**
 * Confirm asked when ticking a goal-linked occurrence done: did the user
 * mean "for today" (close just this occurrence) or "for the whole goal
 * task / subtask" (also close the underlying goal item).
 *
 * Rendered as an absolute overlay INSIDE the Today widget panel — exactly
 * like the pomodoro reset confirmation overlays its own panel. This keeps
 * the modal scoped to the relevant area instead of dimming the whole page.
 *
 * Standalone occurrences never reach this modal.
 */
export function CompletionScopeModal({ occurrence, onClose, onPick }: Props) {
  useEffect(() => {
    if (!occurrence) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [occurrence, onClose]);

  if (!occurrence) return null;

  const isSubtask = occurrence.sourceKind === "goal_subtask";
  const wholeLabel = isSubtask ? "Finish whole subtask" : "Finish whole task";

  return (
    <motion.div
      className="pomodoro-confirm-overlay tasks-confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm completion scope"
      initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: 8, filter: "blur(8px)" }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="pomodoro-confirm__card scope-confirm">
        <button
          type="button"
          className="task-modal__close scope-confirm__close"
          aria-label="Close"
          onClick={onClose}
        >
          x
        </button>
        <div className="pomodoro-confirm__icon" aria-hidden="true">
          <CheckIcon />
        </div>
        <div className="pomodoro-confirm__content">
          <h3>Done with “{occurrence.title}”?</h3>
          <p>
            This item came from a goal. Closing it for today keeps the goal
            item open — you can add it to another day.
          </p>
        </div>
        <div className="pomodoro-confirm__actions">
          <button
            type="button"
            className="pomodoro-btn pomodoro-btn--ghost-text"
            onClick={() => onPick("today")}
          >
            Just for today
          </button>
          <button
            type="button"
            className="task-add"
            onClick={() => onPick("whole")}
          >
            {wholeLabel}
          </button>
        </div>
        <button
          type="button"
          className="pomodoro-btn pomodoro-btn--ghost-text scope-confirm__cancel"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
