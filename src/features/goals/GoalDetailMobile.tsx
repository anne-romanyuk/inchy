import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import type { Goal, GoalSubtask, GoalTask } from "../../../shared/schemas";
import {
  MAX_GOAL_SUBTASKS,
  MAX_GOAL_SUBTASK_TITLE,
  MAX_GOAL_TASK_NOTE,
  MAX_GOAL_TASKS,
  MAX_TITLE_LENGTH,
} from "../../../shared/constants";
import { AddToTodayButton } from "./AddToTodayButton";
import { GoalDatePicker } from "./GoalDatePicker";
import { forestGoalIcons, getGoalIconSrc } from "./goalIcons";
import { useGoals, useUpdateGoal } from "./useGoals";
import { DeleteActionButton } from "../../shared/ui/DeleteActionButton";

const MOBILE_TASK_SWIPE_LIMIT = 128;
const MOBILE_TASK_SWIPE_TRIGGER = 96;

type Health = "overdue" | "due-today" | "due-soon";

type MobileTaskDraft = {
  id?: string;
  title: string;
  deadline: string;
  completed: boolean;
  iconId: string | null;
  note?: string | null;
  subtasks?: Array<{ id?: string; title: string; completed: boolean }>;
};

type MobileGoalDraft = {
  title: string;
  deadline: string;
  iconId: string | null;
};

type SerializedGoalTask = {
  id?: string;
  title: string;
  deadline: string | null;
  completed: boolean;
  iconId: string | null;
  note: string | null;
  subtasks: Array<{ id?: string; title: string; completed: boolean }>;
};

function GoalTaskIcon({ iconId, alt = "" }: { iconId?: string | null; alt?: string }) {
  return <img src={getGoalIconSrc(iconId)} alt={alt} className="goal-task-icon" draggable={false} />;
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

function isoDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTaskProgress(task: GoalTask) {
  if (task.subtasks.length > 0) {
    const done = task.subtasks.filter((subtask) => subtask.completed).length;
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

function getTaskHealth(task: GoalTask): Health | null {
  if (!task.deadline || isTaskComplete(task)) return null;
  const today = isoDate(0);
  if (task.deadline < today) return "overdue";
  if (task.deadline === today) return "due-today";
  if (task.deadline === isoDate(1)) return "due-soon";
  return null;
}

function toMobileTaskDraft(task: GoalTask): MobileTaskDraft {
  return {
    id: task.id,
    title: task.title,
    deadline: task.deadline ?? "",
    completed: task.completed,
    iconId: task.iconId ?? null,
    note: task.note ?? null,
    subtasks: task.subtasks.map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      completed: subtask.completed,
    })),
  };
}

function serializeGoalTasks(
  tasks: GoalTask[],
  override?: MobileTaskDraft,
  removeTaskId?: string,
): SerializedGoalTask[] {
  const normalized: SerializedGoalTask[] = tasks
    .filter((task) => task.id !== removeTaskId)
    .map((task) => {
      const source = override?.id === task.id ? override : toMobileTaskDraft(task);
      return {
        id: task.id,
        title: source.title.trim(),
        deadline: source.deadline || null,
        completed: source.completed,
        iconId: source.iconId ?? null,
        note: source.note ?? null,
        subtasks: (source.subtasks ?? []).map((subtask) => ({
          id: subtask.id,
          title: subtask.title,
          completed: subtask.completed,
        })),
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
        subtasks: override.subtasks ?? [],
      });
    }
  }

  return normalized;
}

function healthLabel(health: Health | null) {
  if (health === "overdue") return "Overdue";
  if (health === "due-today") return "Due today";
  if (health === "due-soon") return "Due soon";
  return null;
}

function getGoalHealthLabel(goal: Goal) {
  if (!goal.tasks.length) return "No plan";
  if (goal.tasks.every((task) => isTaskComplete(task))) return "Completed";
  const openHealths = goal.tasks
    .filter((task) => !isTaskComplete(task))
    .map((task) => getTaskHealth(task));
  if (openHealths.includes("overdue")) return "At risk";
  if (openHealths.includes("due-today")) return "Needs attention";
  return "On track";
}

function getGoalHealthClassName(goal: Goal) {
  return `goal-status-chip goal-status-chip--${getGoalHealthLabel(goal).toLowerCase().replace(/\s+/g, "-")} gdm-summary__health`;
}

function GoalMobileTaskRow({
  goal,
  task,
  isEditing,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onToggle,
  expanded,
  onToggleExpand,
}: {
  goal: Goal;
  task: GoalTask;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (draft: MobileTaskDraft) => Promise<void>;
  onDelete: () => void;
  onToggle: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const x = useMotionValue(0);
  const editWidth = useTransform(x, (value) => Math.min(MOBILE_TASK_SWIPE_LIMIT, Math.max(0, value)));
  const deleteWidth = useTransform(x, (value) => Math.min(MOBILE_TASK_SWIPE_LIMIT, Math.max(0, -value)));
  const editVisibility = useTransform(x, (value) => (value > 1 ? "visible" : "hidden"));
  const deleteVisibility = useTransform(x, (value) => (value < -1 ? "visible" : "hidden"));
  const [didSwipe, setDidSwipe] = useState(false);
  const [draft, setDraft] = useState<MobileTaskDraft>(() => toMobileTaskDraft(task));
  const [error, setError] = useState("");
  const updateGoal = useUpdateGoal();
  const complete = isTaskComplete(task);
  const subtaskCount = task.subtasks.length;
  const doneSubtasks = task.subtasks.filter((subtask) => subtask.completed).length;
  const health = getTaskHealth(task);
  const label = healthLabel(health);

  useEffect(() => {
    if (!isEditing) {
      setDraft(toMobileTaskDraft(task));
      setError("");
    }
  }, [isEditing, task]);

  const saveEdit = async () => {
    const title = draft.title.trim();
    if (!title) {
      setError("Task needs a name.");
      return;
    }
    setError("");
    await onSave({ ...draft, title });
  };

  return (
    <motion.li
      className="gdm-task-swipe"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
    >
      <motion.span
        className="gdm-task-swipe__action gdm-task-swipe__action--edit"
        style={{ width: editWidth, visibility: editVisibility }}
        aria-hidden="true"
      >
        <GoalMobileEditIcon />
        <span>EDIT</span>
      </motion.span>
      <motion.span
        className="gdm-task-swipe__action gdm-task-swipe__action--delete"
        style={{ width: deleteWidth, visibility: deleteVisibility }}
        aria-hidden="true"
      >
        <GoalMobileTrashIcon />
        <span>DELETE</span>
      </motion.span>

      <motion.div
        className={`gdm-task ${complete ? "is-complete" : ""} ${isEditing ? "is-editing" : ""} ${expanded ? "is-expanded" : ""}`.trim()}
        drag={isEditing ? false : "x"}
        dragConstraints={{ left: -MOBILE_TASK_SWIPE_LIMIT, right: MOBILE_TASK_SWIPE_LIMIT }}
        dragElastic={0.08}
        style={{ x }}
        onDragStart={() => setDidSwipe(true)}
        onDragEnd={() => {
          const swipe = x.get();
          animate(x, 0, { type: "spring", stiffness: 520, damping: 38 });
          if (swipe <= -MOBILE_TASK_SWIPE_TRIGGER) onDelete();
          if (swipe >= MOBILE_TASK_SWIPE_TRIGGER) onEdit();
          window.setTimeout(() => setDidSwipe(false), 0);
        }}
      >
        {isEditing ? (
          <div className="gdm-task-edit">
            <div className="gdm-task-edit__line">
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value.slice(0, MAX_TITLE_LENGTH) }))}
                maxLength={MAX_TITLE_LENGTH}
                aria-label="Task title"
                autoFocus
              />
            </div>
            <GoalMobileTaskIconSelect
              value={draft.iconId ?? goal.iconId ?? null}
              onChange={(iconId) => setDraft((current) => ({ ...current, iconId }))}
            />
            <GoalDatePicker
              value={draft.deadline}
              onChange={(deadline) => setDraft((current) => ({ ...current, deadline }))}
              className="gdm-task-edit__date"
              ariaLabel="Task deadline"
            />
            {error ? <p className="gdm-task__error" aria-live="polite">{error}</p> : null}
            <div className="gdm-task-edit__actions">
              <button
                type="button"
                className="pomodoro-btn pomodoro-btn--ghost-text"
                onClick={onCancelEdit}
                disabled={updateGoal.isPending}
              >
                Cancel
              </button>
              <button type="button" className="task-add" onClick={saveEdit} disabled={updateGoal.isPending}>
                {updateGoal.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="gdm-task__content">
            <div className="checkbox-wrapper task-checkbox gdm-task__check" onClick={(event) => event.stopPropagation()}>
              <input
                id={`gdm-task-cb-${task.id}`}
                type="checkbox"
                checked={complete}
                disabled={subtaskCount > 0}
                aria-label={
                  subtaskCount > 0
                    ? "Completion follows subtasks"
                    : complete
                      ? `Mark ${task.title} as not done`
                      : `Mark ${task.title} as done`
                }
                onChange={() => {
                  if (!didSwipe) onToggle();
                }}
              />
              <label htmlFor={`gdm-task-cb-${task.id}`}>
                <span className="tick_mark" aria-hidden="true" />
              </label>
            </div>
            <button
              type="button"
              className="gdm-task__open"
              onClick={() => {
                if (!didSwipe) onToggleExpand();
              }}
              aria-expanded={expanded}
              aria-controls={`gdm-task-details-${task.id}`}
            >
              <span className="gdm-task__icon" aria-hidden="true">
                <GoalTaskIcon iconId={task.iconId ?? goal.iconId} />
              </span>
              <span className="gdm-task__main">
                <strong>{task.title}</strong>
                <span className="gdm-task__meta">
                  {task.deadline ? <span>{formatDate(task.deadline)}</span> : <span>No due date</span>}
                  {subtaskCount > 0 ? <span>{doneSubtasks}/{subtaskCount} subtasks</span> : null}
                  {label ? <span className={`gdm-task__health gdm-task__health--${health}`}>{label}</span> : null}
                </span>
              </span>
            </button>
            <span className="gdm-task__today" onClick={(event) => event.stopPropagation()}>
              {subtaskCount === 0 && !complete ? <AddToTodayButton goalTaskId={task.id} size="sm" /> : null}
            </span>
            <span className="gdm-task__chevron" aria-hidden="true">›</span>
          </div>
        )}
        <AnimatePresence initial={false}>
          {expanded && !isEditing ? (
            <motion.div
              id={`gdm-task-details-${task.id}`}
              className="gdm-task-details"
              initial={{ gridTemplateRows: "0fr", opacity: 0, y: -4 }}
              animate={{ gridTemplateRows: "1fr", opacity: 1, y: 0 }}
              exit={{ gridTemplateRows: "0fr", opacity: 0, y: -4 }}
              transition={{
                gridTemplateRows: { duration: 0.22, ease: [0.32, 0.72, 0.24, 1] },
                opacity: { duration: 0.16, ease: "easeOut" },
                y: { duration: 0.18, ease: "easeOut" },
              }}
            >
              <div className="gdm-task-details__inner">
                <GoalMobileTaskDetails task={task} onSave={onSave} />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </motion.li>
  );
}

function GoalMobileTaskIconSelect({
  value,
  onChange,
  ariaLabel = "Choose task icon",
}: {
  value: string | null;
  onChange: (iconId: string) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`gdm-icon-select ${open ? "is-open" : ""}`.trim()}>
      <button
        type="button"
        className="gdm-icon-select__trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="gdm-icon-select__preview" aria-hidden="true">
          <GoalTaskIcon iconId={value} />
        </span>
        <span className="gdm-icon-select__copy">
          <span>Task icon</span>
          <strong>Pick an icon</strong>
        </span>
        <span className="gdm-icon-select__chevron" aria-hidden="true">›</span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className="gdm-icon-select__menu"
            role="listbox"
            aria-label={ariaLabel}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
          >
            {forestGoalIcons.map((icon) => {
              const selected = icon.id === value;
              return (
                <button
                  key={icon.id}
                  type="button"
                  className={`gdm-icon-select__option ${selected ? "is-selected" : ""}`.trim()}
                  onClick={() => {
                    onChange(icon.id);
                    setOpen(false);
                  }}
                  role="option"
                  aria-selected={selected}
                  aria-label={icon.label}
                >
                  <img src={icon.src} alt="" draggable={false} />
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function GoalMobileGoalEditPage({
  goal,
  onClose,
}: {
  goal: Goal;
  onClose: () => void;
}) {
  const updateGoal = useUpdateGoal();
  const [draft, setDraft] = useState<MobileGoalDraft>(() => ({
    title: goal.title,
    deadline: goal.deadline ?? "",
    iconId: goal.iconId ?? null,
  }));
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft({
      title: goal.title,
      deadline: goal.deadline ?? "",
      iconId: goal.iconId ?? null,
    });
    setError("");
  }, [goal.id, goal.title, goal.deadline, goal.iconId]);

  const saveGoal = async () => {
    const title = draft.title.trim();
    if (!title) {
      setError("Goal needs a name.");
      return;
    }

    setError("");
    try {
      await updateGoal.mutateAsync({
        id: goal.id,
        input: {
          title,
          deadline: draft.deadline || null,
          iconId: draft.iconId || null,
        },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save goal.");
    }
  };

  return (
    <motion.section
      className="goal-detail-mobile gdm-goal-edit-page"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="gdm-header">
        <button
          type="button"
          className="ui-icon-btn ui-icon-btn--subtle gdm-header__back"
          aria-label="Back to goal"
          onClick={onClose}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <h1>Edit goal</h1>
      </header>

      <div className="gdm-scroll app-scroll">
        <form
          className="gdm-goal-edit"
          onSubmit={(event) => {
            event.preventDefault();
            void saveGoal();
          }}
        >
          <label className="gdm-goal-edit__field">
            <span>Goal name</span>
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value.slice(0, MAX_TITLE_LENGTH) }))}
              maxLength={MAX_TITLE_LENGTH}
              aria-label="Goal name"
              autoFocus
            />
          </label>

          <div className="gdm-goal-edit__field">
            <span>Icon</span>
            <GoalMobileTaskIconSelect
              value={draft.iconId}
              onChange={(iconId) => setDraft((current) => ({ ...current, iconId }))}
              ariaLabel="Choose goal icon"
            />
          </div>

          <div className="gdm-goal-edit__field">
            <span>Date</span>
            <GoalDatePicker
              value={draft.deadline}
              onChange={(deadline) => setDraft((current) => ({ ...current, deadline }))}
              className="gdm-goal-edit__date"
              ariaLabel="Goal date"
            />
          </div>

          {error ? <p className="gdm-task__error" aria-live="polite">{error}</p> : null}

          <div className="gdm-goal-edit__actions">
            <button
              type="button"
              className="pomodoro-btn pomodoro-btn--ghost-text"
              onClick={onClose}
              disabled={updateGoal.isPending}
            >
              Cancel
            </button>
            <button type="submit" className="task-add" disabled={updateGoal.isPending}>
              {updateGoal.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </motion.section>
  );
}

function GoalMobileTaskDetails({
  task,
  onSave,
}: {
  task: GoalTask;
  onSave: (draft: MobileTaskDraft) => Promise<void>;
}) {
  const [note, setNote] = useState(task.note ?? "");
  const [savedNote, setSavedNote] = useState(task.note ?? "");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const noteDirty = note !== savedNote;
  const subtasksFull = task.subtasks.length >= MAX_GOAL_SUBTASKS;
  const noteRef = useRef(note);
  const taskRef = useRef(task);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    setNote(task.note ?? "");
    setSavedNote(task.note ?? "");
    setSubtaskTitle("");
  }, [task.id, task.note]);

  useEffect(() => { noteRef.current = note; }, [note]);
  useEffect(() => { taskRef.current = task; }, [task]);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  useEffect(() => {
    return () => {
      const latest = noteRef.current.slice(0, MAX_GOAL_TASK_NOTE);
      const source = taskRef.current;
      if (latest !== (source.note ?? "")) {
        void onSaveRef.current({ ...toMobileTaskDraft(source), note: latest || null });
      }
    };
  }, []);

  const saveDraft = async (draft: MobileTaskDraft) => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const baseDraft = () => toMobileTaskDraft(task);

  const saveNote = async () => {
    const trimmed = note.slice(0, MAX_GOAL_TASK_NOTE);
    await saveDraft({ ...baseDraft(), note: trimmed || null });
    setSavedNote(trimmed);
    taskRef.current = { ...taskRef.current, note: trimmed || null };
  };

  const saveSubtasks = async (subtasks: Array<{ id?: string; title: string; completed: boolean }>) => {
    await saveDraft({ ...baseDraft(), subtasks });
  };

  const toggleSubtask = async (id: string) => {
    await saveSubtasks(
      task.subtasks.map((subtask) => ({
        id: subtask.id,
        title: subtask.title,
        completed: subtask.id === id ? !subtask.completed : subtask.completed,
      })),
    );
  };

  const renameSubtask = async (id: string, title: string) => {
    const trimmed = title.trim().slice(0, MAX_GOAL_SUBTASK_TITLE);
    if (!trimmed) return;
    await saveSubtasks(
      task.subtasks.map((subtask) => ({
        id: subtask.id,
        title: subtask.id === id ? trimmed : subtask.title,
        completed: subtask.completed,
      })),
    );
  };

  const deleteSubtask = async (id: string) => {
    await saveSubtasks(
      task.subtasks
        .filter((subtask) => subtask.id !== id)
        .map((subtask) => ({ id: subtask.id, title: subtask.title, completed: subtask.completed })),
    );
  };

  const addSubtask = async () => {
    const trimmed = subtaskTitle.trim().slice(0, MAX_GOAL_SUBTASK_TITLE);
    if (!trimmed || subtasksFull) return;
    setSubtaskTitle("");
    await saveSubtasks([
      ...task.subtasks.map((subtask) => ({ id: subtask.id, title: subtask.title, completed: subtask.completed })),
      { title: trimmed, completed: false },
    ]);
  };

  return (
    <div className="gdm-task-details__content">
      <section className="gdm-task-details__section" aria-label="Subtasks">
        <div className="gdm-task-details__header">
          <strong>Subtasks</strong>
          <span>{task.subtasks.filter((subtask) => subtask.completed).length}/{task.subtasks.length}</span>
        </div>

        {task.subtasks.length ? (
          <div className="gdm-subtasks">
            {task.subtasks.map((subtask) => (
              <GoalMobileSubtaskRow
                key={subtask.id}
                subtask={subtask}
                onToggle={() => toggleSubtask(subtask.id)}
                onRename={(title) => renameSubtask(subtask.id, title)}
                onDelete={() => deleteSubtask(subtask.id)}
              />
            ))}
          </div>
        ) : (
          <p className="gdm-task-details__empty">No subtasks yet.</p>
        )}

        <form
          className="gdm-subtask-add"
          onSubmit={(event) => {
            event.preventDefault();
            void addSubtask();
          }}
        >
          <input
            value={subtaskTitle}
            onChange={(event) => setSubtaskTitle(event.target.value.slice(0, MAX_GOAL_SUBTASK_TITLE))}
            maxLength={MAX_GOAL_SUBTASK_TITLE}
            placeholder={subtasksFull ? `Limit reached (${MAX_GOAL_SUBTASKS})` : "Add subtask"}
            aria-label="New subtask"
            disabled={saving || subtasksFull}
          />
          <button
            type="submit"
            className="add-icon-btn gdm-subtask-add__submit"
            disabled={saving || !subtaskTitle.trim() || subtasksFull}
            aria-label="Add subtask"
          >
            <span aria-hidden="true">+</span>
          </button>
        </form>
      </section>

      <section className="gdm-task-details__section" aria-label="Task note">
        <div className="gdm-task-details__header">
          <strong>Notes</strong>
          <span>{note.length}/{MAX_GOAL_TASK_NOTE}</span>
        </div>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, MAX_GOAL_TASK_NOTE))}
          maxLength={MAX_GOAL_TASK_NOTE}
          rows={5}
          placeholder="Anything to remember?"
          aria-label="Task notes"
        />
        <div className="gdm-task-details__note-actions">
          {noteDirty ? <span className="is-dirty">Unsaved</span> : <span aria-hidden="true" />}
          <button type="button" className="task-add" onClick={saveNote} disabled={!noteDirty || saving}>
            {saving ? "Saving..." : "Save note"}
          </button>
        </div>
      </section>
    </div>
  );
}

function GoalMobileSubtaskRow({
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
  const [title, setTitle] = useState(subtask.title);

  useEffect(() => {
    setTitle(subtask.title);
  }, [subtask.title]);

  const commitTitle = () => {
    const trimmed = title.trim().slice(0, MAX_GOAL_SUBTASK_TITLE);
    if (!trimmed) {
      setTitle(subtask.title);
      return;
    }
    if (trimmed !== subtask.title) onRename(trimmed);
  };

  return (
    <div className={`gdm-subtask ${subtask.completed ? "is-complete" : ""}`.trim()}>
      <div className="checkbox-wrapper task-checkbox gdm-subtask__check">
        <input
          id={`gdm-subtask-cb-${subtask.id}`}
          type="checkbox"
          checked={subtask.completed}
          aria-label={subtask.completed ? "Mark subtask as not done" : "Mark subtask as done"}
          onChange={onToggle}
        />
        <label htmlFor={`gdm-subtask-cb-${subtask.id}`}>
          <span className="tick_mark" aria-hidden="true" />
        </label>
      </div>
      <input
        className="gdm-subtask__title"
        value={title}
        onChange={(event) => setTitle(event.target.value.slice(0, MAX_GOAL_SUBTASK_TITLE))}
        onBlur={commitTitle}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setTitle(subtask.title);
            event.currentTarget.blur();
          }
        }}
        maxLength={MAX_GOAL_SUBTASK_TITLE}
        aria-label="Subtask title"
      />
      <span className="gdm-subtask__today">
        {!subtask.completed ? <AddToTodayButton goalSubtaskId={subtask.id} size="sm" /> : null}
      </span>
      <DeleteActionButton className="gdm-subtask__delete" onClick={onDelete} aria-label="Delete subtask">
        Delete
      </DeleteActionButton>
    </div>
  );
}

function GoalMobileAddTask({
  disabled,
  onOpen,
}: {
  disabled: boolean;
  onOpen: () => void;
}) {
  return (
    <div className={`gdm-add ${disabled ? "is-disabled" : ""}`.trim()}>
      <button
        type="button"
        className="add-icon-btn gdm-add__button"
        disabled={disabled}
        onClick={onOpen}
        aria-label={disabled ? `Task limit reached (${MAX_GOAL_TASKS})` : "Add task"}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}

function GoalMobileTaskCreatePage({
  goal,
  onClose,
  onSave,
}: {
  goal: Goal;
  onClose: () => void;
  onSave: (draft: MobileTaskDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<MobileTaskDraft>(() => ({
    title: "",
    deadline: "",
    completed: false,
    iconId: goal.iconId ?? null,
    note: null,
    subtasks: [],
  }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const saveTask = async () => {
    const trimmed = draft.title.trim();
    if (!trimmed) {
      setError("Task needs a name.");
      return;
    }

    setError("");
    setSaving(true);
    try {
      await onSave({ ...draft, title: trimmed });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save task.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.section
      className="goal-detail-mobile gdm-task-create-page"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="gdm-header">
        <button
          type="button"
          className="ui-icon-btn ui-icon-btn--subtle gdm-header__back"
          aria-label="Back to goal"
          onClick={onClose}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <h1>New task</h1>
      </header>

      <div className="gdm-scroll app-scroll">
        <form
          className="gdm-page-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveTask();
          }}
        >
          <label className="gdm-page-form__field">
            <span>Task name</span>
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value.slice(0, MAX_TITLE_LENGTH) }))}
              maxLength={MAX_TITLE_LENGTH}
              aria-label="Task name"
              autoFocus
            />
          </label>

          <div className="gdm-page-form__field">
            <span>Icon</span>
            <GoalMobileTaskIconSelect
              value={draft.iconId}
              onChange={(iconId) => setDraft((current) => ({ ...current, iconId }))}
              ariaLabel="Choose task icon"
            />
          </div>

          <div className="gdm-page-form__field">
            <span>Date</span>
            <GoalDatePicker
              value={draft.deadline}
              onChange={(deadline) => setDraft((current) => ({ ...current, deadline }))}
              className="gdm-page-form__date"
              ariaLabel="Task date"
            />
          </div>

          {error ? <p className="gdm-task__error" aria-live="polite">{error}</p> : null}

          <div className="gdm-page-form__actions">
            <button
              type="button"
              className="pomodoro-btn pomodoro-btn--ghost-text"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="task-add" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </motion.section>
  );
}

function GoalMobileEditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 17.5 4.5 20 7 19.5 17.8 8.7 15.8 6.7 5 17.5Z" />
      <path d="M14.8 7.7 16.9 5.6c.6-.6 1.5-.6 2.1 0l.4.4c.6.6.6 1.5 0 2.1l-2.1 2.1" />
    </svg>
  );
}

function GoalMobileTrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 8.5h8" />
      <path d="M10 8.5V6.8c0-.6.5-1.1 1.1-1.1h1.8c.6 0 1.1.5 1.1 1.1v1.7" />
      <path d="m9 10.5.5 7.7c.1.8.7 1.3 1.5 1.3h2c.8 0 1.4-.5 1.5-1.3l.5-7.7" />
      <path d="m11.2 12.3.2 4.7M12.8 12.3l-.2 4.7" />
    </svg>
  );
}

export function GoalDetailMobile() {
  const { goalId } = useParams();
  const navigate = useNavigate();
  const goalsQuery = useGoals();
  const updateGoal = useUpdateGoal();
  const goals = goalsQuery.data ?? [];
  const goal = goals.find((item) => item.id === goalId);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [addingTask, setAddingTask] = useState(false);

  if (goalsQuery.isLoading) {
    return <p className="goals-mobile__empty">Loading goal...</p>;
  }

  if (!goal) {
    return (
      <section className="goal-detail-mobile">
        <header className="gdm-header">
          <Link className="ui-icon-btn ui-icon-btn--subtle gdm-header__back" to="/goals" aria-label="Back to goals">
            <span aria-hidden="true">‹</span>
          </Link>
          <h1>Goal</h1>
        </header>
        <div className="goals-mobile__empty">
          <strong>Goal not found</strong>
          <span>This goal is no longer available.</span>
        </div>
      </section>
    );
  }

  const progress = getProgress(goal.tasks);
  const doneTasks = goal.tasks.filter((task) => isTaskComplete(task)).length;
  const openTasks = goal.tasks.length - doneTasks;
  const nextTask = goal.tasks.find((task) => !isTaskComplete(task)) ?? goal.tasks[goal.tasks.length - 1];
  const overdue = goal.tasks.filter((task) => getTaskHealth(task) === "overdue").length;
  const dueToday = goal.tasks.filter((task) => getTaskHealth(task) === "due-today").length;
  const goalHealthLabel = getGoalHealthLabel(goal);

  const saveTasks = async (draft?: MobileTaskDraft, removeTaskId?: string) => {
    await updateGoal.mutateAsync({
      id: goal.id,
      input: { tasks: serializeGoalTasks(goal.tasks, draft, removeTaskId) },
    });
    setEditingTaskId(null);
    if (removeTaskId && expandedTaskId === removeTaskId) setExpandedTaskId(null);
  };

  const toggleTask = async (task: GoalTask) => {
    if (task.subtasks.length > 0) return;
    await saveTasks({ ...toMobileTaskDraft(task), completed: !task.completed });
  };

  if (editingGoal) {
    return <GoalMobileGoalEditPage goal={goal} onClose={() => setEditingGoal(false)} />;
  }

  if (addingTask) {
    return (
      <GoalMobileTaskCreatePage
        goal={goal}
        onClose={() => setAddingTask(false)}
        onSave={async (draft) => {
          await saveTasks(draft);
          setAddingTask(false);
        }}
      />
    );
  }

  return (
    <motion.section
      className="goal-detail-mobile"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="gdm-header">
        <button
          type="button"
          className="ui-icon-btn ui-icon-btn--subtle gdm-header__back"
          aria-label="Back to goals"
          onClick={() => navigate("/goals")}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <h1>Goal</h1>
      </header>

      <div className="gdm-scroll app-scroll">
        <section className="gdm-summary" aria-label="Goal summary">
          <button
            type="button"
            className="ui-icon-btn ui-icon-btn--subtle gdm-summary__edit"
            aria-label="Edit goal"
            onClick={() => setEditingGoal(true)}
          >
            <GoalMobileEditIcon />
          </button>
          <div className="gdm-summary__top">
            <span className="gdm-summary__icon" aria-hidden="true">
              <GoalTaskIcon iconId={goal.iconId ?? nextTask?.iconId} />
            </span>
            <div className="gdm-summary__title">
              <h2>{goal.title}</h2>
              <p>{nextTask ? `Next: ${nextTask.title}` : "No tasks yet"}</p>
              <div className="gdm-summary__meta-row">
                <span className={getGoalHealthClassName(goal)}>{goalHealthLabel}</span>
                <strong className="gdm-summary__percent">{progress}%</strong>
              </div>
            </div>
          </div>
          <div className="goal-progress" aria-label={`${progress}% completed`}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="gdm-summary__stats">
            <span>{doneTasks}/{goal.tasks.length} done</span>
            <span>{openTasks} open</span>
            {goal.deadline ? <span>Due {formatDate(goal.deadline)}</span> : null}
            {overdue > 0 ? <span className="gdm-summary__alert gdm-summary__alert--overdue">{overdue} overdue</span> : null}
            {dueToday > 0 ? <span className="gdm-summary__alert gdm-summary__alert--due-today">{dueToday} today</span> : null}
          </div>
        </section>

        <section className="gdm-tasks" aria-label="Goal tasks">
          <header className="gdm-section-header">
            <div>
              <h2>Tasks</h2>
              <p>{goal.tasks.length ? "Swipe right to edit, left to delete" : "Start with the first task"}</p>
            </div>
          </header>

          {goal.tasks.length ? (
            <ul className="gdm-task-list">
              <AnimatePresence initial={false}>
                {goal.tasks.map((task) => (
                  <GoalMobileTaskRow
                    key={task.id}
                    goal={goal}
                    task={task}
                    isEditing={editingTaskId === task.id}
                    onEdit={() => setEditingTaskId(task.id)}
                    onCancelEdit={() => setEditingTaskId(null)}
                    onSave={(draft) => saveTasks(draft)}
                    onDelete={() => saveTasks(undefined, task.id)}
                    onToggle={() => toggleTask(task)}
                    expanded={expandedTaskId === task.id}
                    onToggleExpand={() => setExpandedTaskId((current) => (current === task.id ? null : task.id))}
                  />
                ))}
              </AnimatePresence>
            </ul>
          ) : null}

          <GoalMobileAddTask
            disabled={goal.tasks.length >= MAX_GOAL_TASKS}
            onOpen={() => setAddingTask(true)}
          />
        </section>
      </div>
    </motion.section>
  );
}
