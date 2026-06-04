import { useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import type { Goal, GoalTask } from "../../../shared/schemas";
import { useGoals } from "../goals/useGoals";
import { AddToTodayButton } from "../goals/AddToTodayButton";
import { useOverflowFade } from "../../shared/hooks/useOverflowFade";

type Health = "overdue" | "due-today" | "due-soon";

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
    const done = task.subtasks.filter((s) => s.completed).length;
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

type Alert = {
  // Unique row key (the subtask or task id).
  id: string;
  // What the row shows as its main label — a subtask title or the task title.
  title: string;
  goal: Goal;
  health: Health;
  // The owning task's deadline, kept for stable ordering (subtasks inherit it).
  deadline: string | null;
  // Which kind of occurrence the "+ Today" button should create.
  source: { kind: "task"; goalTaskId: string } | { kind: "subtask"; goalSubtaskId: string };
};

const GROUPS: { health: Health; label: string }[] = [
  { health: "overdue", label: "Overdue" },
  { health: "due-today", label: "Due today" },
  { health: "due-soon", label: "Due soon" },
];

export function NeedsAttentionWidget() {
  const navigate = useNavigate();
  const goalsQuery = useGoals();
  const groupsScrollRef = useRef<HTMLDivElement>(null);

  const alerts = useMemo<Alert[]>(() => {
    const goals = goalsQuery.data ?? [];
    const collected: Alert[] = [];
    for (const goal of goals) {
      for (const task of goal.tasks) {
        const health = getTaskHealth(task);
        if (!health) continue;
        if (task.subtasks.length > 0) {
          // A task with subtasks can't be added to Today directly — surface its
          // open subtasks instead, each independently actionable.
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
    // Stable ordering: by the owning task's deadline ascending (most overdue first).
    collected.sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
    return collected;
  }, [goalsQuery.data]);

  const counts = useMemo(() => {
    return {
      overdue: alerts.filter((a) => a.health === "overdue").length,
      "due-today": alerts.filter((a) => a.health === "due-today").length,
      "due-soon": alerts.filter((a) => a.health === "due-soon").length,
    };
  }, [alerts]);

  useOverflowFade(groupsScrollRef, [alerts]);

  if (goalsQuery.isLoading) {
    return <div className="today-side-widget today-side-widget--placeholder" aria-hidden="true" />;
  }

  if (alerts.length === 0) {
    return (
      <div className="needs-attention needs-attention--empty" aria-label="Needs attention">
        <div className="needs-attention__empty-content">
          <div className="needs-attention__empty-text">
            <h2>All clear</h2>
            <p>No overdue or upcoming goal tasks. Nice work staying ahead.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="needs-attention"
      aria-label="Needs attention"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="needs-attention__header">
        <div className="needs-attention__title">
          <h2>Needs attention</h2>
          <p>Add important tasks to Today</p>
        </div>
        <div className="needs-attention__summary">
          {counts.overdue > 0 ? (
            <span className="needs-attention__count needs-attention__count--overdue">
              {counts.overdue} overdue
            </span>
          ) : null}
          {counts["due-today"] > 0 ? (
            <span className="needs-attention__count needs-attention__count--due-today">
              {counts["due-today"]} today
            </span>
          ) : null}
          {counts["due-soon"] > 0 ? (
            <span className="needs-attention__count needs-attention__count--due-soon">
              {counts["due-soon"]} soon
            </span>
          ) : null}
        </div>
      </header>

      <div className="needs-attention__groups fade-scroll app-scroll" ref={groupsScrollRef}>
        {GROUPS.map(({ health, label }) => {
          const items = alerts.filter((a) => a.health === health);
          if (items.length === 0) return null;
          return (
            <section key={health} className="needs-attention__group">
              <h3 className={`needs-attention__group-label needs-attention__group-label--${health}`}>
                {label}
              </h3>
              <ul className="needs-attention__list">
                {items.map((alert) => (
                  <li key={alert.id} className="needs-attention__item">
                    <span className={`needs-attention__dot needs-attention__dot--${health}`} aria-hidden="true" />
                    <button
                      type="button"
                      className="needs-attention__item-main"
                      onClick={() => navigate(`/goals/${alert.goal.id}`)}
                      title={alert.title}
                    >
                      <span className="needs-attention__item-title">{alert.title}</span>
                      <span className="needs-attention__item-goal">{alert.goal.title}</span>
                    </button>
                    {alert.source.kind === "subtask" ? (
                      <AddToTodayButton goalSubtaskId={alert.source.goalSubtaskId} size="sm" className="needs-attention__add" />
                    ) : (
                      <AddToTodayButton goalTaskId={alert.source.goalTaskId} size="sm" className="needs-attention__add" />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </motion.div>
  );
}
