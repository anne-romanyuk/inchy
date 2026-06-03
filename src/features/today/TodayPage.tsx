import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, Reorder, useDragControls } from "motion/react";
import type { Occurrence } from "../../../shared/schemas";
// After the storage unification, the Today widget renders task_occurrences.
// We alias them as `Task` locally so the existing renderer code paths
// (variables called `task`, `Task[]`) stay readable without a mass rename.
type Task = Occurrence;
import { useOverflowFade } from "../../shared/hooks/useOverflowFade";
import { categoryTone } from "./categoryColor";
import {
  useDefaultTasks,
  useDeleteTask,
  useReorderTasks,
  useTaskCategories,
  useTasks,
  useUpdateTask,
} from "./useTasks";
import { CompletionScopeModal } from "./CompletionScopeModal";
import { ParentTaskCompletionModal } from "./ParentTaskCompletionModal";
import { AddTaskModal } from "./AddTaskModal";
import { NeedsAttentionWidget } from "./NeedsAttentionWidget";
import PomodoroPanel from "../focus/Pomodoro";
import { GoalJourney } from "../goals/GoalsPage";
import { useGoals, useUpdateGoal } from "../goals/useGoals";

function formatFocusDuration(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

function FocusIcon({
  onClick,
  isActive = false,
  isRunning = false,
  className = "",
  size = "sm",
  label = "Start pomodoro focus timer",
}: {
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  isActive?: boolean;
  isRunning?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`task-focus task-focus--${size} ${isActive ? "is-active" : ""} ${isRunning ? "is-running" : ""} ${className}`.trim()}
      aria-label={label}
      aria-pressed={isActive}
      title="Start pomodoro focus"
    >
      {isRunning ? <span className="task-focus__ping" aria-hidden="true" /> : null}
      <span className="task-focus__glow" aria-hidden="true" />

      <svg viewBox="0 0 24 24" fill="none" className="task-focus__icon" aria-hidden="true" focusable="false">
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 2"
          className="task-focus__breath-circle"
        />
        <circle
          cx="12"
          cy="12"
          r="7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="task-focus__timer-circle"
        />
        <path
          d="M12 6C12 6 14 9 14 11C14 12.5 13 13.5 12 14C11 13.5 10 12.5 10 11C10 9 12 6 12 6Z"
          fill="currentColor"
          className="task-focus__petal task-focus__petal--center"
        />
        <path
          d="M8 10C8 10 10 10.5 11 12C11.5 13 11.5 14.5 11 15.5C10 14.8 9 13.5 8.5 12C8 10.5 8 10 8 10Z"
          fill="currentColor"
          className="task-focus__petal task-focus__petal--side"
        />
        <path
          d="M16 10C16 10 14 10.5 13 12C12.5 13 12.5 14.5 13 15.5C14 14.8 15 13.5 15.5 12C16 10.5 16 10 16 10Z"
          fill="currentColor"
          className="task-focus__petal task-focus__petal--side"
        />
        <ellipse cx="12" cy="16" rx="3" ry="1" fill="currentColor" className="task-focus__base" />
      </svg>
    </button>
  );
}

function ActionIcon({
  type,
  label,
  onClick,
  className = "",
}: {
  type: "edit" | "save" | "cancel" | "delete";
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`task-action task-action--${type} ${className}`.trim()}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {type === "edit" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 17.5L4.5 20L7 19.5L17.8 8.7L15.8 6.7L5 17.5Z" />
          <path d="M14.8 7.7L16.9 5.6C17.5 5 18.4 5 19 5.6L19.4 6C20 6.6 20 7.5 19.4 8.1L17.3 10.2" />
        </svg>
      ) : null}
      {type === "save" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 12.4L9.2 16.5L19 7" />
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
    </button>
  );
}

type FilterOption = { value: string; label: string };

function CategoryToggle({
  options,
  value,
  onChange,
}: {
  /** value is the internal filter key (e.g. "" for All, "cat:foo", "goal:<id>");
   *  label is the user-visible string in the tab. */
  options: FilterOption[];
  value: string;
  onChange: (next: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const activeIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value),
  );

  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 1);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    updateArrows();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    el.addEventListener("scroll", updateArrows, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", updateArrows);
    };
  }, [options.length]);

  const scrollByStep = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.6), behavior: "smooth" });
  };

  return (
    <div className="category-toggle-wrap">
      <div className="category-toggle" role="tablist" aria-label="Filter by category">
        <div className="category-toggle__track">
          <div className="category-toggle__scroll" ref={scrollRef}>
            <div
              className="category-toggle__inner"
              style={{
                ["--category-toggle-count" as any]: options.length,
                ["--category-toggle-active" as any]: activeIndex,
              }}
            >
              <span className="category-toggle__thumb" aria-hidden="true" />
              {options.map((option, index) => (
                <button
                  key={option.value || "__all__"}
                  type="button"
                  role="tab"
                  aria-selected={index === activeIndex}
                  className={`category-toggle__option ${index === activeIndex ? "is-active" : ""}`.trim()}
                  onClick={() => onChange(option.value)}
                  title={option.label}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <button
        type="button"
        className={`category-toggle__arrow category-toggle__arrow--prev ${canPrev ? "is-visible" : ""}`.trim()}
        aria-label="Scroll categories left"
        tabIndex={canPrev ? 0 : -1}
        aria-hidden={!canPrev}
        onClick={() => scrollByStep(-1)}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path d="M7.5 2L3.5 6L7.5 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        className={`category-toggle__arrow category-toggle__arrow--next ${canNext ? "is-visible" : ""}`.trim()}
        aria-label="Scroll categories right"
        tabIndex={canNext ? 0 : -1}
        aria-hidden={!canNext}
        onClick={() => scrollByStep(1)}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path d="M4.5 2L8.5 6L4.5 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

function SortArrows({ direction }: { direction: "asc" | "desc" | null }) {
  return (
    <span className="tasks-sort-arrows" aria-hidden="true">
      <svg
        viewBox="0 0 10 12"
        className={`tasks-sort-arrows__svg ${direction ? `is-${direction}` : ""}`.trim()}
        focusable="false"
      >
        <path d="M5 1.5L8 5H2L5 1.5Z" className="tasks-sort-arrows__up" />
        <path d="M5 10.5L2 7H8L5 10.5Z" className="tasks-sort-arrows__down" />
      </svg>
    </span>
  );
}

function TaskListItem({
  task,
  categories,
  goalLabel,
  scrollRef,
  isFocusActive,
  isFocusRunning,
  isEditing,
  editDraft,
  onToggleCompleted,
  onToggleFocus,
  onStartEdit,
  onChangeDraft,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  task: Task;
  categories: string[];
  /** Pre-resolved goal title for goal-linked occurrences. Empty for standalone. */
  goalLabel: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  isFocusActive: boolean;
  isFocusRunning: boolean;
  isEditing: boolean;
  editDraft: { title: string; category: string };
  onToggleCompleted: (completed: boolean) => void;
  onToggleFocus: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onStartEdit: () => void;
  onChangeDraft: (draft: { title: string; category: string }) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
}) {
  const controls = useDragControls();
  const autoScrollDir = useRef(0);
  const autoScrollFrame = useRef<number | null>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const filteredCategoryOptions = useMemo(() => {
    const query = editDraft.category.trim().toLowerCase();
    const unique = Array.from(new Set(categories)).sort((a, b) => a.localeCompare(b));
    if (!query) return unique;
    return unique.filter((category) => category.toLowerCase().includes(query));
  }, [categories, editDraft.category]);
  const categoryDropdownOptions = useMemo(
    () => ["", ...filteredCategoryOptions],
    [filteredCategoryOptions],
  );

  useEffect(() => {
    if (!isEditing) {
      setCategoryOpen(false);
      return;
    }
    if (!categoryOpen) return;
    const onClickOut = (event: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(event.target as Node)) {
        setCategoryOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOut);
    return () => document.removeEventListener("mousedown", onClickOut);
  }, [categoryOpen, isEditing]);

  const stopAutoScroll = () => {
    if (autoScrollFrame.current !== null) {
      cancelAnimationFrame(autoScrollFrame.current);
      autoScrollFrame.current = null;
    }
    autoScrollDir.current = 0;
  };

  const runAutoScroll = () => {
    const el = scrollRef.current;
    if (!el || autoScrollDir.current === 0) {
      autoScrollFrame.current = null;
      return;
    }
    el.scrollTop += autoScrollDir.current;
    autoScrollFrame.current = requestAnimationFrame(runAutoScroll);
  };

  const handleDrag = (event: PointerEvent | MouseEvent | TouchEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    const point = "clientY" in event ? (event as PointerEvent).clientY : (event as TouchEvent).touches?.[0]?.clientY;
    if (typeof point !== "number") return;
    const rect = el.getBoundingClientRect();
    const edge = 56;
    const maxSpeed = 14;
    let dir = 0;
    if (point < rect.top + edge) {
      dir = -Math.ceil(((rect.top + edge - point) / edge) * maxSpeed);
    } else if (point > rect.bottom - edge) {
      dir = Math.ceil(((point - (rect.bottom - edge)) / edge) * maxSpeed);
    }
    autoScrollDir.current = dir;
    if (dir !== 0 && autoScrollFrame.current === null) {
      autoScrollFrame.current = requestAnimationFrame(runAutoScroll);
    } else if (dir === 0) {
      stopAutoScroll();
    }
  };

  useEffect(() => () => stopAutoScroll(), []);

  return (
    <Reorder.Item
      as="li"
      value={task}
      dragListener={false}
      dragControls={controls}
      className={`task-item ${task.completed ? "is-completed" : ""} ${isFocusActive ? "is-focus-active" : ""} ${isEditing ? "is-editing" : ""}`.trim()}
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      onDrag={(event) => handleDrag(event as PointerEvent)}
      onDragEnd={stopAutoScroll}
      whileDrag={{ scale: 1.02, zIndex: 2 }}
    >
      <span
        className="task-drag-handle"
        aria-label="Reorder task"
        onPointerDown={(event) => {
          if (!isEditing) controls.start(event);
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="6" cy="4" r="1.2" />
          <circle cx="10" cy="4" r="1.2" />
          <circle cx="6" cy="8" r="1.2" />
          <circle cx="10" cy="8" r="1.2" />
          <circle cx="6" cy="12" r="1.2" />
          <circle cx="10" cy="12" r="1.2" />
        </svg>
      </span>
      <div className="checkbox-wrapper task-checkbox">
        <input
          id={`task-checkbox-${task.id}`}
          type="checkbox"
          checked={task.completed}
          aria-label={`Mark ${task.title} complete`}
          onChange={(event) => onToggleCompleted(event.target.checked)}
        />
        <label htmlFor={`task-checkbox-${task.id}`}>
          <span className="tick_mark" aria-hidden="true"></span>
        </label>
      </div>
      {isEditing ? (
        <>
          <label className="task-edit-field task-edit-field--title">
            <span className="sr-only">Task description</span>
            <input
              value={editDraft.title}
              maxLength={120}
              onChange={(event) => onChangeDraft({ ...editDraft, title: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSaveEdit();
                if (event.key === "Escape") onCancelEdit();
              }}
              autoFocus
            />
          </label>
          <div className="task-edit-field task-edit-field--category task-modal__combobox" ref={categoryRef}>
            <span className="sr-only">Category</span>
            <input
              value={editDraft.category}
              maxLength={15}
              placeholder="Category"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={categoryOpen}
              onChange={(event) => onChangeDraft({ ...editDraft, category: event.target.value })}
              onFocus={() => setCategoryOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setCategoryOpen(false);
                if (event.key === "Enter") onSaveEdit();
              }}
            />
            <span className="task-modal__dropdown-caret task-modal__dropdown-caret--input" aria-hidden="true" />
            <div className="task-modal__dropdown-wrap" data-open={categoryOpen ? "true" : "false"}>
              <ul className="task-modal__combobox-list" role="listbox">
                {categoryDropdownOptions.map((category) => (
                  <li key={category || "__empty__"} className="task-modal__dropdown-item">
                      <button
                        type="button"
                        role="option"
                        aria-selected={editDraft.category === category}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          onChangeDraft({ ...editDraft, category });
                          setCategoryOpen(false);
                        }}
                      >
                        {category || "-"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
          </div>
          <ActionIcon type="cancel" label={`Cancel editing ${task.title}`} onClick={onCancelEdit} />
          <ActionIcon type="save" label={`Save ${task.title}`} onClick={onSaveEdit} />
          <ActionIcon type="delete" label={`Delete ${task.title}`} onClick={onDelete} />
        </>
      ) : (
        <>
          <span className="task-title">
            <span className="task-title__text">{task.title}</span>
            {task.duration ? <span className="task-title__chip">{task.duration}</span> : null}
            {task.focusSeconds > 0 ? (
              <span className="task-title__chip">{formatFocusDuration(task.focusSeconds)} focus</span>
            ) : null}
          </span>
          {/* Category column: for standalone we show the user-typed
              category (with its tone); for goal-linked we show the goal
              name (no tone), which may visually clip if long — that's
              acceptable per design. */}
          {task.sourceKind === "standalone" ? (
            <span
              className={`task-category${task.category ? ` task-category--${categoryTone(task.category)}` : ""}`}
              title={task.category || ""}
            >
              {task.category || ""}
            </span>
          ) : (
            <span
              className={`task-category task-category--goal${goalLabel ? ` task-category--${categoryTone(goalLabel)}` : ""}`}
              title={goalLabel}
            >
              {goalLabel}
            </span>
          )}
          <FocusIcon
            isActive={isFocusActive}
            isRunning={isFocusRunning}
            label={`Focus on ${task.title}`}
            onClick={onToggleFocus}
          />
          {task.sourceKind === "standalone" ? (
            <ActionIcon type="edit" label={`Edit ${task.title}`} onClick={onStartEdit} />
          ) : (
            // Goal-linked occurrences are not editable here — their title
            // comes from the underlying goal_task / goal_subtask. We render
            // an invisible spacer to keep the delete column aligned.
            <span className="task-action--ghost" aria-hidden="true" />
          )}
          <ActionIcon type="delete" label={`Delete ${task.title}`} onClick={onDelete} />
        </>
      )}
    </Reorder.Item>
  );
}

export function TodayPage() {
  const navigate = useNavigate();
  const tasksQuery = useTasks();
  const categoriesQuery = useTaskCategories();
  const defaultTasksQuery = useDefaultTasks();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const reorderTasks = useReorderTasks();
  const goalsQuery = useGoals();

  // After the storage unification, `useTasks()` is just `useOccurrences(today)`
  // — every row on Today (standalone + goal-linked) comes from the same
  // query. The local `tasks` alias keeps the existing renderer code paths
  // readable.
  const tasks = tasksQuery.data ?? [];
  const savedCategories = categoriesQuery.data ?? [];
  const defaultTasks = defaultTasksQuery.data ?? [];
  const goals = goalsQuery.data ?? [];

  // Goal title lookup — used to fill the category column with the goal name
  // for goal-linked occurrences (their own `category` is always empty).
  const goalTitleById = useMemo(() => {
    const map = new Map<string, string>();
    goals.forEach((g) => map.set(g.id, g.title));
    return map;
  }, [goals]);

  // When ticking a goal-linked occurrence done, we open a modal to ask
  // whether they meant "for today" or "for the whole goal task/subtask".
  const [scopeModalFor, setScopeModalFor] = useState<Occurrence | null>(null);

  // After a "whole" completion of a subtask occurrence, we may need to ask
  // the user "close the parent goal task too?". We record the parent task
  // here and let an effect react once the refreshed goals data arrives.
  const [parentCheck, setParentCheck] = useState<{ goalId: string; goalTaskId: string } | null>(null);
  const [parentPromptTask, setParentPromptTask] = useState<{ goalId: string; goalTaskId: string; title: string } | null>(null);
  const updateGoal = useUpdateGoal();

  // Watch refreshed goals data: if the recorded parent task now has ALL
  // subtasks completed and is itself not yet marked done, prompt the user.
  // We consume the trigger so the prompt only fires once per "whole" event.
  useEffect(() => {
    if (!parentCheck) return;
    const goal = goals.find((g) => g.id === parentCheck.goalId);
    if (!goal) return;
    const target = goal.tasks.find((t) => t.id === parentCheck.goalTaskId);
    if (!target) {
      setParentCheck(null);
      return;
    }
    const subs = target.subtasks ?? [];
    if (subs.length === 0) {
      setParentCheck(null);
      return;
    }
    const allDone = subs.every((s) => s.completed);
    if (allDone && !target.completed) {
      setParentPromptTask({
        goalId: goal.id,
        goalTaskId: target.id,
        title: target.title,
      });
    }
    setParentCheck(null);
  }, [goals, parentCheck]);

  const confirmCloseParentTask = async () => {
    if (!parentPromptTask) return;
    const goal = goals.find((g) => g.id === parentPromptTask.goalId);
    if (!goal) {
      setParentPromptTask(null);
      return;
    }
    // Echo the whole goal back with the target task flipped to completed.
    // replaceGoalTasks will also derive `completed` from subtasks anyway, so
    // this is belt-and-suspenders: it makes the intent explicit and works
    // even if a subtask gets un-checked between events.
    const tasksPayload = goal.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      deadline: t.deadline,
      iconId: t.iconId,
      note: t.note,
      completed: t.id === parentPromptTask.goalTaskId ? true : t.completed,
      subtasks: (t.subtasks ?? []).map((s) => ({
        id: s.id,
        title: s.title,
        completed: s.completed,
      })),
    }));
    await updateGoal.mutateAsync({ id: goal.id, input: { tasks: tasksPayload } });
    setParentPromptTask(null);
  };

  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  // Only "category" sort remains after the priority column was removed.
  const [sortKey, setSortKey] = useState<"category" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [flyer, setFlyer] = useState<{
    key: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  } | null>(null);
  const [recentlyCompleted, setRecentlyCompleted] = useState<string[]>([]);
  const [activeFocusTaskId, setActiveFocusTaskId] = useState<string | null>(null);
  const [runningFocusTaskId, setRunningFocusTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ title: string; category: string }>({
    title: "",
    category: "",
  });
  const completionTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const tasksScrollRef = useRef<HTMLDivElement>(null);

  const taskCategories = useMemo(() => savedCategories, [savedCategories]);

  // Three fixed filter buckets:
  //   "All"   — everything on today's list,
  //   "goals" — items pulled from a goal (goal_task / goal_subtask),
  //   "other" — standalone day tasks.
  // We only expose a bucket if there is at least one matching item, so
  // a user with only goal work never sees an "Other" tab and vice-versa.
  const filterOptions = useMemo<FilterOption[]>(() => {
    let hasGoal = false;
    let hasOther = false;
    for (const task of tasks) {
      if (task.sourceKind === "standalone") hasOther = true;
      else hasGoal = true;
      if (hasGoal && hasOther) break;
    }
    const opts: FilterOption[] = [{ value: "", label: "All" }];
    if (hasGoal) opts.push({ value: "goals", label: "Goals" });
    if (hasOther) opts.push({ value: "other", label: "Other" });
    return opts;
  }, [tasks]);

  // Reset the filter if the active bucket disappeared (e.g. user removed
  // the last standalone task while "Other" was selected).
  useEffect(() => {
    if (!categoryFilter) return;
    if (!filterOptions.some((opt) => opt.value === categoryFilter)) {
      setCategoryFilter("");
    }
  }, [categoryFilter, filterOptions]);

  const filteredTasks = useMemo(() => {
    if (categoryFilter === "goals") {
      return tasks.filter((t) => t.sourceKind !== "standalone");
    }
    if (categoryFilter === "other") {
      return tasks.filter((t) => t.sourceKind === "standalone");
    }
    return tasks;
  }, [tasks, categoryFilter]);

  const sortedTasks = useMemo(() => {
    if (!sortKey) return filteredTasks;
    const dirMul = sortDir === "asc" ? 1 : -1;
    // What we visually show in the "Category" column is what we sort by:
    // the user-typed category for standalone tasks, the goal title for
    // goal-linked occurrences. Items with neither sink to the bottom.
    const sortLabel = (t: Task) =>
      t.sourceKind === "standalone"
        ? t.category
        : (t.goalId ? goalTitleById.get(t.goalId) ?? "" : "");
    return [...filteredTasks].sort((a, b) => {
      const aLabel = sortLabel(a);
      const bLabel = sortLabel(b);
      const aHas = aLabel ? 1 : 0;
      const bHas = bLabel ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      return aLabel.localeCompare(bLabel) * dirMul;
    });
  }, [filteredTasks, sortKey, sortDir, goalTitleById]);

  const handleSort = (key: "category") => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    if (sortDir === "asc") {
      setSortDir("desc");
      return;
    }
    setSortKey(null);
    setSortDir("asc");
  };

  const commitReorder = (nextVisible: Task[]) => {
    if (sortKey) setSortKey(null);
    const visibleIds = new Set(filteredTasks.map((task) => task.id));
    const queue = [...nextVisible];
    const merged: Task[] = [];
    tasks.forEach((task) => {
      if (visibleIds.has(task.id)) {
        const next = queue.shift();
        if (next) merged.push(next);
      } else {
        merged.push(task);
      }
    });
    reorderTasks.mutate(merged.map((task) => task.id));
  };

  useOverflowFade(tasksScrollRef, [sortedTasks.length]);

  useEffect(() => {
    return () => {
      completionTimers.current.forEach((timer) => clearTimeout(timer));
      completionTimers.current.clear();
    };
  }, []);

  const scheduleCompletionReorder = (taskId: string, completed: boolean) => {
    const existing = completionTimers.current.get(taskId);
    if (existing) {
      clearTimeout(existing);
      completionTimers.current.delete(taskId);
    }
    if (completed) {
      setRecentlyCompleted((current) =>
        current.includes(taskId) ? current : [...current, taskId],
      );
      const timer = setTimeout(() => {
        setRecentlyCompleted((current) => current.filter((id) => id !== taskId));
        completionTimers.current.delete(taskId);
      }, 1000);
      completionTimers.current.set(taskId, timer);
    } else {
      setRecentlyCompleted((current) => current.filter((id) => id !== taskId));
    }
  };

  const toggleCompleted = (task: Task, completed: boolean) => {
    // Goal-linked occurrences open the scope modal on completion so the
    // user can pick "for today" vs "finish whole goal item". Un-ticking
    // (and standalone ticking) sails straight through.
    if (completed && task.sourceKind !== "standalone") {
      setScopeModalFor(task);
      return;
    }
    scheduleCompletionReorder(task.id, completed);
    updateTask.mutate({
      id: task.id,
      updates: { completed, completionScope: "today" },
    });
  };

  const startEditing = (task: Task) => {
    setEditingTaskId(task.id);
    setEditDraft({
      title: task.title,
      category: task.category,
    });
  };

  const cancelEditing = () => {
    setEditingTaskId(null);
    setEditDraft({ title: "", category: "" });
  };

  const saveEditing = (task: Task) => {
    const title = editDraft.title.trim();
    if (!title) return;
    updateTask.mutate({
      id: task.id,
      updates: {
        title,
        category: editDraft.category.trim(),
      },
    });
    cancelEditing();
  };

  const handleDelete = (taskId: string) => {
    const timer = completionTimers.current.get(taskId);
    if (timer) {
      clearTimeout(timer);
      completionTimers.current.delete(taskId);
    }
    setRecentlyCompleted((current) => current.filter((id) => id !== taskId));
    if (activeFocusTaskId === taskId) {
      setActiveFocusTaskId(null);
    }
    if (runningFocusTaskId === taskId) {
      setRunningFocusTaskId(null);
    }
    if (editingTaskId === taskId) {
      cancelEditing();
    }
    deleteTask.mutate(taskId);
  };

  const activeFocusTask = useMemo(
    () => tasks.find((task) => task.id === activeFocusTaskId) ?? null,
    [tasks, activeFocusTaskId],
  );
  const totalItemCount = tasks.length;
  const completedCount = useMemo(
    () => tasks.filter((task) => task.completed).length,
    [tasks],
  );
  const defaultGoalId = useMemo(
    () => goals.find((goal) => goal.tasks.some((task) => !task.completed))?.id ?? goals[0]?.id ?? null,
    [goals],
  );

  useEffect(() => {
    if (!goals.length) {
      setSelectedGoalId(null);
      return;
    }
    if (!selectedGoalId || !goals.some((goal) => goal.id === selectedGoalId)) {
      setSelectedGoalId(defaultGoalId);
    }
  }, [defaultGoalId, goals, selectedGoalId]);

  const selectedGoal = useMemo(
    () => goals.find((goal) => goal.id === selectedGoalId) ?? goals.find((goal) => goal.id === defaultGoalId) ?? null,
    [defaultGoalId, goals, selectedGoalId],
  );
  const status = tasksQuery.error ? "Could not load tasks." : "";

  return (
    <div className={`today-dashboard ${addTaskOpen ? "today-dashboard--modal-open" : ""}`.trim()}>
      <div className={`dashboard-grid ${addTaskOpen ? "dashboard-grid--modal-open" : ""}`.trim()}>
        {/* Left column: the Today tasks panel grows to fill the height, the
            goal widget sits below it at its natural (compact) size. */}
        <div className="today-col today-col--left">
        <motion.section className="tasks-panel tasks-panel--today" aria-label="Today's tasks">
          <header className="tasks-panel__header">
            <div>
              <h2 className="tasks-title">Today</h2>
            </div>
            <div className="tasks-panel__actions">
              <div className="tasks-count">
                {completedCount}/{totalItemCount} done
              </div>
              <button className="task-add" type="button" aria-label="Add task" onClick={() => setAddTaskOpen(true)}>
                <span aria-hidden="true">+</span>
                <span>Add task</span>
              </button>
            </div>
          </header>

          {/* Only render the toggle when there is something to filter beyond
              "All" — otherwise it's just a single empty tab. */}
          {filterOptions.length > 1 ? (
            <CategoryToggle
              options={filterOptions}
              value={categoryFilter}
              onChange={setCategoryFilter}
            />
          ) : null}

          {status ? (
            <p className="tasks-status" role="status">
              {status}
            </p>
          ) : null}


          <div className="tasks-table-header" role="row" aria-label="Tasks table header">
            <span className="tasks-table-header__cell tasks-table-header__cell--task">
              <span className="tasks-table-header__label">Task</span>
            </span>
            <span className="tasks-table-header__cell tasks-table-header__cell--category">
              <button
                type="button"
                className={`tasks-table-header__sort ${sortKey === "category" ? "is-active" : ""}`.trim()}
                onClick={() => handleSort("category")}
                aria-label={`Sort by category${sortKey === "category" ? ` (${sortDir})` : ""}`}
              >
                <span className="tasks-table-header__label">Category</span>
                <SortArrows direction={sortKey === "category" ? sortDir : null} />
              </button>
            </span>
          </div>

          <div className="tasks-scroll-wrap">
            <div className="tasks-scroll fade-scroll app-scroll" ref={tasksScrollRef}>
              <AnimatePresence initial={false}>
                {sortedTasks.length ? (
                  <Reorder.Group
                    as="ul"
                    axis="y"
                    className="tasks-list"
                    values={sortedTasks}
                    onReorder={commitReorder}
                    layoutScroll
                  >
                    {sortedTasks.map((task) => (
                      <TaskListItem
                        key={task.id}
                        task={task}
                        categories={taskCategories}
                        goalLabel={
                          task.sourceKind !== "standalone" && task.goalId
                            ? goalTitleById.get(task.goalId) ?? ""
                            : ""
                        }
                        scrollRef={tasksScrollRef}
                        isFocusActive={activeFocusTaskId === task.id}
                        isFocusRunning={runningFocusTaskId === task.id}
                        isEditing={editingTaskId === task.id}
                        editDraft={editingTaskId === task.id ? editDraft : {
                          title: task.title,
                          category: task.category,
                        }}
                        onToggleCompleted={(completed) => toggleCompleted(task, completed)}
                        onToggleFocus={(event) => {
                          const wasActive = activeFocusTaskId === task.id;
                          setActiveFocusTaskId((current) =>
                            current === task.id ? null : task.id,
                          );
                          if (!wasActive) {
                            const target = document.querySelector(
                              ".pomodoro-btn--primary",
                            ) as HTMLElement | null;
                            if (target) {
                              const s = event.currentTarget.getBoundingClientRect();
                              const t = target.getBoundingClientRect();
                              setFlyer({
                                key: Date.now(),
                                fromX: s.left + s.width / 2,
                                fromY: s.top + s.height / 2,
                                toX: t.left + t.width / 2,
                                toY: t.top + t.height / 2,
                              });
                            }
                          }
                        }}
                        onStartEdit={() => startEditing(task)}
                        onChangeDraft={setEditDraft}
                        onCancelEdit={cancelEditing}
                        onSaveEdit={() => saveEditing(task)}
                        onDelete={() => handleDelete(task.id)}
                      />
                    ))}
                  </Reorder.Group>
                ) : (
                  <motion.div
                    className="tasks-empty"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                  >
                    No tasks for today.
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <AnimatePresence>
            {addTaskOpen ? (
              <AddTaskModal
                categories={taskCategories}
                defaultTasks={defaultTasks}
                onClose={() => setAddTaskOpen(false)}
              />
            ) : null}
          </AnimatePresence>

          {/* In-panel overlays. Anchored to `.tasks-panel--today`
              (position: relative) so they sit on top of just the Today
              widget — same UX pattern as the pomodoro reset confirm. */}
          <AnimatePresence>
            {scopeModalFor ? (
              <CompletionScopeModal
                occurrence={scopeModalFor}
                onClose={() => setScopeModalFor(null)}
                onPick={(scope) => {
                  if (!scopeModalFor) return;
                  updateTask.mutate({
                    id: scopeModalFor.id,
                    updates: { completed: true, completionScope: scope },
                  });
                  if (
                    scope === "whole" &&
                    scopeModalFor.sourceKind === "goal_subtask" &&
                    scopeModalFor.goalId &&
                    scopeModalFor.goalTaskId
                  ) {
                    setParentCheck({
                      goalId: scopeModalFor.goalId,
                      goalTaskId: scopeModalFor.goalTaskId,
                    });
                  }
                  setScopeModalFor(null);
                }}
              />
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {parentPromptTask !== null ? (
              <ParentTaskCompletionModal
                open
                taskTitle={parentPromptTask.title}
                onClose={() => setParentPromptTask(null)}
                onConfirm={confirmCloseParentTask}
              />
            ) : null}
          </AnimatePresence>
        </motion.section>

        {selectedGoal ? (
          <motion.div
            className="today-goal-widget"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <GoalJourney
              goal={selectedGoal}
              compact
              selectableGoals={goals}
              selectedGoalId={selectedGoal.id}
              onSelectGoal={setSelectedGoalId}
            />
          </motion.div>
        ) : !goalsQuery.isLoading ? (
          <motion.div
            className="today-goal-widget today-goal-widget--empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="goal-journey goal-journey--empty">
              <div className="goal-journey__empty-content">
                <div className="goal-journey__empty-text">
                  <h2>No goals yet</h2>
                  <p>Set your first goal and Inchy will help you break it into milestones.</p>
                </div>
                <button
                  type="button"
                  className="task-add goal-journey__empty-cta"
                  onClick={() => navigate("/goals?new=1")}
                >
                  <span aria-hidden="true">+</span> Create your first goal
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          // Placeholder while goals load — keeps the left column reserved.
          <div />
        )}
        </div>

        {/* Right column: pomodoro grows to fill, "Needs attention" sits below
            it at its natural height, surfacing overdue / due-today / due-soon
            goal tasks. */}
        <div className="today-col today-col--right">
          <PomodoroPanel
            selectedTask={activeFocusTask}
            onLinkedTaskChange={setActiveFocusTaskId}
            onRunningTaskChange={setRunningFocusTaskId}
          />

          <NeedsAttentionWidget />
        </div>
      </div>
    </div>
  );
}
