import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AnimatePresence,
  animate,
  motion,
  Reorder,
  useDragControls,
  useMotionValue,
  useTransform,
} from "motion/react";
import type { Goal, GoalTask, GoalSubtask, GoalOccurrenceDeleteAction, GoalOccurrenceDeleteDecision, GoalLinkedScheduleEnvelope } from "../../../shared/schemas";
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
import { ScheduleGoalTaskButton } from "./ScheduleGoalTaskButton";
import { GoalDatePicker } from "./GoalDatePicker";
import { useIsMobile } from "../../shared/hooks/useIsMobile";
import { ApiError } from "../../shared/api/client";
import { fetchGoalLinkedSchedule } from "../today/occurrencesApi";

const MOBILE_SWIPE_TRIGGER = 112;
const MOBILE_SWIPE_LIMIT = 128;

function createDraftId() {
  return globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

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
    id: createDraftId(),
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

function IconPickerPopover({
  anchorRef,
  className,
  value,
  onChange,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  className: string;
  value: string | null;
  onChange: (iconId: string | null) => void;
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const popover = popoverRef.current;
      if (!anchor || !popover) return;

      const gap = 8;
      const margin = 8;
      const popW = popover.offsetWidth;
      const popH = popover.offsetHeight;
      const spaceBelow = window.innerHeight - anchor.bottom;
      const openUp = spaceBelow < popH + gap && anchor.top > spaceBelow;
      const left = Math.max(margin, Math.min(anchor.left - 12, window.innerWidth - popW - margin));

      setPopoverStyle({
        position: "fixed",
        zIndex: 1200,
        left,
        right: "auto",
        top: openUp ? "auto" : anchor.bottom + gap,
        bottom: openUp ? window.innerHeight - anchor.top + gap : "auto",
        visibility: "visible",
      });
    };

    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchorRef]);

  return createPortal(
    <div ref={popoverRef} className={`${className} goal-icon-picker-popover`.trim()} style={popoverStyle}>
      <IconPicker value={value} onChange={onChange} />
    </div>,
    document.body,
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
  mobileCreateMode = false,
}: {
  task: DraftTask;
  onChange: (updates: Partial<DraftTask>) => void;
  onRemove: () => void;
  disableRemove: boolean;
  mobileCreateMode?: boolean;
}) {
  const dragControls = useDragControls();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isEditingMobile, setIsEditingMobile] = useState(false);
  const iconButtonRef = useRef<HTMLButtonElement | null>(null);
  const x = useMotionValue(0);
  const editWidth = useTransform(x, (value) => Math.min(MOBILE_SWIPE_LIMIT, Math.max(0, value)));
  const deleteWidth = useTransform(x, (value) => Math.min(MOBILE_SWIPE_LIMIT, Math.max(0, -value)));
  const editVisibility = useTransform(x, (value) => (value > 1 ? "visible" : "hidden"));
  const deleteVisibility = useTransform(x, (value) => (value < -1 ? "visible" : "hidden"));

  if (mobileCreateMode) {
    return (
      <Reorder.Item
        value={task}
        dragListener={false}
        dragControls={dragControls}
        className={`goal-task-editor goal-task-editor--mobile-swipe ${isEditingMobile ? "is-editing" : ""} ${pickerOpen ? "is-icon-picker-open" : ""}`.trim()}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
      >
        <motion.span
          className="goal-task-swipe-action goal-task-swipe-action--edit"
          style={{ width: editWidth, visibility: editVisibility }}
          aria-hidden="true"
        >
          <GoalMobileEditIcon />
          <span>EDIT</span>
        </motion.span>
        <motion.span
          className="goal-task-swipe-action goal-task-swipe-action--delete"
          style={{ width: deleteWidth, visibility: deleteVisibility }}
          aria-hidden="true"
        >
          <GoalMobileTrashIcon />
          <span>DELETE</span>
        </motion.span>

        <motion.div
          className="goal-task-editor__swipe-surface"
          drag="x"
          style={{ x }}
          dragConstraints={{ left: -MOBILE_SWIPE_LIMIT, right: MOBILE_SWIPE_LIMIT }}
          dragElastic={0.08}
          onDragEnd={() => {
            const swipe = x.get();
            animate(x, 0, { type: "spring", stiffness: 520, damping: 38 });
            if (swipe >= MOBILE_SWIPE_TRIGGER) {
              setIsEditingMobile(true);
              return;
            }
            if (swipe <= -MOBILE_SWIPE_TRIGGER && !disableRemove) {
              onRemove();
            }
          }}
        >
          {isEditingMobile ? (
            <>
              <div className={`goal-task-editor__icon-wrap ${pickerOpen ? "is-icon-picker-open" : ""}`.trim()}>
                <button
                  ref={iconButtonRef}
                  type="button"
                  className="goal-task-editor__icon"
                  onClick={() => setPickerOpen((current) => !current)}
                  aria-label="Choose task icon"
                >
                  <GoalTaskIcon iconId={task.iconId} />
                </button>
                {pickerOpen ? (
                  <IconPickerPopover
                    anchorRef={iconButtonRef}
                    className="goal-task-editor__popover"
                    value={task.iconId}
                    onChange={(iconId) => {
                      onChange({ iconId });
                      setPickerOpen(false);
                    }}
                  />
                ) : null}
              </div>
              <div className="goal-task-editor__field-stack">
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
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className="goal-task-editor__mobile-drag-icon"
                aria-label="Drag task to reorder"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  dragControls.start(event);
                }}
              >
                <GoalTaskIcon iconId={task.iconId} />
              </button>
              <div className="goal-task-editor__readonly-fields" aria-label={task.title}>
                <span className="goal-task-editor__readonly-title">{task.title}</span>
                <span className="goal-task-editor__readonly-date">
                  {task.deadline ? formatDate(task.deadline) : "No due date"}
                </span>
              </div>
            </>
          )}
        </motion.div>
      </Reorder.Item>
    );
  }

  return (
    <Reorder.Item
      value={task}
      dragListener={false}
      dragControls={dragControls}
      className={`goal-task-editor ${pickerOpen ? "is-icon-picker-open" : ""}`.trim()}
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
      <div className={`goal-task-editor__icon-wrap ${pickerOpen ? "is-icon-picker-open" : ""}`.trim()}>
        <button
          ref={iconButtonRef}
          type="button"
          className="goal-task-editor__icon"
          onClick={() => setPickerOpen((current) => !current)}
          aria-label="Choose task icon"
        >
          <GoalTaskIcon iconId={task.iconId} />
        </button>
        {pickerOpen ? (
          <IconPickerPopover
            anchorRef={iconButtonRef}
            className="goal-task-editor__popover"
            value={task.iconId}
            onChange={(iconId) => {
              onChange({ iconId });
              setPickerOpen(false);
            }}
          />
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
  const goalIconButtonRef = useRef<HTMLButtonElement | null>(null);
  const [mobileCreateStep, setMobileCreateStep] = useState(0);
  const [error, setError] = useState("");
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const isMobile = useIsMobile();
  const isEditing = Boolean(goal);
  const isSaving = createGoal.isPending || updateGoal.isPending;
  const isMobileCreate = isMobile && !isEditing;
  const mobileCreateStepCount = 3;
  const mobileCreateProgress = `${((mobileCreateStep + 1) / mobileCreateStepCount) * 100}%`;

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
      tasks: [...current.tasks, { ...newTask, id: createDraftId(), title }],
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

  const goToNextMobileCreateStep = () => {
    if (mobileCreateStep === 0 && !draft.title.trim()) {
      setError("Goal needs a name — even a tiny heroic one.");
      return;
    }
    setError("");
    setMobileCreateStep((current) =>
      Math.min(current + 1, mobileCreateStepCount - 1),
    );
  };

  const goToPreviousMobileCreateStep = () => {
    setError("");
    setMobileCreateStep((current) => Math.max(current - 1, 0));
  };

  const handleFooterSecondary = () => {
    if (isMobileCreate && mobileCreateStep > 0) {
      goToPreviousMobileCreateStep();
      return;
    }
    onClose();
  };

  const handleFooterPrimary = () => {
    if (isMobileCreate && mobileCreateStep < mobileCreateStepCount - 1) {
      goToNextMobileCreateStep();
      return;
    }
    void save();
  };

  return (
    <motion.div
      className="goal-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.section
        className={`goal-modal tasks-panel tasks-panel--today app-scroll ${isMobile ? "goal-modal--mobile" : ""}`.trim()}
        initial={isMobile ? { opacity: 0, y: 18 } : { opacity: 0, x: -32 }}
        animate={isMobile ? { opacity: 1, y: 0 } : { opacity: 1, x: 0 }}
        exit={isMobile ? { opacity: 0, y: 14 } : { opacity: 0, x: -28 }}
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? "Edit goal" : "Create goal"}
      >
        <header className="goal-modal__header">
          <div>
            {isMobile && !isEditing ? null : (
              <p className="goal-kicker">
                {isEditing ? "Edit goal" : "New goal"}
              </p>
            )}
            <h2>{isEditing ? "Tune the route" : "Create a goal"}</h2>
          </div>
          {isMobile && !isEditing ? null : (
            <button
              type="button"
              className="goal-icon-button"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          )}
        </header>

        {isMobileCreate ? (
          <div
            className="goal-create-progress"
            style={{ "--goal-create-progress": mobileCreateProgress } as CSSProperties}
          >
            <div className="goal-create-progress__meta">
              <span>Step {mobileCreateStep + 1} of {mobileCreateStepCount}</span>
            </div>
            <div className="goal-create-progress__track" aria-hidden="true">
              <span />
            </div>
          </div>
        ) : null}

        <div className="goal-create-step">
          {(!isMobileCreate || mobileCreateStep === 0) ? (
            <div className="goal-form-grid">
              <div className="goal-mobile-section-title">Goal name</div>
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
          ) : null}

          {(!isMobileCreate || mobileCreateStep === 1) ? (
            <div className={`goal-editor-icon-block ${isMobileCreate ? "goal-editor-icon-block--mobile-picker" : ""}`.trim()}>
              <div className="goal-mobile-section-title">Icon</div>
              {isMobileCreate ? (
                <div className="goal-detail-editor__icon goal-detail-editor__icon--preview" aria-hidden="true">
                  <GoalTaskIcon iconId={draft.iconId} />
                </div>
              ) : (
                <button
                  ref={goalIconButtonRef}
                  type="button"
                  className="goal-detail-editor__icon"
                  onClick={() => setGoalIconPickerOpen((current) => !current)}
                  aria-label="Choose goal icon"
                >
                  <GoalTaskIcon iconId={draft.iconId} />
                </button>
              )}
              <div className="goal-editor-icon-block__copy">
                <span>Pick the icon for this goal summary.</span>
              </div>
              {isMobileCreate ? (
                <div className="goal-editor-icon-block__picker">
                  <IconPicker
                    value={draft.iconId}
                    onChange={(iconId) => {
                      setDraft((current) => ({ ...current, iconId }));
                    }}
                  />
                </div>
              ) : goalIconPickerOpen ? (
                <IconPickerPopover
                  anchorRef={goalIconButtonRef}
                  className="goal-editor-icon-block__popover"
                  value={draft.iconId}
                  onChange={(iconId) => {
                    setDraft((current) => ({ ...current, iconId }));
                    setGoalIconPickerOpen(false);
                  }}
                />
              ) : null}
            </div>
          ) : null}

          {(!isEditing && (!isMobileCreate || mobileCreateStep === 2)) ? (
            <div className="goal-editor-section">
              <div className="goal-editor-section__head">
                <div>
                  <h3>Break it into steps</h3>
                </div>
                <span className="goal-editor-section__count">
                  {draft.tasks.length} step{draft.tasks.length === 1 ? "" : "s"}
                </span>
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
                      mobileCreateMode={isMobileCreate}
                    />
                  ))}
                </AnimatePresence>
              </Reorder.Group>

              <div className={`goal-task-add-row ${newTaskPickerOpen ? "is-icon-picker-open" : ""}`.trim()} aria-label="Add task to goal">
                <span className="goal-task-add-row__label">Add a new step</span>
                <div className={`goal-task-editor__icon-wrap goal-task-add-row__icon-wrap ${newTaskPickerOpen ? "is-icon-picker-open" : ""}`.trim()}>
                  <button
                    type="button"
                    className="goal-task-editor__icon goal-task-add-row__icon"
                    onClick={() => setNewTaskPickerOpen((current) => !current)}
                    aria-expanded={newTaskPickerOpen}
                    aria-label="Choose new task icon"
                    title="Choose icon"
                  >
                    <span className="goal-task-add-row__icon-preview" aria-hidden="true">
                      <GoalTaskIcon iconId={newTask.iconId} />
                    </span>
                    <span className="goal-task-add-row__icon-label">Pick an icon</span>
                    <svg className="goal-task-add-row__icon-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {newTaskPickerOpen ? (
                    <motion.div
                      className="goal-task-editor__popover goal-task-add-row__icon-picker"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.14, ease: "easeOut" }}
                    >
                      <IconPicker
                        value={newTask.iconId}
                        onChange={(iconId) => {
                          setNewTask((current) => ({ ...current, iconId }));
                          setNewTaskPickerOpen(false);
                        }}
                      />
                    </motion.div>
                  ) : null}
                </div>
                <div className="goal-task-add-row__fields">
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
                    placeholder="Task name"
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
                </div>
                <button
                  type="button"
                  className="task-add goal-task-add-row__add"
                  onClick={addTask}
                  aria-label="Add task"
                >
                  <span aria-hidden="true">+</span>
                  Add step
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <p className="goal-error" aria-live="polite">
          {error}
        </p>

        <footer className={`goal-modal__footer ${isMobileCreate ? "goal-modal__footer--create-steps" : ""}`.trim()}>
          <button
            type="button"
            className={`pomodoro-btn pomodoro-btn--ghost-text ${isMobileCreate && mobileCreateStep > 0 ? "goal-create-footer__back" : ""}`.trim()}
            onClick={handleFooterSecondary}
          >
            {isMobileCreate && mobileCreateStep > 0 ? (
              <span className="goal-create-footer__content">
                <svg className="goal-create-footer__arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
                Back
              </span>
            ) : (
              "Cancel"
            )}
          </button>
          <button
            type="button"
            className={`task-add ${isMobileCreate && mobileCreateStep < mobileCreateStepCount - 1 ? "goal-create-footer__continue" : ""}`.trim()}
            onClick={handleFooterPrimary}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : isMobileCreate && mobileCreateStep < mobileCreateStepCount - 1
              ? (
                <span className="goal-create-footer__content">
                  Continue
                  <svg className="goal-create-footer__arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </span>
              )
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
  const selectableGoalOptions = useMemo(
    () => (selectableGoals ?? []).filter((option) => getStatusLabel(option) !== "Completed"),
    [selectableGoals],
  );
  const canSelectGoal = Boolean(selectableGoalOptions.length && onSelectGoal);
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
  const selectedGoalOption = selectableGoals?.find((option) => option.id === (selectedGoalId ?? goal.id)) ?? goal;
  const selectedGoalIconId = selectedGoalOption.iconId ?? selectedGoalOption.tasks.find((task) => !isTaskComplete(task))?.iconId ?? selectedGoalOption.tasks[0]?.iconId;
  const [goalSelectorOpen, setGoalSelectorOpen] = useState(false);
  const [goalSelectorPlacement, setGoalSelectorPlacement] = useState<"down" | "up">("down");
  const [goalSelectorMaxHeight, setGoalSelectorMaxHeight] = useState<number | null>(null);
  const goalSelectorRef = useRef<HTMLDivElement>(null);

  // Pick a side (down/up) AND clamp the list height to the room actually
  // available on that side, so the whole scroll window stays on-screen and the
  // list can always scroll down to the last goal. Without the clamp the fixed
  // 200px window can extend past the viewport/`100dvh` clip when the widget
  // sits low, leaving the bottom options unreachable.
  const measureGoalSelector = useCallback(() => {
    const selector = goalSelectorRef.current;
    if (!selector) return;
    const rect = selector.getBoundingClientRect();
    // Gap below/above the trigger + the dropdown's own padding + breathing room.
    const GAP = 18;
    const spaceBelow = window.innerHeight - rect.bottom - GAP;
    const spaceAbove = rect.top - GAP;
    const placeUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const available = Math.max(140, Math.floor(placeUp ? spaceAbove : spaceBelow));
    setGoalSelectorPlacement(placeUp ? "up" : "down");
    setGoalSelectorMaxHeight(Math.min(available, Math.round(window.innerHeight * 0.6)));
  }, []);

  useEffect(() => {
    if (!goalSelectorOpen) return;
    const onClickOut = (event: MouseEvent) => {
      if (goalSelectorRef.current && !goalSelectorRef.current.contains(event.target as Node)) {
        setGoalSelectorOpen(false);
      }
    };
    measureGoalSelector();
    window.addEventListener("resize", measureGoalSelector);
    window.addEventListener("scroll", measureGoalSelector, true);
    document.addEventListener("mousedown", onClickOut);
    return () => {
      window.removeEventListener("resize", measureGoalSelector);
      window.removeEventListener("scroll", measureGoalSelector, true);
      document.removeEventListener("mousedown", onClickOut);
    };
  }, [goalSelectorOpen, measureGoalSelector]);

  const toggleGoalSelector = () => {
    measureGoalSelector();
    setGoalSelectorOpen((open) => !open);
  };

  const goalSelector = canSelectGoal ? (
    <div className="goal-journey__selector goal-journey__selector--select" ref={goalSelectorRef}>
      <span className="sr-only">Select goal</span>
      <button
        type="button"
        className="goal-journey__selector-trigger"
        aria-label="Select goal for the path map"
        aria-haspopup="listbox"
        aria-expanded={goalSelectorOpen}
        onClick={toggleGoalSelector}
      >
        <span className="goal-journey__selector-icon">
          <GoalTaskIcon iconId={selectedGoalIconId} />
        </span>
        <span>{selectedGoalOption.title}</span>
        <span className="task-modal__dropdown-caret" aria-hidden="true" />
      </button>
      <div
        className="task-modal__dropdown-wrap goal-journey__selector-dropdown"
        data-open={goalSelectorOpen ? "true" : "false"}
        data-placement={goalSelectorPlacement}
      >
        <ul
          className="task-modal__combobox-list goal-journey__selector-list app-scroll"
          role="listbox"
          aria-label="Select goal"
          style={goalSelectorMaxHeight ? { maxHeight: `${goalSelectorMaxHeight}px` } : undefined}
        >
          {selectableGoalOptions.map((option) => {
            const optionIconId = option.iconId ?? option.tasks.find((task) => !isTaskComplete(task))?.iconId ?? option.tasks[0]?.iconId;
            const selected = option.id === (selectedGoalId ?? goal.id);
            return (
              <li key={option.id} className="task-modal__dropdown-item">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className="goal-journey__selector-option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onSelectGoal?.(option.id);
                    setGoalSelectorOpen(false);
                  }}
                >
                  <span className="goal-journey__selector-option-icon">
                    <GoalTaskIcon iconId={optionIconId} />
                  </span>
                  <span>{option.title}</span>
                  {selected ? <span className="goal-journey__selector-check" aria-hidden="true">✓</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  ) : (
    <span className="goal-journey__selector">
      <span className="goal-journey__selector-icon">
        <GoalTaskIcon iconId={selectorIconId} />
      </span>
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

function GoalMobileRow({ goal, onDelete }: { goal: Goal; onDelete: () => void }) {
  const navigate = useNavigate();
  const x = useMotionValue(0);
  const deleteWidth = useTransform(x, (value) => Math.min(MOBILE_SWIPE_LIMIT, Math.max(0, -value)));
  const deleteVisibility = useTransform(x, (value) => (value < -1 ? "visible" : "hidden"));
  const [didSwipe, setDidSwipe] = useState(false);
  const progress = getProgress(goal.tasks);
  const doneTasks = goal.tasks.filter((task) => task.completed).length;
  const nextTask =
    goal.tasks.find((task) => !task.completed) ??
    goal.tasks[goal.tasks.length - 1];

  return (
    <motion.li
      className="gm-swipe-item"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
    >
      <motion.span
        className="gm-swipe-action gm-swipe-action--delete"
        style={{ width: deleteWidth, visibility: deleteVisibility }}
        aria-hidden="true"
      >
        <GoalMobileTrashIcon />
        <span>DELETE</span>
      </motion.span>

      <motion.button
        type="button"
        className="gm-goal-row"
        drag="x"
        style={{ x }}
        dragConstraints={{ left: -MOBILE_SWIPE_LIMIT, right: 0 }}
        dragElastic={0.08}
        onDragStart={() => setDidSwipe(true)}
        onDragEnd={() => {
          const swipe = x.get();
          animate(x, 0, { type: "spring", stiffness: 520, damping: 38 });
          if (swipe <= -MOBILE_SWIPE_TRIGGER) onDelete();
          window.setTimeout(() => setDidSwipe(false), 0);
        }}
        onClick={() => {
          if (didSwipe) return;
          navigate(`/goals/${goal.id}`);
        }}
        aria-label={`Open ${goal.title}`}
      >
        <div className="gm-goal-row__icon" aria-hidden="true">
          <GoalTaskIcon iconId={goal.iconId ?? nextTask?.iconId} />
        </div>
        <div className="gm-goal-row__body">
          <div className="gm-goal-row__topline">
            <span className={getStatusClassName(goal)}>{getStatusLabel(goal)}</span>
            {goal.deadline ? <span className="goal-deadline">Due {formatDate(goal.deadline)}</span> : null}
          </div>
          <strong className="gm-goal-row__title">{goal.title}</strong>
          <span className="gm-goal-row__next">
            {nextTask ? `Next: ${nextTask.title}` : "No tasks yet"}
          </span>
          <div className="gm-goal-row__progress">
            <div className="goal-progress" aria-label={`${progress}% completed`}>
              <span style={{ width: `${progress}%` }} />
            </div>
            <span>{progress}%</span>
          </div>
          <span className="gm-goal-row__meta">
            {doneTasks}/{goal.tasks.length} tasks done
          </span>
        </div>
        <span className="gm-goal-row__chevron" aria-hidden="true">›</span>
      </motion.button>
    </motion.li>
  );
}

function GoalsMobileList({
  goals,
  isLoading,
  stats,
  onAddGoal,
  onDeleteGoal,
}: {
  goals: Goal[];
  isLoading: boolean;
  stats: { totalTasks: number; doneTasks: number };
  onAddGoal: () => void;
  onDeleteGoal: (goal: Goal) => void;
}) {
  return (
    <motion.section
      className="goals-mobile"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="goals-mobile__header">
        <div>
          <h1 className="goals-mobile__title">Goals</h1>
          <p className="goals-mobile__counter">
            {goals.length} goal{goals.length === 1 ? "" : "s"} ·{" "}
            {stats.totalTasks > 0 ? `${stats.doneTasks}/${stats.totalTasks} tasks` : "0 tasks"}
          </p>
        </div>
      </header>

      <div className="goals-mobile__list-wrap app-scroll">
        {isLoading ? <div className="goals-mobile__empty">Loading goals...</div> : null}
        {!isLoading && goals.length === 0 ? (
          <div className="goals-mobile__empty">
            <strong>No goals yet</strong>
            <span>Add your first goal and break it into tiny steps.</span>
          </div>
        ) : null}
        {goals.length > 0 ? (
          <ul className="goals-mobile__list" aria-label="Goals list">
            <AnimatePresence initial={false}>
              {goals.map((goal) => (
                <GoalMobileRow key={goal.id} goal={goal} onDelete={() => onDeleteGoal(goal)} />
              ))}
            </AnimatePresence>
          </ul>
        ) : null}
      </div>

      <button
        type="button"
        className="add-icon-btn goals-mobile__fab"
        aria-label="Add goal"
        onClick={onAddGoal}
      >
        <span aria-hidden="true">+</span>
      </button>
    </motion.section>
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

function RepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M17.5 3.8L20.2 6.5L17.5 9.2" />
      <path d="M4 11V9.5C4 7.8 5.3 6.5 7 6.5H20" />
      <path d="M6.5 20.2L3.8 17.5L6.5 14.8" />
      <path d="M20 13V14.5C20 16.2 18.7 17.5 17 17.5H4" />
    </svg>
  );
}

function CompleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12.5L10 17.5L19 7" />
    </svg>
  );
}

function isGoalOccurrenceDeleteDecisionRequired(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.payload?.code === "goal_occurrence_delete_decision_required"
  );
}

function hasGoalLinkedFutureSchedule(schedule: GoalLinkedScheduleEnvelope) {
  return Boolean(schedule.recurring || schedule.oneOffOccurrences.length > 0);
}

async function hasGoalItemFutureSchedule(kind: GoalOccurrenceDeleteDecision["kind"], id: string) {
  const schedule = await fetchGoalLinkedSchedule(
    kind === "goal_task" ? { goalTaskId: id } : { goalSubtaskId: id },
  );
  return hasGoalLinkedFutureSchedule(schedule);
}

function GoalCompletionScheduleConfirm({
  itemLabel,
  pending,
  onCancel,
  onKeep,
  onDeleteFuture,
}: {
  itemLabel: string;
  pending: boolean;
  onCancel: () => void;
  onKeep: () => void;
  onDeleteFuture: () => void;
}) {
  return (
    <div className="pomodoro-confirm-overlay task-modal__recurrence-confirm goal-occurrence-delete-confirm goal-completion-schedule-confirm" role="dialog" aria-modal="true" aria-label="Complete scheduled goal item">
      <div className="pomodoro-confirm__card task-modal__recurrence-confirm-card task-modal__recurrence-confirm-card--wide">
        <div className="pomodoro-confirm__icon task-modal__recurrence-confirm-icon goal-completion-schedule-confirm__icon" aria-hidden="true">
          <CompleteIcon />
        </div>
        <div className="pomodoro-confirm__content">
          <h3>Complete task?</h3>
          <p>“{itemLabel}” has calendar occurrences. Remove future scheduled tasks?</p>
        </div>
        <div className="task-modal__recurrence-choice-list">
          <button type="button" onClick={onDeleteFuture} disabled={pending}>
            <strong>Delete future occurrences</strong>
            <span>Keep earlier occurrences and completed tasks from today as history.</span>
          </button>
          <button type="button" onClick={onKeep} disabled={pending}>
            <strong>Keep scheduled tasks</strong>
            <span>Only mark this goal item as complete.</span>
          </button>
        </div>
        <div className="task-modal__recurrence-confirm-actions">
          <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function GoalOccurrenceDeleteConfirm({
  itemLabel,
  pending,
  onCancel,
  onPick,
}: {
  itemLabel: string;
  pending: boolean;
  onCancel: () => void;
  onPick: (action: GoalOccurrenceDeleteAction) => void;
}) {
  return (
    <div className="pomodoro-confirm-overlay task-modal__recurrence-confirm goal-occurrence-delete-confirm" role="dialog" aria-modal="true" aria-label="Delete goal item occurrences">
      <div className="pomodoro-confirm__card task-modal__recurrence-confirm-card task-modal__recurrence-confirm-card--wide task-modal__recurrence-confirm-card--delete">
        <div className="pomodoro-confirm__icon task-modal__recurrence-confirm-icon" aria-hidden="true">
          <RepeatIcon />
        </div>
        <div className="pomodoro-confirm__content">
          <h3>Delete scheduled goal task?</h3>
          <p>“{itemLabel}” has calendar occurrences. Choose what should happen to them.</p>
        </div>
        <div className="task-modal__recurrence-choice-list">
          <button type="button" onClick={() => onPick("delete-all")} disabled={pending}>
            <strong>Delete all occurrences</strong>
            <span>Remove every calendar task linked to this goal item.</span>
          </button>
          <button type="button" onClick={() => onPick("delete-future")} disabled={pending}>
            <strong>Delete future occurrences</strong>
            <span>Keep earlier occurrences and completed tasks from today as history.</span>
          </button>
          <button type="button" onClick={() => onPick("detach")} disabled={pending}>
            <strong>Keep and unlink occurrences</strong>
            <span>Turn them into regular calendar tasks.</span>
          </button>
        </div>
        <div className="task-modal__recurrence-confirm-actions">
          <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function GoalDetailTaskRow({
  goal,
  task,
  expanded,
  onToggleExpand,
  onDelete,
  onPersistOrder,
  onStartEdit,
}: {
  goal: Goal;
  task: GoalTask;
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
  const [pendingCompletionCleanup, setPendingCompletionCleanup] = useState(false);
  const [completionCleanupPending, setCompletionCleanupPending] = useState(false);
  const iconButtonRef = useRef<HTMLButtonElement | null>(null);
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

  const saveTask = async (draft: DetailTaskDraft, occurrenceDeleteDecisions?: GoalOccurrenceDeleteDecision[]) => {
    await updateGoal.mutateAsync({
      id: goal.id,
      input: { tasks: serializeTasks(goal.tasks, draft), occurrenceDeleteDecisions },
    });
  };

  const toggleTask = async () => {
    // Manual toggle only meaningful when there are no subtasks — otherwise completion is derived.
    if (subtaskCount > 0) return;
    const nextCompleted = !task.completed;
    const nextDraft = { ...toDetailTaskDraft(task), completed: nextCompleted };
    if (!nextCompleted) {
      await saveTask(nextDraft);
      return;
    }

    setError("");
    try {
      if (await hasGoalItemFutureSchedule("goal_task", task.id)) {
        setPendingCompletionCleanup(true);
        return;
      }
      await saveTask(nextDraft);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not check scheduled tasks.");
    }
  };

  const completeTask = async (deleteFuture: boolean) => {
    setCompletionCleanupPending(true);
    try {
      await saveTask(
        { ...toDetailTaskDraft(task), completed: true },
        deleteFuture ? [{ kind: "goal_task", id: task.id, action: "delete-future" }] : undefined,
      );
      setPendingCompletionCleanup(false);
    } finally {
      setCompletionCleanupPending(false);
    }
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
      className={`goal-detail-task ${isEditing ? "is-editing" : ""} ${complete ? "is-complete" : ""} ${expanded ? "is-expanded" : ""} ${pickerOpen ? "is-icon-picker-open" : ""}`.trim()}
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
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <circle cx="6" cy="4" r="1.2" />
            <circle cx="10" cy="4" r="1.2" />
            <circle cx="6" cy="8" r="1.2" />
            <circle cx="10" cy="8" r="1.2" />
            <circle cx="6" cy="12" r="1.2" />
            <circle cx="10" cy="12" r="1.2" />
          </svg>
        </button>
        <button
          type="button"
          className="goal-detail-task__check"
          onClick={toggleTask}
          disabled={subtaskCount > 0 || isEditing}
          aria-label={subtaskCount > 0 ? "Completion follows subtasks" : "Toggle goal task completion"}
          title={subtaskCount > 0 ? `${doneSubtasks}/${subtaskCount} subtasks done` : undefined}
        >
          <span className="goal-detail-task__check-mark" aria-hidden="true">✓</span>
        </button>
        {isEditing ? (
          <div className="goal-detail-task__main goal-detail-task__main--editing">
            <div className={`goal-detail-task__icon-edit-wrap ${pickerOpen ? "is-icon-picker-open" : ""}`.trim()}>
              <button
                ref={iconButtonRef}
                type="button"
                className="goal-detail-task__icon-edit"
                onClick={() => setPickerOpen((current) => !current)}
                aria-label="Choose task icon"
              >
                <GoalTaskIcon iconId={draft.iconId} />
              </button>
              {pickerOpen ? (
                <IconPickerPopover
                  anchorRef={iconButtonRef}
                  className="goal-detail-task__icon-popover"
                  value={draft.iconId}
                  onChange={(iconId) => {
                    setDraft((current) => ({ ...current, iconId }));
                    setPickerOpen(false);
                  }}
                />
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
            <span className="goal-detail-task__icon-bubble">
              <GoalTaskIcon iconId={task.iconId} />
            </span>
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
        <div className="goal-detail-task__today" aria-label="Schedule task">
          {subtaskCount === 0 && !complete && !isEditing ? (
            // Only allow scheduling the task itself when:
            //  - it has no subtasks (otherwise user picks a subtask instead);
            //  - it is not already complete (nothing left to schedule).
            <ScheduleGoalTaskButton goalTitle={goal.title} sourceTitle={task.title} goalTaskId={task.id} size="sm" />
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
      <AnimatePresence>
        {pendingCompletionCleanup ? (
          <GoalCompletionScheduleConfirm
            itemLabel={task.title}
            pending={completionCleanupPending}
            onCancel={() => setPendingCompletionCleanup(false)}
            onKeep={() => void completeTask(false)}
            onDeleteFuture={() => void completeTask(true)}
          />
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
  onSave: (draft: DetailTaskDraft, occurrenceDeleteDecisions?: GoalOccurrenceDeleteDecision[]) => Promise<void>;
}) {
  const [note, setNote] = useState<string>(task.note ?? "");
  const [subtaskDraftIds, setSubtaskDraftIds] = useState<string[]>(
    (task.subtasks ?? []).map((s) => s.id),
  );
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [pendingSubtaskDelete, setPendingSubtaskDelete] = useState<GoalSubtask | null>(null);
  const [subtaskDeletePending, setSubtaskDeletePending] = useState(false);
  const [pendingSubtaskCompletionCleanup, setPendingSubtaskCompletionCleanup] = useState<GoalSubtask | null>(null);
  const [subtaskCompletionCleanupPending, setSubtaskCompletionCleanupPending] = useState(false);

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
    occurrenceDeleteDecisions?: GoalOccurrenceDeleteDecision[],
  ) => {
    await onSave({ ...baseDraft(), subtasks: nextSubtasks }, occurrenceDeleteDecisions);
  };

  const completeSubtask = async (subtask: GoalSubtask, deleteFuture: boolean) => {
    const next = (task.subtasks ?? []).map((s) =>
      s.id === subtask.id ? { id: s.id, title: s.title, completed: true } : { id: s.id, title: s.title, completed: s.completed },
    );
    setSubtaskCompletionCleanupPending(true);
    try {
      await saveSubtasks(
        next,
        deleteFuture ? [{ kind: "goal_subtask", id: subtask.id, action: "delete-future" }] : undefined,
      );
      setPendingSubtaskCompletionCleanup(null);
    } finally {
      setSubtaskCompletionCleanupPending(false);
    }
  };

  const toggleSubtask = async (id: string) => {
    const target = (task.subtasks ?? []).find((s) => s.id === id);
    if (!target) return;
    if (target.completed) {
      const next = (task.subtasks ?? []).map((s) =>
        s.id === id ? { id: s.id, title: s.title, completed: false } : { id: s.id, title: s.title, completed: s.completed },
      );
      await saveSubtasks(next);
      return;
    }
    if (await hasGoalItemFutureSchedule("goal_subtask", id)) {
      setPendingSubtaskCompletionCleanup(target);
      return;
    }
    await completeSubtask(target, false);
  };

  const renameSubtask = async (id: string, title: string) => {
    const trimmed = title.slice(0, MAX_GOAL_SUBTASK_TITLE);
    const next = (task.subtasks ?? []).map((s) =>
      s.id === id ? { id: s.id, title: trimmed, completed: s.completed } : { id: s.id, title: s.title, completed: s.completed },
    );
    await saveSubtasks(next);
  };

  const deleteSubtask = async (id: string, action?: GoalOccurrenceDeleteAction) => {
    const next = (task.subtasks ?? [])
      .filter((s) => s.id !== id)
      .map((s) => ({ id: s.id, title: s.title, completed: s.completed }));
    try {
      setSubtaskDeletePending(true);
      await saveSubtasks(
        next,
        action ? [{ kind: "goal_subtask", id, action }] : undefined,
      );
      setPendingSubtaskDelete(null);
    } catch (error) {
      if (isGoalOccurrenceDeleteDecisionRequired(error)) {
        setPendingSubtaskDelete((task.subtasks ?? []).find((s) => s.id === id) ?? null);
        return;
      }
      throw error;
    } finally {
      setSubtaskDeletePending(false);
    }
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
                goalTitle={goal.title}
                onToggle={() => toggleSubtask(sub.id)}
                onRename={(title) => renameSubtask(sub.id, title)}
                onDelete={() => void deleteSubtask(sub.id)}
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
      <AnimatePresence>
        {pendingSubtaskDelete ? (
          <GoalOccurrenceDeleteConfirm
            itemLabel={pendingSubtaskDelete.title}
            pending={subtaskDeletePending}
            onCancel={() => setPendingSubtaskDelete(null)}
            onPick={(action) => void deleteSubtask(pendingSubtaskDelete.id, action)}
          />
        ) : null}
        {pendingSubtaskCompletionCleanup ? (
          <GoalCompletionScheduleConfirm
            itemLabel={pendingSubtaskCompletionCleanup.title}
            pending={subtaskCompletionCleanupPending}
            onCancel={() => setPendingSubtaskCompletionCleanup(null)}
            onKeep={() => void completeSubtask(pendingSubtaskCompletionCleanup, false)}
            onDeleteFuture={() => void completeSubtask(pendingSubtaskCompletionCleanup, true)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function SubtaskRow({
  subtask,
  goalTitle,
  onToggle,
  onRename,
  onDelete,
}: {
  subtask: GoalSubtask;
  goalTitle: string;
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
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="6" cy="4" r="1.2" />
          <circle cx="10" cy="4" r="1.2" />
          <circle cx="6" cy="8" r="1.2" />
          <circle cx="10" cy="8" r="1.2" />
          <circle cx="6" cy="12" r="1.2" />
          <circle cx="10" cy="12" r="1.2" />
        </svg>
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
          <ScheduleGoalTaskButton goalTitle={goalTitle} sourceTitle={subtask.title} goalSubtaskId={subtask.id} size="sm" />
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

function GoalDetailTaskAddRow({
  goal,
  disabled,
  addRowRef,
  titleInputRef,
  onSaved,
}: {
  goal: Goal;
  disabled: boolean;
  addRowRef: RefObject<HTMLLIElement | null>;
  titleInputRef: RefObject<HTMLInputElement | null>;
  onSaved: () => void;
}) {
  const updateGoal = useUpdateGoal();
  const [draft, setDraft] = useState<DetailTaskDraft>(() => emptyDetailTaskDraft());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState("");
  const iconButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setDraft(emptyDetailTaskDraft());
    setError("");
    setPickerOpen(false);
  }, [goal.id]);

  const clearDraft = () => {
    setDraft(emptyDetailTaskDraft());
    setError("");
    setPickerOpen(false);
  };

  const saveTask = async () => {
    if (disabled) return;
    const title = draft.title.trim();
    if (!title) {
      setError("Task needs a name before it joins the quest.");
      return;
    }
    setError("");
    await updateGoal.mutateAsync({
      id: goal.id,
      input: { tasks: serializeTasks(goal.tasks, { ...draft, title }) },
    });
    clearDraft();
    onSaved();
  };

  return (
    <motion.li
      ref={addRowRef}
      className={`goal-detail-task goal-detail-task--add is-editing ${disabled ? "is-disabled" : ""} ${pickerOpen ? "is-icon-picker-open" : ""}`.trim()}
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="goal-detail-task__head">
        <span className="goal-detail-task__drag goal-detail-task__drag--placeholder" aria-hidden="true" />
        <span className="goal-detail-task__check goal-detail-task__check--add" aria-hidden="true">+</span>
        <div className="goal-detail-task__main goal-detail-task__main--editing">
          <div className={`goal-detail-task__icon-edit-wrap ${pickerOpen ? "is-icon-picker-open" : ""}`.trim()}>
            <button
              ref={iconButtonRef}
              type="button"
              className="goal-detail-task__icon-edit"
              onClick={() => setPickerOpen((current) => !current)}
              aria-label="Choose new task icon"
              disabled={disabled}
            >
              <GoalTaskIcon iconId={draft.iconId} />
            </button>
            {pickerOpen ? (
              <IconPickerPopover
                anchorRef={iconButtonRef}
                className="goal-detail-task__icon-popover"
                value={draft.iconId}
                onChange={(iconId) => {
                  setDraft((current) => ({ ...current, iconId }));
                  setPickerOpen(false);
                }}
              />
            ) : null}
          </div>
          <div className="goal-detail-task__title-edit">
            <input
              ref={titleInputRef}
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void saveTask();
                }
              }}
              maxLength={MAX_TITLE_LENGTH}
              placeholder={disabled ? `Task limit reached (${MAX_GOAL_TASKS})` : "New task"}
              aria-label="New goal task title"
              disabled={disabled || updateGoal.isPending}
            />
          </div>
        </div>
        <div className="goal-detail-task__deadline" aria-label="Deadline">
          <span>Deadline</span>
          <GoalDatePicker
            value={draft.deadline}
            onChange={(deadline) => setDraft((current) => ({ ...current, deadline }))}
            className="goal-detail-task__date-picker"
            ariaLabel="New task deadline"
          />
        </div>
        <div className="goal-detail-task__health" aria-hidden="true" />
        <div className="goal-detail-task__status" aria-hidden="true" />
        <div className="goal-detail-task__today" aria-hidden="true" />
        <div className="goal-detail-task__actions">
          <button
            type="button"
            className="add-icon-btn goal-detail-task__add-submit"
            onClick={() => void saveTask()}
            disabled={disabled || updateGoal.isPending}
            aria-label="Add goal task"
          >
            <span aria-hidden="true">+</span>
          </button>
          <button
            type="button"
            className="pomodoro-btn pomodoro-btn--ghost-text goal-detail-task__cancel"
            onClick={clearDraft}
            disabled={updateGoal.isPending}
          >
            Cancel
          </button>
        </div>
      </div>
      {error ? (
        <p className="goal-detail-task__error" aria-live="polite">{error}</p>
      ) : null}
    </motion.li>
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
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [orderedTaskIds, setOrderedTaskIds] = useState<string[]>([]);
  const [editorGoal, setEditorGoal] = useState<Goal | null | undefined>(undefined);
  const [pendingAddRowScroll, setPendingAddRowScroll] = useState(false);
  const [pendingTaskDelete, setPendingTaskDelete] = useState<GoalTask | null>(null);
  const [taskDeletePending, setTaskDeletePending] = useState(false);
  const addRowRef = useRef<HTMLLIElement | null>(null);
  const addTitleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (goal) {
      setOrderedTaskIds(goal.tasks.map((task) => task.id));
    }
  }, [goal?.id, goal?.tasks.map((task) => task.id).join("|")]);

  const scrollToAddRow = (focus = true) => {
    window.requestAnimationFrame(() => {
      addRowRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      if (focus) {
        window.setTimeout(() => addTitleInputRef.current?.focus(), 260);
      }
    });
  };

  useEffect(() => {
    if (!pendingAddRowScroll) return;
    const timeout = window.setTimeout(() => {
      scrollToAddRow(true);
      setPendingAddRowScroll(false);
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [pendingAddRowScroll, goal?.tasks.length]);

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

  const deleteTask = async (task: GoalTask, action?: GoalOccurrenceDeleteAction) => {
    try {
      setTaskDeletePending(true);
      await updateGoal.mutateAsync({
        id: goal.id,
        input: {
          tasks: serializeTasks(goal.tasks, undefined, task.id),
          occurrenceDeleteDecisions: action ? [{ kind: "goal_task", id: task.id, action }] : undefined,
        },
      });
      if (expandedTaskId === task.id) setExpandedTaskId(null);
      setPendingTaskDelete(null);
    } catch (error) {
      if (isGoalOccurrenceDeleteDecisionRequired(error)) {
        setPendingTaskDelete(task);
        return;
      }
      throw error;
    } finally {
      setTaskDeletePending(false);
    }
  };


  return (
    <>
      <motion.section
        className="goals-page goal-detail-page"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="goal-detail-nav">
          <Link className="goal-back-link" to="/goals">← All Goals</Link>
        </div>

        <motion.div
          className="goal-detail-workspace"
          layout
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            className="goal-detail-main-stack"
            layout
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
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
                onClick={() => scrollToAddRow(true)}
                disabled={goal.tasks.length >= MAX_GOAL_TASKS}
                title={goal.tasks.length >= MAX_GOAL_TASKS ? `Limit reached (${MAX_GOAL_TASKS})` : undefined}
              >
                <span aria-hidden="true">+</span> Add goal task
              </button>
            </header>

            <Reorder.Group
              as="ol"
              axis="y"
              values={orderedTasks}
              onReorder={(tasks) => setOrderedTaskIds(tasks.map((task) => task.id))}
              className="goal-detail-task-list"
            >
              <AnimatePresence initial={false}>
                {orderedTasks.map((task) => (
                  <GoalDetailTaskRow
                    key={task.id}
                    goal={goal}
                    task={task}
                    expanded={expandedTaskId === task.id}
                    onToggleExpand={() =>
                      setExpandedTaskId((prev) => (prev === task.id ? null : task.id))
                    }
                    onDelete={() => void deleteTask(task)}
                    onPersistOrder={persistTaskOrder}
                    onStartEdit={() => undefined}
                  />
                ))}
              </AnimatePresence>
              <GoalDetailTaskAddRow
                goal={goal}
                disabled={goal.tasks.length >= MAX_GOAL_TASKS}
                addRowRef={addRowRef}
                titleInputRef={addTitleInputRef}
                onSaved={() => setPendingAddRowScroll(true)}
              />
            </Reorder.Group>
            </section>

          </motion.div>
        </motion.div>
      </motion.section>

      <AnimatePresence>
        {pendingTaskDelete ? (
          <GoalOccurrenceDeleteConfirm
            itemLabel={pendingTaskDelete.title}
            pending={taskDeletePending}
            onCancel={() => setPendingTaskDelete(null)}
            onPick={(action) => void deleteTask(pendingTaskDelete, action)}
          />
        ) : null}
        {editorGoal !== undefined ? (
          <GoalEditorModal goal={editorGoal} onClose={() => setEditorGoal(undefined)} />
        ) : null}
      </AnimatePresence>
    </>
  );
}

export function GoalsPage() {
  const goalsQuery = useGoals();
  const deleteGoal = useDeleteGoal();
  const isMobile = useIsMobile();
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

  if (isMobile) {
    return (
      <>
        <GoalsMobileList
          goals={goals}
          isLoading={goalsQuery.isLoading}
          stats={stats}
          onAddGoal={() => setEditorGoal(null)}
          onDeleteGoal={(goal) => deleteGoal.mutate(goal.id)}
        />

        <AnimatePresence>
          {editorGoal !== undefined ? (
            <GoalEditorModal goal={editorGoal} onClose={() => setEditorGoal(undefined)} />
          ) : null}
        </AnimatePresence>
      </>
    );
  }

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
