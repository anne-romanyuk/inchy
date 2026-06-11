import { motion } from "motion/react";
import { Link, useNavigate } from "react-router-dom";
import type { Goal, GoalTask } from "../../../shared/schemas";
import { AddToTodayButton } from "../goals/AddToTodayButton";
import { useGoals } from "../goals/useGoals";

type Health = "overdue" | "due-today" | "due-soon";

type Alert = {
  id: string;
  title: string;
  goal: Goal;
  health: Health;
  deadline: string | null;
  source: { kind: "task"; goalTaskId: string } | { kind: "subtask"; goalSubtaskId: string };
};

const GROUPS: { health: Health; label: string }[] = [
  { health: "overdue", label: "Overdue" },
  { health: "due-today", label: "Due today" },
  { health: "due-soon", label: "Due soon" },
];

function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getTaskProgress(task: GoalTask) {
  if (task.subtasks && task.subtasks.length > 0) {
    const done = task.subtasks.filter((subtask) => subtask.completed).length;
    return done / task.subtasks.length;
  }
  return task.completed ? 1 : 0;
}

function isTaskComplete(task: GoalTask) {
  return getTaskProgress(task) >= 1;
}

function getTaskHealth(task: GoalTask): Health | null {
  if (!task.deadline || isTaskComplete(task)) return null;
  const today = isoDate(0);
  if (task.deadline < today) return "overdue";
  if (task.deadline === today) return "due-today";
  if (task.deadline === isoDate(1)) return "due-soon";
  return null;
}

function collectAlerts(goals: Goal[]): Alert[] {
  const collected: Alert[] = [];
  for (const goal of goals) {
    for (const task of goal.tasks) {
      const health = getTaskHealth(task);
      if (!health) continue;
      if (task.subtasks.length > 0) {
        for (const subtask of task.subtasks) {
          if (subtask.completed) continue;
          collected.push({
            id: subtask.id,
            title: subtask.title,
            goal,
            health,
            deadline: task.deadline,
            source: { kind: "subtask", goalSubtaskId: subtask.id },
          });
        }
      } else {
        collected.push({
          id: task.id,
          title: task.title,
          goal,
          health,
          deadline: task.deadline,
          source: { kind: "task", goalTaskId: task.id },
        });
      }
    }
  }
  collected.sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
  return collected;
}

export function TodayAlertsMobile() {
  const navigate = useNavigate();
  const goalsQuery = useGoals();
  const goals = goalsQuery.data ?? [];
  const alerts = collectAlerts(goals);
  const goBackToToday = () => {
    const routerIndex = typeof window !== "undefined" ? window.history.state?.idx : null;
    if (typeof routerIndex === "number" && routerIndex > 0) {
      navigate(-1);
      return;
    }
    navigate("/today", { replace: true });
  };

  return (
    <motion.div
      className="mobile-alerts"
      aria-label="Needs attention"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="mobile-alerts__header">
        <button
          type="button"
          className="ui-icon-btn ui-icon-btn--subtle mobile-alerts__back"
          aria-label="Back to Today"
          onClick={goBackToToday}
        >
          <span className="mobile-alerts__back-icon" aria-hidden="true">‹</span>
        </button>
        <div>
          <h1>Needs attention</h1>
          <p>Add important tasks to Today</p>
        </div>
      </header>

      <div className="mobile-alerts__groups app-scroll">
        {goalsQuery.isLoading ? (
          <p className="mobile-alerts__empty">Loading alerts...</p>
        ) : alerts.length ? (
          <>
            {GROUPS.map(({ health, label }) => {
            const items = alerts.filter((alert) => alert.health === health);
            if (!items.length) return null;
            return (
              <section key={health} className="mobile-alerts__group">
                <h3 className={`mobile-alerts__group-label mobile-alerts__group-label--${health}`}>
                  {label}
                </h3>
                <ul className="mobile-alerts__list">
                  {items.map((alert) => (
                    <li key={alert.id} className="mobile-alerts__item">
                      <span className={`mobile-alerts__dot mobile-alerts__dot--${health}`} aria-hidden="true" />
                      <Link
                        to={`/goals/${alert.goal.id}`}
                        className="mobile-alerts__item-main"
                        title={alert.title}
                      >
                        <span className="mobile-alerts__item-title">{alert.title}</span>
                        <span className="mobile-alerts__item-goal">{alert.goal.title}</span>
                      </Link>
                      {alert.source.kind === "subtask" ? (
                        <AddToTodayButton goalSubtaskId={alert.source.goalSubtaskId} size="sm" className="mobile-alerts__add" />
                      ) : (
                        <AddToTodayButton goalTaskId={alert.source.goalTaskId} size="sm" className="mobile-alerts__add" />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
            })}
          </>
        ) : (
          <p className="mobile-alerts__empty">No overdue or upcoming goal tasks.</p>
        )}
      </div>
    </motion.div>
  );
}
