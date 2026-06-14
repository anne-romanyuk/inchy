import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, Reorder, useDragControls } from "motion/react";
import type { CategoryInfo, Occurrence, RecurrenceDeleteScope } from "../../../shared/schemas";
import { compareTaskTimeForDisplay, formatTaskTimeDisplay } from "../../../shared/time";
// After the storage unification, the Today widget renders task_occurrences.
// We alias them as `Task` locally so the existing renderer code paths
// (variables called `task`, `Task[]`) stay readable without a mass rename.
type Task = Occurrence;
import { useOverflowFade } from "../../shared/hooks/useOverflowFade";
import { useAppPreferences } from "../../shared/hooks/useAppPreferences";
import { categoryStyleForName, normalizeCategoryInfos } from "./categoryColor";
import {
  useDefaultTasks,
  useDeleteTask,
  useReorderTasks,
  useTaskCategories,
  useTasks,
  useUpdateTask,
} from "./useTasks";
import { AddTaskModal } from "./AddTaskModal";
import { NeedsAttentionWidget } from "./NeedsAttentionWidget";
import { ActionIcon, FocusIcon } from "./taskIcons";
import PomodoroPanel from "../focus/Pomodoro";
import { GoalJourney } from "../goals/GoalsPage";
import { useGoals } from "../goals/useGoals";
import { todayDateKey } from "./useOccurrences";

function formatFocusDuration(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
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

function TaskListItem({
  task,
  categories,
  goalLabel,
  scrollRef,
  isFocusActive,
  isFocusRunning,
  onToggleCompleted,
  onToggleFocus,
  onStartEdit,
}: {
  task: Task;
  categories: CategoryInfo[];
  /** Pre-resolved goal title for goal-linked occurrences. Empty for standalone. */
  goalLabel: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  isFocusActive: boolean;
  isFocusRunning: boolean;
  onToggleCompleted: (completed: boolean) => void;
  onToggleFocus: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onStartEdit: () => void;
}) {
  const controls = useDragControls();
  const autoScrollDir = useRef(0);
  const autoScrollFrame = useRef<number | null>(null);
  const normalizedCategories = useMemo(() => normalizeCategoryInfos(categories), [categories]);

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
      className={`task-item ${task.completed ? "is-completed" : ""} ${isFocusActive ? "is-focus-active" : ""}`.trim()}
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
          controls.start(event);
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
      <>
        <span className="task-title">
          <span className="task-title__text">{task.title}</span>
          {task.duration ? <span className="task-title__chip">{task.duration}</span> : null}
          {task.focusSeconds > 0 ? (
            <span className="task-title__chip">{formatFocusDuration(task.focusSeconds)} focus</span>
          ) : null}
        </span>
        <span className={`task-time ${task.time ? "" : "task-time--empty"}`.trim()} title={task.time ? formatTaskTimeDisplay(task.time) : ""}>
          {task.time ? formatTaskTimeDisplay(task.time) : ""}
        </span>
        {/* Category column: for standalone we show the user-typed
            category (with its saved palette color); for goal-linked we show the goal
            name, which may visually clip if long — that's
            acceptable per design. */}
        {task.sourceKind === "standalone" ? (
          <span
            className="task-category"
            style={categoryStyleForName(task.category, normalizedCategories)}
            title={task.category || ""}
          >
            {task.category || ""}
          </span>
        ) : (
          <span
            className="task-category task-category--goal"
            style={categoryStyleForName(goalLabel, normalizedCategories)}
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
        <ActionIcon type="edit" label={`Edit ${task.title}`} onClick={onStartEdit} />
      </>
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

  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
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
  const completionTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const tasksScrollRef = useRef<HTMLDivElement>(null);
  const today = todayDateKey();
  const [appPreferences, setAppPreferences] = useAppPreferences();
  const showGoalsWidget = appPreferences.showGoalsWidget;
  const savedTodayGoalId = appPreferences.todaySelectedGoalId;

  const taskCategories = useMemo(() => normalizeCategoryInfos(savedCategories), [savedCategories]);

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
    return filteredTasks
      .map((task, index) => ({ task, index }))
      .sort((first, second) => compareTaskTimeForDisplay(first.task.time, second.task.time) || first.index - second.index)
      .map(({ task }) => task);
  }, [filteredTasks]);

  const commitReorder = (nextVisible: Task[]) => {
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
    scheduleCompletionReorder(task.id, completed);
    updateTask.mutate({
      id: task.id,
      updates: { completed, completionScope: "today" },
    });
  };

  const startEditing = (task: Task) => {
    setAddTaskOpen(false);
    setEditingTaskId(task.id);
  };

  const handleDelete = (taskId: string, recurrenceDeleteScope?: RecurrenceDeleteScope) => {
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
      setEditingTaskId(null);
    }
    deleteTask.mutate({ id: taskId, recurrenceDeleteScope });
  };

  const editingTask = useMemo(
    () => tasks.find((task) => task.id === editingTaskId) ?? null,
    [editingTaskId, tasks],
  );
  const editingTaskGoalTitle = useMemo(
    () => (editingTask?.sourceKind !== "standalone" && editingTask?.goalId ? goalTitleById.get(editingTask.goalId) ?? "" : ""),
    [editingTask, goalTitleById],
  );
  const editingTaskIsGoalLinked = Boolean(editingTask && editingTask.sourceKind !== "standalone");

  const editingTaskData = useMemo(
    () =>
      editingTask
        ? {
            title: editingTask.title,
            category: editingTaskIsGoalLinked ? editingTaskGoalTitle : editingTask.category,
            duration: editingTask.duration,
            time: editingTask.time,
            recurringTaskId: editingTask.recurringTaskId,
            repeatFrequency: editingTask.repeatFrequency,
            repeatInterval: editingTask.repeatInterval,
            repeatWeekdays: editingTask.repeatWeekdays,
            repeatMonthDays: editingTask.repeatMonthDays,
            repeatMonthOverflow: editingTask.repeatMonthOverflow,
            repeatYearMonths: editingTask.repeatYearMonths,
            repeatEndDate: editingTask.repeatEndDate,
          }
        : undefined,
    [editingTask, editingTaskGoalTitle, editingTaskIsGoalLinked],
  );

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
    if (selectedGoalId && goals.some((goal) => goal.id === selectedGoalId)) {
      return;
    }
    const savedGoalExists = savedTodayGoalId && goals.some((goal) => goal.id === savedTodayGoalId);
    if (savedGoalExists) {
      setSelectedGoalId(savedTodayGoalId);
      return;
    }
    if (savedTodayGoalId) {
      setAppPreferences({ todaySelectedGoalId: null });
    }
    setSelectedGoalId(defaultGoalId);
  }, [defaultGoalId, goals, savedTodayGoalId, selectedGoalId, setAppPreferences]);

  const selectedGoal = useMemo(
    () => goals.find((goal) => goal.id === selectedGoalId) ?? goals.find((goal) => goal.id === defaultGoalId) ?? null,
    [defaultGoalId, goals, selectedGoalId],
  );
  const status = tasksQuery.error ? "Could not load tasks." : "";

  return (
    <div className="today-dashboard">
      <div className="dashboard-grid">
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
            <span className="tasks-table-header__cell tasks-table-header__cell--time">
              <span className="tasks-table-header__label">Time</span>
            </span>
            <span className="tasks-table-header__cell tasks-table-header__cell--category">
              <span className="tasks-table-header__label">Category</span>
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
                context="plan"
                variant="dialog"
                onClose={() => setAddTaskOpen(false)}
              />
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {editingTask ? (
              <AddTaskModal
                categories={taskCategories}
                defaultTasks={defaultTasks}
                context="plan"
                variant="dialog"
                editingTask={editingTaskData}
                editingDate={today}
                lockedFields={editingTaskIsGoalLinked ? { title: true, category: true } : undefined}
                onClose={() => setEditingTaskId(null)}
                onSaveEdit={async ({ date, title, category, ...fields }) => {
                  const toDate = date ?? today;
                  const editableFields =
                    editingTask.sourceKind === "standalone"
                      ? { ...fields, title, category }
                      : fields;
                  await updateTask.mutateAsync({
                    id: editingTask.id,
                    updates: {
                      ...editableFields,
                      ...(toDate !== today ? { occurrenceDate: toDate } : {}),
                    },
                  });
                }}
                onDelete={(scope) => {
                  handleDelete(editingTask.id, scope);
                  setEditingTaskId(null);
                }}
              />
            ) : null}
          </AnimatePresence>

        </motion.section>

        {showGoalsWidget ? (
          selectedGoal ? (
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
                onSelectGoal={(goalId) => {
                  setSelectedGoalId(goalId);
                  setAppPreferences({ todaySelectedGoalId: goalId });
                }}
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
          )
        ) : null}
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
