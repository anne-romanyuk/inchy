import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AnimatePresence,
  motion,
  Reorder,
  useDragControls,
} from "motion/react";
import type { Goal, GoalTask, GoalSubtask } from "../../../shared/schemas";
import {
  MAX_GOAL_TASK_NOTE,
  MAX_GOAL_SUBTASK_TITLE,
  MAX_TITLE_LENGTH,
  MAX_GOAL_TASKS,
  MAX_GOAL_SUBTASKS,
} from "../../../shared/constants";
import {
  useCreateGoal,
  useDeleteGoal,
  useGoals,
  useUpdateGoal,
} from "./useGoals";
import { defaultGoalIcon, forestGoalIcons, getForestGoalIconId, getGoalIconSrc } from "./goalIcons";
import { AddToTodayButton } from "./AddToTodayButton";
import { GoalDatePicker } from "./GoalDatePicker";

type DraftTask = {
  id: string;
  title: string;
  deadline: string;
  completed: boolean;
  iconId: string | null;
};

type DraftGoal = {
  title: string;
  deadline: string;
  iconId: string | null;
  tasks: DraftTask[];
};

const emptyDraft = (): DraftGoal => ({
  title: "",
  deadline: "",
  iconId: null,
  tasks: [],
});

function newDraftTask(): DraftTask {
  return {
    id: crypto.randomUUID(),
    title: "",
    deadline: "",
    completed: false,
    iconId: null,
  };
}

function toDraft(goal?: Goal): DraftGoal {
  if (!goal) return emptyDraft();
  return {
    title: goal.title,
    deadline: goal.deadline ?? "",
    iconId: goal.iconId ?? null,
    tasks: goal.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      deadline: task.deadline ?? "",
      completed: task.completed,
      iconId: task.iconId ?? null,
    })),
  };
}

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
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

function getProgress(tasks: GoalTask[]) {
  if (!tasks.length) return 0;
  const sum = tasks.reduce((acc, task) => acc + getTaskProgress(task), 0);
  return Math.round((sum / tasks.length) * 100);
}

function getTaskState(task: GoalTask, index: number, activeIndex: number) {
  if (isTaskComplete(task)) return "completed";
  if (index === activeIndex) return "in-progress";
  return "upcoming";
}

function todayIsoDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isPastDate(value?: string | null) {
  if (!value) return false;
  return value < todayIsoDate();
}

function tomorrowIsoDate() {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getTaskHealth(task: GoalTask): "overdue" | "due-today" | "due-soon" | null {
  if (!task.deadline || isTaskComplete(task)) return null;
  const today = todayIsoDate();
  if (task.deadline < today) return "overdue";
  if (task.deadline === today) return "due-today";
  if (task.deadline === tomorrowIsoDate()) return "due-soon";
  return null;
}

function hasOverdueOpenTask(goal: Goal) {
  return goal.tasks.some((task) => !isTaskComplete(task) && isPastDate(task.deadline));
}

function getStatusLabel(goal: Goal) {
  if (!goal.tasks.length) return "No plan";
  if (goal.tasks.every((task) => isTaskComplete(task))) return "Completed";
  // Only open tasks contribute to At risk / Needs attention.
  const openHealths = goal.tasks
    .filter((task) => !isTaskComplete(task))
    .map((task) => getTaskHealth(task));
  if (openHealths.includes("overdue")) return "At risk";
  if (openHealths.includes("due-today")) return "Needs attention";
  return "On track";
}

function getStatusClassName(goal: Goal) {
  return `goal-status-chip goal-status-chip--${getStatusLabel(goal).toLowerCase().replace(/\s+/g, "-")}`;
}

function GoalTaskIcon({ iconId, alt = "" }: { iconId?: string | null; alt?: string }) {
  const effectiveIconId = getForestGoalIconId(iconId);
  return <img src={getGoalIconSrc(effectiveIconId)} alt={alt} className="goal-task-icon" data-icon={effectiveIconId} draggable={false} />;
}

function IconPicker({ value, onChange }: { value: string | null; onChange: (iconId: string | null) => void }) {
  const options = forestGoalIcons;
  const selectedIconId = getForestGoalIconId(value);
  return (
    <div className="goal-icon-picker" aria-label="Choose a goal task icon">
      {options.map((icon) => {
        const selected = selectedIconId === icon.id;
        return (
          <button
            key={icon.id}
            type="button"
            className={`goal-icon-choice ${selected ? "is-selected" : ""}`.trim()}
            onClick={() => onChange(icon.id === defaultGoalIcon.id ? null : icon.id)}
            aria-pressed={selected}
            aria-label={icon.label}
            title={icon.label}
          >
            <img src={getGoalIconSrc(icon.id)} alt="" draggable={false} />
            {selected ? <span className="goal-icon-choice__check">✓</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function GoalActionIcon({
  type,
  label,
  onClick,
  disabled = false,
  className = "",
}: {
  type: "edit" | "delete" | "add" | "save" | "cancel";
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const actionType = type === "add" ? "save" : type;
  return (
    <button
      type="button"
      className={`task-action task-action--${actionType} goal-action-icon ${className}`.trim()}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {type === "edit" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 17.5L4.5 20L7 19.5L17.8 8.7L15.8 6.7L5 17.5Z" />
          <path d="M14.8 7.7L16.9 5.6C17.5 5 18.4 5 19 5.6L19.4 6C20 6.6 20 7.5 19.4 8.1L17.3 10.2" />
        </svg>
      ) : null}
      {type === "save" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5.5 12.6L10 17.1L18.8 7.9" />
        </svg>
      ) : null}
      {type === "cancel" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 7L17 17M17 7L7 17" />
        </svg>
      ) : null}
      {type === "delete" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M8 8.5H16" />
          <path d="M10 8.5V6.8C10 6.2 10.5 5.7 11.1 5.7H12.9C13.5 5.7 14 6.2 14 6.8V8.5" />
          <path d="M9 10.5L9.5 18.2C9.6 19 10.2 19.5 11 19.5H13C13.8 19.5 14.4 19 14.5 18.2L15 10.5" />
          <path d="M11.2 12.3L11.4 17M12.8 12.3L12.6 17" />
        </svg>
      ) : null}
      {type === "add" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 5V19M5 12H19" />
        </svg>
      ) : null}
    </button>
  );
}

function GoalTaskEditor({
  task,
  onChange,
  onRemove,
  disableRemove,
}: {
  task: DraftTask;
  onChange: (updates: Partial<DraftTask>) => void;
  onRemove: () => void;
  disableRemove: boolean;
}) {
  const dragControls = useDragControls();
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <Reorder.Item
      value={task}
      dragListener={false}
      dragControls={dragControls}
      className="goal-task-editor"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
    >
      <button
        type="button"
        className="goal-task-editor__drag"
        aria-label="Drag task to reorder"
        onPointerDown={(event) => dragControls.start(event)}
      >
        <span />
        <span />
        <span />
      </button>
      <div className="goal-task-editor__icon-wrap">
        <button
          type="button"
          className="goal-task-editor__icon"
          onClick={() => setPickerOpen((current) => !current)}
          aria-label="Choose task icon"
        >
          <GoalTaskIcon iconId={task.iconId} />
        </button>
        {pickerOpen ? (
          <div className="goal-task-editor__popover">
            <IconPicker
              value={task.iconId}
              onChange={(iconId) => {
                onChange({ iconId });
                setPickerOpen(false);
              }}
            />
          </div>
        ) : null}
      </div>
      <input
        value={task.title}
        onChange={(event) => onChange({ title: event.target.value })}
        placeholder="Task name"
        maxLength={MAX_TITLE_LENGTH}
        className="goal-input goal-task-editor__title"
      />
      <GoalDatePicker
        value={task.deadline}
        onChange={(deadline) => onChange({ deadline })}
        className="goal-task-editor__date"
        ariaLabel="Task deadline"
      />
      <GoalActionIcon
        type="delete"
        label="Remove task"
        onClick={onRemove}
        disabled={disableRemove}
        className="goal-task-editor__remove"
      />
    </Reorder.Item>
  );
}

function GoalEditorModal({
  goal,
  onClose,
}: {
  goal: Goal | null;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<DraftGoal>(() =>
    toDraft(goal ?? undefined),
  );
  const [newTask, setNewTask] = useState<DraftTask>(() => newDraftTask());
  const [newTaskPickerOpen, setNewTaskPickerOpen] = useState(false);
  const [goalIconPickerOpen, setGoalIconPickerOpen] = useState(false);
  const [error, setError] = useState("");
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const isEditing = Boolean(goal);
  const isSaving = createGoal.isPending || updateGoal.isPending;

  const updateTask = (id: string, updates: Partial<DraftTask>) => {
    setDraft((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === id ? { ...task, ...updates } : task,
      ),
    }));
  };

  const addTask = () => {
    const title = newTask.title.trim();
    if (!title) {
      setError("Task needs a name before it joins the mission.");
      return;
    }
    setError("");
    setDraft((current) => ({
      ...current,
      tasks: [...current.tasks, { ...newTask, id: crypto.randomUUID(), title }],
    }));
    setNewTask(newDraftTask());
  };

  const removeTask = (id: string) => {
    setDraft((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== id),
    }));
  };

  const save = async () => {
    const title = draft.title.trim();
    const deadline = draft.deadline || null;
    const tasks = draft.tasks
      .map((task) => ({
        id: task.id,
        title: task.title.trim(),
        deadline: task.deadline || null,
        completed: task.completed,
        iconId: task.iconId || null,
      }))
      .filter((task) => task.title);

    if (!title) {
      setError("Goal needs a name — even a tiny heroic one.");
      return;
    }
    setError("");
    try {
      if (goal) {
        await updateGoal.mutateAsync({
          id: goal.id,
          input: { title, deadline, iconId: draft.iconId || null },
        });
      } else {
        await createGoal.mutateAsync({ title, deadline, iconId: draft.iconId || null, tasks });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save goal.");
    }
  };

  return (
    <motion.div
      className="goal-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.section
        className="goal-modal goal-side-sheet tasks-panel tasks-panel--today app-scroll"
        initial={{ opacity: 0, x: -32 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -28 }}
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? "Edit goal" : "Create goal"}
      >
        <header className="goal-modal__header">
          <div>
            <p className="goal-kicker">
              {isEditing ? "Edit goal" : "New goal"}
            </p>
            <h2>{isEditing ? "Tune the route" : "Create a goal"}</h2>
          </div>
          <button
            type="button"
            className="goal-icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="goal-form-grid">
          <label className="goal-field goal-field--wide">
            <span>Goal name</span>
            <input
              className="goal-input goal-input--large"
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              maxLength={MAX_TITLE_LENGTH}
              placeholder="e.g. Apply for residence permit"
              autoFocus
            />
          </label>
          <label className="goal-field">
            <span>Deadline · optional</span>
            <GoalDatePicker
              value={draft.deadline}
              onChange={(deadline) =>
                setDraft((current) => ({
                  ...current,
                  deadline,
                }))
              }
              className="goal-date-picker--large"
              ariaLabel="Goal deadline"
            />
          </label>
        </div>

        <div className="goal-editor-icon-block">
          <button
            type="button"
            className="goal-detail-editor__icon"
            onClick={() => setGoalIconPickerOpen((current) => !current)}
            aria-label="Choose goal icon"
          >
            <GoalTaskIcon iconId={draft.iconId} />
          </button>
          <div>
            <span>Pick the icon for this goal summary.</span>
          </div>
          {goalIconPickerOpen ? (
            <div className="goal-editor-icon-block__popover">
              <IconPicker
                value={draft.iconId}
                onChange={(iconId) => {
                  setDraft((current) => ({ ...current, iconId }));
                  setGoalIconPickerOpen(false);
                }}
              />
            </div>
          ) : null}
        </div>

        {!isEditing ? (
        <div className="goal-editor-section">
          <div className="goal-editor-section__head">
            <div>
              <h3>Break it into steps</h3>
            </div>
          </div>

          <Reorder.Group
            axis="y"
            values={draft.tasks}
            onReorder={(tasks) =>
              setDraft((current) => ({ ...current, tasks }))
            }
            className="goal-task-editor-list"
          >
            <AnimatePresence initial={false}>
              {draft.tasks.map((task) => (
                <GoalTaskEditor
                  key={task.id}
                  task={task}
                  onChange={(updates) => updateTask(task.id, updates)}
                  onRemove={() => removeTask(task.id)}
                  disableRemove={false}
                />
              ))}
            </AnimatePresence>
          </Reorder.Group>

          <div className="goal-task-add-row" aria-label="Add task to goal">
            <div className="goal-task-editor__icon-wrap goal-task-add-row__icon-wrap">
              <button
                type="button"
                className="goal-task-editor__icon goal-task-add-row__icon"
                onClick={() => setNewTaskPickerOpen((current) => !current)}
                aria-label="Choose new task icon"
                title="Choose icon"
              >
                <GoalTaskIcon iconId={newTask.iconId} />
              </button>
              {newTaskPickerOpen ? (
                <div className="goal-task-editor__popover">
                  <IconPicker
                    value={newTask.iconId}
                    onChange={(iconId) => {
                      setNewTask((current) => ({ ...current, iconId }));
                      setNewTaskPickerOpen(false);
                    }}
                  />
                </div>
              ) : null}
            </div>
            <input
              value={newTask.title}
              onChange={(event) =>
                setNewTask((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTask();
                }
              }}
              placeholder="New task"
              maxLength={MAX_TITLE_LENGTH}
              className="goal-input goal-task-editor__title"
            />
            <GoalDatePicker
              value={newTask.deadline}
              onChange={(deadline) =>
                setNewTask((current) => ({
                  ...current,
                  deadline,
                }))
              }
              className="goal-task-editor__date"
              ariaLabel="New task deadline"
            />
            <button
              type="button"
              className="add-icon-btn"
              onClick={addTask}
              aria-label="Add task"
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>
        </div>
        ) : null}

        <p className="goal-error" aria-live="polite">
          {error}
        </p>

        <footer className="goal-modal__footer">
          <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="task-add"
            onClick={save}
            disabled={isSaving}
          >
            {isSaving
              ? "Saving..."
              : isEditing
                ? "Save changes"
                : "Create Goal"}
          </button>
        </footer>
      </motion.section>
    </motion.div>
  );
}

export function GoalJourney({
  goal,
  compact = false,
  selectableGoals,
  selectedGoalId,
  onSelectGoal,
}: {
  goal: Goal;
  compact?: boolean;
  selectableGoals?: Goal[];
  selectedGoalId?: string;
  onSelectGoal?: (goalId: string) => void;
}) {
  const progress = getProgress(goal.tasks);
  const rawActiveIndex = goal.tasks.findIndex((task) => !isTaskComplete(task));
  const activeIndex = rawActiveIndex >= 0 ? rawActiveIndex : Math.max(0, goal.tasks.length - 1);
  const fallbackTasks: GoalTask[] = goal.tasks.length ? goal.tasks : [];
  const canSelectGoal = Boolean(selectableGoals?.length && onSelectGoal);
  const statusLabel = getStatusLabel(goal);
  const statusClassName = `goal-journey__status goal-journey__status--${statusLabel.toLowerCase().replace(/\s+/g, "-")}`;
  const maxVisible = compact ? 5 : 7;

  let startIndex = 0;
  if (compact && fallbackTasks.length > maxVisible) {
    const leftSlots = Math.floor((maxVisible - 1) / 2);
    const rightSlots = maxVisible - leftSlots - 1;
    startIndex = Math.max(0, activeIndex - leftSlots);
    const maxStart = Math.max(0, fallbackTasks.length - maxVisible);
    startIndex = Math.min(startIndex, maxStart);
    const minStartForRight = Math.max(0, activeIndex - (maxVisible - rightSlots - 1));
    startIndex = Math.max(Math.min(startIndex, maxStart), Math.min(minStartForRight, maxStart));
  }
  const endIndex = Math.min(fallbackTasks.length, startIndex + maxVisible);
  const visibleTasks = fallbackTasks.slice(startIndex, endIndex);
  const hiddenLeft = startIndex > 0;
  const hiddenRight = endIndex < fallbackTasks.length;
  const journeyClassName = [
    "goal-journey",
    compact ? "goal-journey--compact" : "",
    !fallbackTasks.length ? "goal-journey--no-steps" : "",
    hiddenLeft ? "goal-journey--has-hidden-left" : "",
    hiddenRight ? "goal-journey--has-hidden-right" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const allCompleted = fallbackTasks.length > 0 && fallbackTasks.every((task) => task.completed);
  const inProgressVisibleIndex = activeIndex - startIndex;
  const fillFraction = allCompleted
    ? 1
    : visibleTasks.length <= 1
      ? 0
      : Math.max(0, Math.min(inProgressVisibleIndex / (visibleTasks.length - 1), 1));
  const visibleCountStyle = {
    "--goal-visible-count": Math.max(visibleTasks.length, 1),
    "--goal-progress-fill": fillFraction,
  } as CSSProperties;
  const selectorIconId = goal.tasks[activeIndex]?.iconId ?? goal.iconId;

  const goalSelector = canSelectGoal ? (
    <label className="goal-journey__selector goal-journey__selector--select">
      <GoalTaskIcon iconId={selectorIconId} />
      <span className="sr-only">Select goal</span>
      <select
        value={selectedGoalId ?? goal.id}
        onChange={(event) => onSelectGoal?.(event.target.value)}
        aria-label="Select goal for the path map"
      >
        {selectableGoals!.map((option) => (
          <option key={option.id} value={option.id}>{option.title}</option>
        ))}
      </select>
    </label>
  ) : (
    <span className="goal-journey__selector">
      <GoalTaskIcon iconId={selectorIconId} />
      {goal.title}
    </span>
  );

  const goalMetrics = (
    <>
      <span className="goal-journey__progress">
        <strong>{progress}%</strong>
        <i><b style={{ width: `${progress}%` }} /></i>
      </span>
      {goal.deadline ? (
        <span className="goal-journey__date">📅 {formatDate(goal.deadline)}</span>
      ) : null}
      <span className={statusClassName}>{statusLabel}</span>
    </>
  );

  return (
    <section className={journeyClassName} aria-label={`${goal.title} journey`} style={visibleCountStyle}>
      {/* Compact mode (Today widget): the "Path Map" title + tagline are
          dropped to keep the panel slim; the goal dropdown takes the left
          slot, and progress/deadline/status sit in a single horizontal
          row on the right. The full Goals page (`!compact`) keeps the
          original header with the heading block. */}
      {compact ? (
        <header className="goal-journey__header goal-journey__header--compact">
          {goalSelector}
          <div className="goal-journey__meta goal-journey__meta--inline">
            {goalMetrics}
          </div>
        </header>
      ) : (
        <header className="goal-journey__header">
          <div>
            <h2>Goal Journey</h2>
            <p>Major milestones on your journey.</p>
          </div>
          <div className="goal-journey__meta">
            {goalSelector}
            {goalMetrics}
          </div>
        </header>
      )}

      {visibleTasks.length ? (
        <ol className="goal-journey__steps">
          {hiddenLeft ? <span className="goal-journey__edge-line goal-journey__edge-line--left" aria-hidden="true" /> : null}
          <div className="goal-journey__track" aria-hidden="true">
            <span className="goal-journey__track-fill" />
          </div>
          {hiddenRight ? <span className="goal-journey__edge-line goal-journey__edge-line--right" aria-hidden="true" /> : null}
          {visibleTasks.map((task, index) => {
            const absoluteIndex = startIndex + index;
            const state = getTaskState(task, absoluteIndex, activeIndex);
            return (
              <li key={task.id} className={`goal-journey-step is-${state}`}>
                <div className="goal-journey-step__node">
                  <GoalTaskIcon iconId={task.iconId} alt="" />
                  {state === "completed" ? (
                    <span className="goal-journey-step__badge">✓</span>
                  ) : null}
                </div>
                <strong>{task.title}</strong>
                <span>{state === "completed" ? "Completed" : state === "in-progress" ? "In progress" : "Upcoming"}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="goal-journey__no-plan" role="status">
          No plan yet — suspiciously peaceful.
        </div>
      )}
    </section>
  );
}

function GoalSummaryCard({ goal }: { goal: Goal }) {
  const progress = getProgress(goal.tasks);
  const doneTasks = goal.tasks.filter((task) => task.completed).length;
  const nextTask =
    goal.tasks.find((task) => !task.completed) ??
    goal.tasks[goal.tasks.length - 1];

  return (
    <motion.article
      className="goal-list-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
    >
      <Link className="goal-list-card__link" to={`/goals/${goal.id}`} aria-label={`Open ${goal.title}`}>
        <div className="goal-list-card__icon">
          <GoalTaskIcon iconId={goal.iconId ?? nextTask?.iconId} />
        </div>
        <div className="goal-list-card__content">
          <div className="goal-list-card__topline">
            <span className={getStatusClassName(goal)}>
              {getStatusLabel(goal)}
            </span>
            {goal.deadline ? <span className="goal-deadline">Due {formatDate(goal.deadline)}</span> : null}
          </div>
          <h2>{goal.title}</h2>
          <p>{nextTask ? `Next: ${nextTask.title}` : "No tasks yet — suspiciously peaceful."}</p>
          <div className="goal-list-card__progress-row">
            <div className="goal-progress" aria-label={`${progress}% completed`}>
              <span style={{ width: `${progress}%` }} />
            </div>
            <strong>{progress}%</strong>
          </div>
          <div className="goal-list-card__meta">
            <span>{doneTasks}/{goal.tasks.length} tasks done</span>
            {goal.tasks.length ? <span>{goal.tasks.length - doneTasks} left</span> : <span>Ready for first task</span>}
          </div>
        </div>
        <span className="goal-list-card__chevron" aria-hidden="true">›</span>
      </Link>
    </motion.article>
  );
}

type DetailTaskDraft = {
  id?: string;
  title: string;
  deadline: string;
  completed: boolean;
  iconId: string | null;
  note?: string | null;
  subtasks?: Array<{ id?: string; title: string; completed: boolean }>;
};

function emptyDetailTaskDraft(): DetailTaskDraft {
  return { title: "", deadline: "", completed: false, iconId: null };
}

function toDetailTaskDraft(task?: GoalTask): DetailTaskDraft {
  if (!task) return emptyDetailTaskDraft();
  return {
    id: task.id,
    title: task.title,
    deadline: task.deadline ?? "",
    completed: task.completed,
    iconId: task.iconId ?? null,
    note: task.note ?? null,
    subtasks: (task.subtasks ?? []).map((s) => ({ id: s.id, title: s.title, completed: s.completed })),
  };
}

type SerializedGoalTask = {
  id?: string;
  title: string;
  deadline: string | null;
  completed: boolean;
  iconId: string | null;
  note: string | null;
  subtasks: Array<{ id?: string; title: string; completed: boolean }>;
};

function serializeTasks(
  tasks: GoalTask[],
  override?: DetailTaskDraft,
  removeTaskId?: string,
): SerializedGoalTask[] {
  const mapSubtasks = (task: GoalTask) =>
    (task.subtasks ?? []).map((s) => ({ id: s.id, title: s.title, completed: s.completed }));

  const normalized: SerializedGoalTask[] = tasks
    .filter((task) => task.id !== removeTaskId)
    .map((task) => {
      const source = override?.id === task.id ? override : task;
      const sourceNote = "note" in source ? source.note ?? null : task.note ?? null;
      const sourceSubtasks =
        "subtasks" in source && source.subtasks
          ? source.subtasks.map((s) => ({ id: s.id, title: s.title, completed: s.completed }))
          : mapSubtasks(task);
      return {
        id: task.id,
        title: source.title.trim(),
        deadline: source.deadline || null,
        completed: source.completed,
        iconId: source.iconId ?? null,
        note: sourceNote,
        subtasks: sourceSubtasks,
      };
    })
    .filter((task) => task.title);

  if (override && !override.id && !removeTaskId) {
    const title = override.title.trim();
    if (title) {
      normalized.push({
        title,
        deadline: override.deadline || null,
        completed: override.completed,
        iconId: override.iconId ?? null,
        note: override.note ?? null,
        subtasks: override.subtasks
          ? override.subtasks.map((s) => ({ id: s.id, title: s.title, completed: s.completed }))
          : [],
      });
    }
  }
  return normalized;
}

function TaskStatusPill({ completed }: { completed: boolean }) {
  return (
    <span className={`goal-task-status ${completed ? "is-complete" : "is-pending"}`.trim()}>
      <span aria-hidden="true" />
      {completed ? "Completed" : "Not started"}
    </span>
  );
}

function GoalDetailTaskRow({
  goal,
  task,
  index,
  expanded,
  onToggleExpand,
  onDelete,
  onPersistOrder,
  onStartEdit,
}: {
  goal: Goal;
  task: GoalTask;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  onPersistOrder: () => void;
  onStartEdit: () => void;
}) {
  const updateGoal = useUpdateGoal();
  const dragControls = useDragControls();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<DetailTaskDraft>(() => toDetailTaskDraft(task));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState("");
  const subtaskCount = task.subtasks?.length ?? 0;
  const doneSubtasks = task.subtasks?.filter((s) => s.completed).length ?? 0;
  const complete = isTaskComplete(task);
  const health = getTaskHealth(task);

  useEffect(() => {
    if (!isEditing) {
      setDraft(toDetailTaskDraft(task));
      setPickerOpen(false);
      setError("");
    }
  }, [isEditing, task]);

  const saveTask = async (draft: DetailTaskDraft) => {
    await updateGoal.mutateAsync({
      id: goal.id,
      input: { tasks: serializeTasks(goal.tasks, draft) },
    });
  };

  const toggleTask = async () => {
    // Manual toggle only meaningful when there are no subtasks — otherwise completion is derived.
    if (subtaskCount > 0) return;
    await saveTask({ ...toDetailTaskDraft(task), completed: !task.completed });
  };

  const startEditing = () => {
    onStartEdit();
    setDraft(toDetailTaskDraft(task));
    setPickerOpen(false);
    setError("");
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setDraft(toDetailTaskDraft(task));
    setPickerOpen(false);
    setError("");
    setIsEditing(false);
  };

  const saveInlineEdit = async () => {
    const title = draft.title.trim();
    if (!title) {
      setError("Task needs a name before it joins the quest.");
      return;
    }
    setError("");
    await saveTask({ ...draft, title });
    setIsEditing(false);
  };

  return (
    <Reorder.Item
      as="li"
      value={task}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onPersistOrder}
      className={`goal-detail-task ${isEditing ? "is-editing" : ""} ${complete ? "is-complete" : ""} ${expanded ? "is-expanded" : ""}`.trim()}
    >
      <div className="goal-detail-task__head">
        <button
          type="button"
          className="goal-detail-task__drag"
          aria-label="Drag task to reorder"
          onPointerDown={(event) => {
            if (!isEditing) dragControls.start(event);
          }}
          disabled={isEditing}
          title="Drag to reorder"
        >
          <span />
          <span />
          <span />
        </button>
        <button
          type="button"
          className="goal-detail-task__check"
          onClick={toggleTask}
          disabled={subtaskCount > 0 || isEditing}
          aria-label={subtaskCount > 0 ? "Completion follows subtasks" : "Toggle goal task completion"}
          title={subtaskCount > 0 ? `${doneSubtasks}/${subtaskCount} subtasks done` : undefined}
        >
          {complete ? "✓" : index + 1}
        </button>
        {isEditing ? (
          <div className="goal-detail-task__main goal-detail-task__main--editing">
            <div className="goal-detail-task__icon-edit-wrap">
              <button
                type="button"
                className="goal-detail-task__icon-edit"
                onClick={() => setPickerOpen((current) => !current)}
                aria-label="Choose task icon"
              >
                <GoalTaskIcon iconId={draft.iconId} />
              </button>
              {pickerOpen ? (
                <div className="goal-detail-task__icon-popover">
                  <IconPicker
                    value={draft.iconId}
                    onChange={(iconId) => {
                      setDraft((current) => ({ ...current, iconId }));
                      setPickerOpen(false);
                    }}
                  />
                </div>
              ) : null}
            </div>
            <div className="goal-detail-task__title-edit">
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                maxLength={MAX_TITLE_LENGTH}
                aria-label="Task title"
              />
            </div>
          </div>
        ) : (
          <button type="button" className="goal-detail-task__main" onClick={onToggleExpand}>
            <GoalTaskIcon iconId={task.iconId} />
            <span>
              <strong>{task.title}</strong>
              {subtaskCount > 0 ? (
                <small>{doneSubtasks}/{subtaskCount} subtasks</small>
              ) : null}
            </span>
          </button>
        )}
        <div className="goal-detail-task__deadline" aria-label="Deadline">
          <span>Deadline</span>
          {isEditing ? (
            <GoalDatePicker
              value={draft.deadline}
              onChange={(deadline) => setDraft((current) => ({ ...current, deadline }))}
              className="goal-detail-task__date-picker"
              ariaLabel="Task deadline"
            />
          ) : (
            <strong
              className={
                !task.deadline
                  ? "is-empty"
                  : health === "overdue"
                    ? "is-overdue"
                    : health === "due-today"
                      ? "is-due-today"
                      : health === "due-soon"
                        ? "is-due-soon"
                        : ""
              }
            >
              {task.deadline ? formatDate(task.deadline) : "No due date"}
            </strong>
          )}
        </div>
        <div className="goal-detail-task__health" aria-label="Health">
          <span>Health</span>
          {!isEditing && health === "overdue" ? (
            <span className="goal-health-pill goal-health-pill--overdue">
              <span aria-hidden="true" />
              Overdue
            </span>
          ) : !isEditing && health === "due-today" ? (
            <span className="goal-health-pill goal-health-pill--due-today">
              <span aria-hidden="true" />
              Due today
            </span>
          ) : !isEditing && health === "due-soon" ? (
            <span className="goal-health-pill goal-health-pill--due-soon">
              <span aria-hidden="true" />
              Due soon
            </span>
          ) : null}
        </div>
        <div className="goal-detail-task__status" aria-label="Status">
          <span>Status</span>
          <TaskStatusPill completed={complete} />
        </div>
        <div className="goal-detail-task__today" aria-label="Add to today">
          {subtaskCount === 0 && !complete && !isEditing ? (
            // Only allow carrying the task itself to Today when:
            //  - it has no subtasks (otherwise user picks a subtask instead);
            //  - it is not already complete (nothing left to schedule).
            <AddToTodayButton goalTaskId={task.id} size="sm" />
          ) : null}
        </div>
        <div className="goal-detail-task__actions">
          {isEditing ? (
            <>
              <button
                type="button"
                className="task-add goal-detail-task__save"
                onClick={saveInlineEdit}
                disabled={updateGoal.isPending}
              >
                {updateGoal.isPending ? "Saving..." : "Save"}
              </button>
              <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text goal-detail-task__cancel" onClick={cancelEditing}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <GoalActionIcon type="edit" label="Edit task" onClick={startEditing} />
              <GoalActionIcon type="delete" label="Delete task" onClick={onDelete} />
            </>
          )}
        </div>
      </div>
      {isEditing && error ? (
        <p className="goal-detail-task__error" aria-live="polite">{error}</p>
      ) : null}

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="expand"
            className="goal-detail-task__expand"
            initial={{ gridTemplateRows: "0fr", opacity: 0, y: -3 }}
            animate={{ gridTemplateRows: "1fr", opacity: 1, y: 0 }}
            exit={{ gridTemplateRows: "0fr", opacity: 0, y: -3 }}
            transition={{
              gridTemplateRows: { duration: 0.24, ease: [0.32, 0.72, 0.24, 1] },
              opacity: { duration: 0.16, ease: "easeOut" },
              y: { duration: 0.18, ease: "easeOut" },
            }}
          >
            <div className="goal-detail-task__expand-inner">
              <GoalTaskNoteAndSubtasks goal={goal} task={task} onSave={saveTask} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Reorder.Item>
  );
}

function GoalTaskNoteAndSubtasks({
  goal,
  task,
  onSave,
}: {
  goal: Goal;
  task: GoalTask;
  onSave: (draft: DetailTaskDraft) => Promise<void>;
}) {
  const [note, setNote] = useState<string>(task.note ?? "");
  const [subtaskDraftIds, setSubtaskDraftIds] = useState<string[]>(
    (task.subtasks ?? []).map((s) => s.id),
  );
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  useEffect(() => {
    setNote(task.note ?? "");
  }, [task.id, task.note]);

  useEffect(() => {
    setSubtaskDraftIds((task.subtasks ?? []).map((s) => s.id));
  }, [task.id, (task.subtasks ?? []).map((s) => s.id).join("|")]);

  // Track latest values for cleanup auto-save without recreating the effect.
  const noteRef = useRef(note);
  const taskRef = useRef(task);
  const onSaveRef = useRef(onSave);
  useEffect(() => { noteRef.current = note; }, [note]);
  useEffect(() => { taskRef.current = task; }, [task]);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  // Warn before page unload if note has unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const latest = noteRef.current;
      const original = taskRef.current.note ?? "";
      if (latest !== original) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Auto-save note on unmount (e.g. when user collapses the row).
  useEffect(() => {
    return () => {
      const latest = (noteRef.current || "").slice(0, MAX_GOAL_TASK_NOTE);
      const original = taskRef.current.note ?? "";
      if (latest !== original) {
        void onSaveRef.current({ ...toDetailTaskDraft(taskRef.current), note: latest || null });
      }
    };
  }, []);

  const subtasksById = new Map((task.subtasks ?? []).map((s) => [s.id, s]));
  const orderedSubtasks = subtaskDraftIds
    .map((id) => subtasksById.get(id))
    .filter((s): s is GoalSubtask => Boolean(s));

  const baseDraft = (): DetailTaskDraft => toDetailTaskDraft(task);

  const saveNote = async () => {
    const trimmed = note.slice(0, MAX_GOAL_TASK_NOTE);
    if ((task.note ?? "") === trimmed) return;
    await onSave({ ...baseDraft(), note: trimmed || null });
  };

  const saveSubtasks = async (
    nextSubtasks: Array<{ id?: string; title: string; completed: boolean }>,
  ) => {
    await onSave({ ...baseDraft(), subtasks: nextSubtasks });
  };

  const toggleSubtask = async (id: string) => {
    const next = (task.subtasks ?? []).map((s) =>
      s.id === id ? { id: s.id, title: s.title, completed: !s.completed } : { id: s.id, title: s.title, completed: s.completed },
    );
    await saveSubtasks(next);
  };

  const renameSubtask = async (id: string, title: string) => {
    const trimmed = title.slice(0, MAX_GOAL_SUBTASK_TITLE);
    const next = (task.subtasks ?? []).map((s) =>
      s.id === id ? { id: s.id, title: trimmed, completed: s.completed } : { id: s.id, title: s.title, completed: s.completed },
    );
    await saveSubtasks(next);
  };

  const deleteSubtask = async (id: string) => {
    const next = (task.subtasks ?? [])
      .filter((s) => s.id !== id)
      .map((s) => ({ id: s.id, title: s.title, completed: s.completed }));
    await saveSubtasks(next);
  };

  const addSubtask = async () => {
    const trimmed = newSubtaskTitle.trim().slice(0, MAX_GOAL_SUBTASK_TITLE);
    if (!trimmed) return;
    if ((task.subtasks?.length ?? 0) >= MAX_GOAL_SUBTASKS) return;
    const next = [
      ...(task.subtasks ?? []).map((s) => ({ id: s.id, title: s.title, completed: s.completed })),
      { title: trimmed, completed: false },
    ];
    setNewSubtaskTitle("");
    await saveSubtasks(next);
  };

  const subtasksFull = (task.subtasks?.length ?? 0) >= MAX_GOAL_SUBTASKS;

  const reorderSubtasks = async (items: GoalSubtask[]) => {
    const nextIds = items.map((s) => s.id);
    setSubtaskDraftIds(nextIds);
    const next = items.map((s) => ({ id: s.id, title: s.title, completed: s.completed }));
    await saveSubtasks(next);
  };

  const noteDirty = (task.note ?? "") !== note;

  return (
    <div className="goal-task-expand">
      <div className="goal-task-expand__field goal-task-expand__field--subtasks">
        <span className="goal-task-expand__label">Subtasks</span>

        {orderedSubtasks.length > 0 ? (
          <Reorder.Group
            axis="y"
            values={orderedSubtasks}
            onReorder={reorderSubtasks}
            className="goal-subtask-list"
          >
            {orderedSubtasks.map((sub) => (
              <SubtaskRow
                key={sub.id}
                subtask={sub}
                onToggle={() => toggleSubtask(sub.id)}
                onRename={(title) => renameSubtask(sub.id, title)}
                onDelete={() => deleteSubtask(sub.id)}
              />
            ))}
          </Reorder.Group>
        ) : null}

        <form
          className="goal-subtask-add"
          onSubmit={(e) => {
            e.preventDefault();
            void addSubtask();
          }}
        >
          <input
            type="text"
            value={newSubtaskTitle}
            onChange={(e) => setNewSubtaskTitle(e.target.value.slice(0, MAX_GOAL_SUBTASK_TITLE))}
            maxLength={MAX_GOAL_SUBTASK_TITLE}
            placeholder={subtasksFull ? `Limit reached (${MAX_GOAL_SUBTASKS})` : "Add a subtask"}
            aria-label="New subtask title"
            disabled={subtasksFull}
          />
          <button className="task-add" type="submit" disabled={!newSubtaskTitle.trim() || subtasksFull}>
            <span aria-hidden="true">+</span> Add
          </button>
        </form>
      </div>

      <div className="goal-task-expand__field goal-task-expand__field--note">
        <span className="goal-task-expand__label">
          Note
          <em>{note.length}/{MAX_GOAL_TASK_NOTE}</em>
        </span>
        <textarea
          className="goal-task-expand__note"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, MAX_GOAL_TASK_NOTE))}
          rows={8}
          maxLength={MAX_GOAL_TASK_NOTE}
          placeholder="Anything to remember about this step?"
        />
        <div className="goal-task-expand__note-actions">
          <span className={`goal-task-expand__note-state ${noteDirty ? "is-dirty" : "is-saved"}`.trim()}>
            {noteDirty ? "● Unsaved" : "✓ Saved"}
          </span>
          <button
            type="button"
            className="task-add goal-task-expand__note-save"
            onClick={saveNote}
            disabled={!noteDirty}
          >
            Save note
          </button>
        </div>
      </div>
    </div>
  );
}

function SubtaskRow({
  subtask,
  onToggle,
  onRename,
  onDelete,
}: {
  subtask: GoalSubtask;
  onToggle: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const dragControls = useDragControls();
  const [title, setTitle] = useState(subtask.title);

  useEffect(() => {
    setTitle(subtask.title);
  }, [subtask.title]);

  const commit = () => {
    const trimmed = title.trim().slice(0, MAX_GOAL_SUBTASK_TITLE);
    if (!trimmed) {
      setTitle(subtask.title);
      return;
    }
    if (trimmed !== subtask.title) onRename(trimmed);
  };

  return (
    <Reorder.Item
      as="div"
      value={subtask}
      dragListener={false}
      dragControls={dragControls}
      className={`goal-subtask ${subtask.completed ? "is-done" : ""}`.trim()}
    >
      <button
        type="button"
        className="goal-subtask__drag"
        aria-label="Drag to reorder subtask"
        onPointerDown={(event) => dragControls.start(event)}
      >
        <span />
        <span />
      </button>
      <div className="checkbox-wrapper goal-subtask__check">
        <input
          id={`subtask-${subtask.id}`}
          type="checkbox"
          checked={subtask.completed}
          onChange={onToggle}
          aria-label={subtask.completed ? "Mark as not done" : "Mark as done"}
        />
        <label htmlFor={`subtask-${subtask.id}`}>
          <span className="tick_mark" aria-hidden="true"></span>
        </label>
      </div>
      <input
        type="text"
        className="goal-subtask__title"
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, MAX_GOAL_SUBTASK_TITLE))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            setTitle(subtask.title);
            (e.target as HTMLInputElement).blur();
          }
        }}
        maxLength={MAX_GOAL_SUBTASK_TITLE}
      />
      <span className="goal-subtask__today">
        {!subtask.completed ? (
          <AddToTodayButton goalSubtaskId={subtask.id} size="sm" />
        ) : null}
      </span>
      <button
        type="button"
        className="goal-subtask__delete"
        onClick={onDelete}
        aria-label="Delete subtask"
        title="Delete"
      >
        ×
      </button>
    </Reorder.Item>
  );
}

function GoalTaskAddPanel({
  goal,
  onClose,
}: {
  goal: Goal;
  onClose: () => void;
}) {
  const updateGoal = useUpdateGoal();
  const [draft, setDraft] = useState<DetailTaskDraft>(() => emptyDetailTaskDraft());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(emptyDetailTaskDraft());
    setError("");
    setPickerOpen(false);
  }, [goal.id]);

  const saveTask = async () => {
    if (!draft.title.trim()) {
      setError("Task needs a name before it joins the quest.");
      return;
    }
    setError("");
    try {
      await updateGoal.mutateAsync({
        id: goal.id,
        input: { tasks: serializeTasks(goal.tasks, draft) },
      });
      setDraft(emptyDetailTaskDraft());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save task.");
    }
  };

  return (
    <motion.aside
      className="goal-detail-editor tasks-panel tasks-panel--today"
      aria-label="Add goal task"
      initial={{ opacity: 0, x: 28 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
    >
      <header className="goal-detail-editor__header">
        <div>
          <p className="goal-kicker">Add goal task</p>
          <h2>Create a new step</h2>
        </div>
        <button type="button" className="goal-icon-button" onClick={onClose} aria-label="Close task editor">
          ×
        </button>
      </header>

      <div className="goal-detail-editor__icon-wrap">
        <button
          type="button"
          className="goal-detail-editor__icon"
          onClick={() => setPickerOpen((current) => !current)}
          aria-label="Choose task icon"
        >
          <GoalTaskIcon iconId={draft.iconId} />
        </button>
        <div>
          <strong>Chosen icon</strong>
          <span>Tap to make the task less boring. Tiny pixels, huge morale.</span>
        </div>
        {pickerOpen ? (
          <div className="goal-detail-editor__popover">
            <IconPicker
              value={draft.iconId}
              onChange={(iconId) => {
                setDraft((current) => ({ ...current, iconId }));
                setPickerOpen(false);
              }}
            />
          </div>
        ) : null}
      </div>

      <label className="goal-field">
        <span>Task title</span>
        <input
          className="goal-input goal-input--large"
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          maxLength={MAX_TITLE_LENGTH}
          placeholder="e.g. Plan daily itinerary"
        />
      </label>

      <label className="goal-field">
        <span>Deadline · optional</span>
        <GoalDatePicker
          value={draft.deadline}
          onChange={(deadline) => setDraft((current) => ({ ...current, deadline }))}
          className="goal-date-picker--large"
          ariaLabel="Task deadline"
        />
      </label>


      <p className="goal-error" aria-live="polite">{error}</p>

      <footer className="goal-detail-editor__footer">
        <button type="button" className="task-add" onClick={saveTask} disabled={updateGoal.isPending}>
          {updateGoal.isPending ? "Saving..." : "Create task"}
        </button>
      </footer>
    </motion.aside>
  );
}

export function GoalDetailPage() {
  const { goalId } = useParams();
  const navigate = useNavigate();
  const goalsQuery = useGoals();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();
  const goals = goalsQuery.data ?? [];
  const goal = goals.find((item) => item.id === goalId);
  const [taskEditorOpen, setTaskEditorOpen] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [orderedTaskIds, setOrderedTaskIds] = useState<string[]>([]);
  const [editorGoal, setEditorGoal] = useState<Goal | null | undefined>(undefined);

  useEffect(() => {
    if (goal) {
      setOrderedTaskIds(goal.tasks.map((task) => task.id));
    }
  }, [goal?.id, goal?.tasks.map((task) => task.id).join("|")]);

  if (goalsQuery.isLoading) {
    return <p className="goals-empty">Loading goal...</p>;
  }

  if (!goal) {
    return (
      <section className="goals-page goal-detail-page">
        <Link className="goal-back-link" to="/goals">← All Goals</Link>
        <div className="goals-empty">
          <strong>Goal not found</strong>
          <span>Either it vanished, or it’s hiding very professionally.</span>
        </div>
      </section>
    );
  }

  const progress = getProgress(goal.tasks);
  const doneTasks = goal.tasks.filter((task) => task.completed).length;
  const taskById = new Map(goal.tasks.map((task) => [task.id, task]));
  const orderedTasks = orderedTaskIds
    .map((id) => taskById.get(id))
    .filter((task): task is GoalTask => Boolean(task));
  const orderedTaskIdKey = orderedTasks.map((task) => task.id).join("|");
  const serverTaskIdKey = goal.tasks.map((task) => task.id).join("|");
  const nextTask = goal.tasks.find((task) => !task.completed) ?? goal.tasks[goal.tasks.length - 1];

  const persistTaskOrder = async () => {
    if (!orderedTasks.length || orderedTaskIdKey === serverTaskIdKey) return;
    await updateGoal.mutateAsync({
      id: goal.id,
      input: { tasks: serializeTasks(orderedTasks) },
    });
  };

  const deleteTask = async (taskId: string) => {
    await updateGoal.mutateAsync({
      id: goal.id,
      input: { tasks: serializeTasks(goal.tasks, undefined, taskId) },
    });
    if (expandedTaskId === taskId) setExpandedTaskId(null);
  };


  return (
    <>
      <motion.section
        className={`goals-page goal-detail-page ${taskEditorOpen ? "has-task-editor" : ""}`.trim()}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="goal-detail-nav">
          <Link className="goal-back-link" to="/goals">← All Goals</Link>
        </div>

        <div className={`goal-detail-workspace ${taskEditorOpen ? "has-task-editor" : ""}`.trim()}>
          <div className="goal-detail-main-stack">
            <section className="goal-detail-hero tasks-panel tasks-panel--today" aria-label="Goal summary">
          <div className="goal-detail-hero__image">
            <GoalTaskIcon iconId={goal.iconId ?? nextTask?.iconId} />
          </div>
          <div className="goal-detail-hero__content">
            <div className="goal-detail-hero__title-row">
              <div className="goal-detail-hero__title">
                <div className="goal-detail-hero__title-line">
                  <h1>{goal.title}</h1>
                  <span className={getStatusClassName(goal)}>{getStatusLabel(goal)}</span>
                </div>
              </div>
              <div className="goal-detail-hero__actions">
                <GoalActionIcon type="edit" label="Edit goal" onClick={() => setEditorGoal(goal)} />
                <GoalActionIcon
                  type="delete"
                  label="Delete goal"
                  onClick={async () => {
                    const confirmed = window.confirm(`Delete “${goal.title}”? This will also remove all tasks inside this goal.`);
                    if (!confirmed) return;
                    await deleteGoal.mutateAsync(goal.id);
                    navigate("/goals");
                  }}
                />
              </div>
            </div>
            <p className="goal-detail-hero__description">
              {nextTask ? `Next step: ${nextTask.title}` : "No tasks yet. The goal is peacefully judging us."}
            </p>
            <div className="goal-detail-hero__progress-row">
              <span>Overall progress</span>
              <strong>{progress}%</strong>
            </div>
            <div className="goal-progress" aria-label={`${progress}% completed`}>
              <span style={{ width: `${progress}%` }} />
            </div>
            <div className="goal-detail-hero__stats">
              {goal.deadline ? <span>📅 {formatDate(goal.deadline)}</span> : null}
              <span>☑ {doneTasks}/{goal.tasks.length} tasks</span>
              {(() => {
                const open = goal.tasks.filter((t) => !isTaskComplete(t));
                const overdue = open.filter((t) => getTaskHealth(t) === "overdue").length;
                const dueToday = open.filter((t) => getTaskHealth(t) === "due-today").length;
                const dueSoon = open.filter((t) => getTaskHealth(t) === "due-soon").length;
                return (
                  <>
                    {overdue > 0 ? (
                      <span className="goal-health-alert goal-health-alert--overdue">
                        {overdue} Overdue
                      </span>
                    ) : null}
                    {dueToday > 0 ? (
                      <span className="goal-health-alert goal-health-alert--due-today">
                        {dueToday} Due today
                      </span>
                    ) : null}
                    {dueSoon > 0 ? (
                      <span className="goal-health-alert goal-health-alert--due-soon">
                        {dueSoon} Due soon
                      </span>
                    ) : null}
                  </>
                );
              })()}
            </div>
          </div>
            </section>

            <section className="goal-detail-tasks tasks-panel tasks-panel--today" aria-label="Goal tasks">
            <header className="goal-detail-section-header">
              <div>
                <h2>Steps to achieve your goal</h2>
              </div>
              <button
                type="button"
                className="task-add"
                onClick={() => setTaskEditorOpen(true)}
                disabled={goal.tasks.length >= MAX_GOAL_TASKS}
                title={goal.tasks.length >= MAX_GOAL_TASKS ? `Limit reached (${MAX_GOAL_TASKS})` : undefined}
              >
                <span aria-hidden="true">+</span> Add goal task
              </button>
            </header>

            {goal.tasks.length ? (
              <Reorder.Group
                as="ol"
                axis="y"
                values={orderedTasks}
                onReorder={(tasks) => setOrderedTaskIds(tasks.map((task) => task.id))}
                className="goal-detail-task-list"
              >
                {orderedTasks.map((task, index) => (
                  <GoalDetailTaskRow
                    key={task.id}
	                    goal={goal}
	                    task={task}
	                    index={index}
	                    expanded={expandedTaskId === task.id}
	                    onToggleExpand={() =>
	                      setExpandedTaskId((prev) => (prev === task.id ? null : task.id))
	                    }
	                    onDelete={() => deleteTask(task.id)}
	                    onPersistOrder={persistTaskOrder}
	                    onStartEdit={() => setTaskEditorOpen(false)}
	                  />
                ))}
              </Reorder.Group>
            ) : (
              <div className="goals-empty goal-detail-empty">
                <strong>No tasks yet</strong>
                <span>Add the first step. Even dragons need a to-do list.</span>
              </div>
            )}
            </section>

          </div>

          <AnimatePresence initial={false}>
	            {taskEditorOpen ? (
	              <GoalTaskAddPanel
	                goal={goal}
	                onClose={() => setTaskEditorOpen(false)}
	              />
            ) : null}
          </AnimatePresence>
        </div>
      </motion.section>

      <AnimatePresence>
        {editorGoal !== undefined ? (
          <GoalEditorModal goal={editorGoal} onClose={() => setEditorGoal(undefined)} />
        ) : null}
      </AnimatePresence>
    </>
  );
}

export function GoalsPage() {
  const goalsQuery = useGoals();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editorGoal, setEditorGoal] = useState<Goal | null | undefined>(undefined);
  const goals = goalsQuery.data ?? [];

  useEffect(() => {
    if (searchParams.get("new") === "1" && editorGoal === undefined) {
      setEditorGoal(null);
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, editorGoal, setSearchParams]);
  const stats = useMemo(() => {
    const totalTasks = goals.reduce((sum, goal) => sum + goal.tasks.length, 0);
    const doneTasks = goals.reduce(
      (sum, goal) => sum + goal.tasks.filter((task) => task.completed).length,
      0,
    );
    return { totalTasks, doneTasks };
  }, [goals]);

  return (
    <>
      <motion.section
        className="goals-page goals-list-page"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <header className="goals-page__header">
          <div>
            <h1 className="tasks-title">Goals</h1>
            <p className="goals-page__subtitle">
              Every goal has a path. Follow your next step, track your progress, and keep moving at your own pace.
            </p>
          </div>
        </header>

        <div className="goals-page__actions" aria-label="Goals summary actions">
          <div className="goals-stat">
            <strong>{goals.length}</strong>
            <span>goals</span>
          </div>
          <div className="goals-stat">
            <strong>
              {stats.doneTasks}/{stats.totalTasks}
            </strong>
            <span>tasks</span>
          </div>
          {goals.length > 0 ? (
            <button type="button" className="task-add" onClick={() => setEditorGoal(null)}>
              <span aria-hidden="true">+</span> Add goal
            </button>
          ) : null}
        </div>

        {goalsQuery.isLoading ? <p className="goals-empty">Loading goals...</p> : null}
        {!goalsQuery.isLoading && goals.length === 0 ? (
          <div className="goals-empty">
            <strong>No goals yet</strong>
            <span>Add your first goal and break the chaos into cute little steps.</span>
            <button
              type="button"
              className="task-add goals-empty__cta"
              onClick={() => setEditorGoal(null)}
            >
              <span aria-hidden="true">+</span> Create your first goal
            </button>
          </div>
        ) : null}

        <div className="goals-list" aria-label="Goals list">
          <AnimatePresence initial={false}>
            {goals.map((goal) => (
              <GoalSummaryCard key={goal.id} goal={goal} />
            ))}
          </AnimatePresence>
        </div>
      </motion.section>

      <AnimatePresence>
        {editorGoal !== undefined ? (
          <GoalEditorModal goal={editorGoal} onClose={() => setEditorGoal(undefined)} />
        ) : null}
      </AnimatePresence>
    </>
  );
}
