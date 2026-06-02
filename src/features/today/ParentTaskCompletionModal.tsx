import { useEffect } from "react";
import { motion } from "motion/react";

type Props = {
  open: boolean;
  taskTitle: string;
  onClose: () => void;
  onConfirm: () => void;
};

/**
 * Secondary confirm shown right after the user finishes the LAST open
 * subtask of a goal task via "Finish whole subtask". Asks whether to also
 * close the parent goal task entirely.
 *
 * Rendered as an absolute overlay INSIDE the Today widget panel — mirrors
 * the pomodoro reset confirmation in placement and visual.
 */
export function ParentTaskCompletionModal({ open, taskTitle, onClose, onConfirm }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <motion.div
      className="pomodoro-confirm-overlay tasks-confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Close parent goal task"
      initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: 8, filter: "blur(8px)" }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="pomodoro-confirm__card">
        <div className="pomodoro-confirm__icon" aria-hidden="true">
          <CheckIcon />
        </div>
        <div className="pomodoro-confirm__content">
          <h3>All subtasks done.</h3>
          <p>Close the whole goal task “{taskTitle}” as well?</p>
        </div>
        <div className="pomodoro-confirm__actions">
          <button
            type="button"
            className="pomodoro-btn pomodoro-btn--ghost-text"
            onClick={onClose}
          >
            Keep it open
          </button>
          <button
            type="button"
            className="task-add"
            onClick={onConfirm}
          >
            Close goal task
          </button>
        </div>
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
