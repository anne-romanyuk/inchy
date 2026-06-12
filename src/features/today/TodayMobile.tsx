import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, animate, motion, Reorder, useDragControls, useMotionValue, useTransform } from "motion/react";
import type { CategoryInfo, Occurrence } from "../../../shared/schemas";
import { compareTaskTimeForDisplay, formatTaskTimeDisplay } from "../../../shared/time";
import { categoryStyleForName } from "./categoryColor";
import {
  useDefaultTasks,
  useDeleteTask,
  useReorderTasks,
  useTaskCategories,
  useTasks,
  useUpdateTask,
} from "./useTasks";
import { useGoals } from "../goals/useGoals";
import { AddTaskModalMobile } from "./AddTaskModalMobile";

const SWIPE_TRIGGER = 112;
const SWIPE_LIMIT = 128;
const REORDER_HOLD_MS = 220;

type FilterValue = "" | "goals" | "other";

function formatTodayLabel(): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date());
}

function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatFocusDuration(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

function sortTasksByTime(tasks: Occurrence[]) {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((first, second) => compareTaskTimeForDisplay(first.task.time, second.task.time) || first.index - second.index)
    .map(({ task }) => task);
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 22;
  const circumference = 2 * Math.PI * r;
  const fraction = total > 0 ? done / total : 0;
  return (
    <span className="today-mobile__ring" role="img" aria-label={`${done} of ${total} tasks done`}>
      <svg viewBox="0 0 52 52" aria-hidden="true" focusable="false">
        <circle className="today-mobile__ring-track" cx="26" cy="26" r={r} />
        <circle
          className="today-mobile__ring-fill"
          cx="26"
          cy="26"
          r={r}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform="rotate(-90 26 26)"
        />
      </svg>
      <span className="today-mobile__ring-label">
        {done}/{total}
      </span>
    </span>
  );
}

function FocusStripeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 5.8v2.6M12 15.6v2.6M5.8 12h2.6M15.6 12h2.6" />
    </svg>
  );
}

function TrashStripeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 8.5h8" />
      <path d="M10 8.5V6.8c0-.6.5-1.1 1.1-1.1h1.8c.6 0 1.1.5 1.1 1.1v1.7" />
      <path d="m9 10.5.5 7.7c.1.8.7 1.3 1.5 1.3h2c.8 0 1.4-.5 1.5-1.3l.5-7.7" />
      <path d="m11.2 12.3.2 4.7M12.8 12.3l-.2 4.7" />
    </svg>
  );
}

function TaskSwipeRow({
  task,
  chip,
  categories,
  onToggleCompleted,
  onEdit,
  onDelete,
  onFocus,
}: {
  task: Occurrence;
  chip: string;
  categories: CategoryInfo[];
  onToggleCompleted: (completed: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onFocus: () => void;
}) {
  const controls = useDragControls();
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const x = useMotionValue(0);
  const focusWidth = useTransform(x, (value) => Math.min(SWIPE_LIMIT, Math.max(0, value)));
  const deleteWidth = useTransform(x, (value) => Math.min(SWIPE_LIMIT, Math.max(0, -value)));
  const focusVisibility = useTransform(x, (value) => (value > 1 ? "visible" : "hidden"));
  const deleteVisibility = useTransform(x, (value) => (value < -1 ? "visible" : "hidden"));
  const [didSwipe, setDidSwipe] = useState(false);
  const timeLabel = task.time ? formatTaskTimeDisplay(task.time) : "";
  const focusLabel = task.focusSeconds > 0 ? `${formatFocusDuration(task.focusSeconds)} focus` : "";

  const clearHold = () => {
    if (!holdTimer.current) return;
    clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const startReorderHold = (event: ReactPointerEvent) => {
    clearHold();
    const pointerEvent = event.nativeEvent;
    holdTimer.current = setTimeout(() => {
      controls.start(pointerEvent);
      holdTimer.current = null;
    }, REORDER_HOLD_MS);
  };

  return (
    <Reorder.Item
      as="li"
      value={task}
      dragControls={controls}
      dragListener={false}
      className={`tm-swipe-item ${task.completed ? "is-done" : ""}`.trim()}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
    >
      <motion.span
        className="tm-swipe-action tm-swipe-action--focus"
        style={{ width: focusWidth, visibility: focusVisibility }}
        aria-hidden="true"
      >
        <FocusStripeIcon />
        <span>FOCUS</span>
      </motion.span>
      <motion.span
        className="tm-swipe-action tm-swipe-action--delete"
        style={{ width: deleteWidth, visibility: deleteVisibility }}
        aria-hidden="true"
      >
        <TrashStripeIcon />
        <span>DELETE</span>
      </motion.span>

      <motion.div
        drag="x"
        style={{ x }}
        dragConstraints={{ left: -SWIPE_LIMIT, right: SWIPE_LIMIT }}
        dragElastic={0.08}
        className={`tm-task ${task.completed ? "is-done" : ""}`.trim()}
        onPointerDown={startReorderHold}
        onPointerUp={clearHold}
        onPointerCancel={clearHold}
        onPointerLeave={clearHold}
        onDragStart={() => {
          clearHold();
          setDidSwipe(true);
        }}
        onDragEnd={() => {
          clearHold();
          const swipe = x.get();
          animate(x, 0, { type: "spring", stiffness: 520, damping: 38 });
          if (swipe <= -SWIPE_TRIGGER) onDelete();
          else if (swipe >= SWIPE_TRIGGER) onFocus();
          window.setTimeout(() => setDidSwipe(false), 0);
        }}
        onClick={() => {
          if (didSwipe) return;
          onEdit();
        }}
      >
        <div className="checkbox-wrapper task-checkbox" onClick={(event) => event.stopPropagation()}>
          <input
            id={`tm-cb-${task.id}`}
            type="checkbox"
            checked={task.completed}
            aria-label={`Mark ${task.title} complete`}
            onChange={(event) => onToggleCompleted(event.target.checked)}
          />
          <label htmlFor={`tm-cb-${task.id}`}>
            <span className="tick_mark" aria-hidden="true" />
          </label>
        </div>

        <div className="tm-task__body">
          <span className="tm-task__title-row">
            <span className="tm-task__title">{task.title}</span>
            {focusLabel ? <span className="tm-task__inline-meta tm-task__focus-time">{focusLabel}</span> : null}
          </span>
          {chip || task.duration || timeLabel ? (
            <span className="tm-task__detail-row">
              <span className="tm-task__category-slot">
                {chip ? (
                  <span
                    className="task-category tm-task__chip"
                    style={categoryStyleForName(chip, categories)}
                    title={chip}
                  >
                    {chip}
                  </span>
                ) : null}
                {task.duration ? <span className="tm-task__inline-meta tm-task__duration">{task.duration}</span> : null}
              </span>
              {timeLabel ? <span className="tm-task__time">{timeLabel}</span> : null}
            </span>
          ) : null}
        </div>
      </motion.div>
    </Reorder.Item>
  );
}

function TaskSectionList({
  title,
  tasks,
  emptyText,
  goalTitleById,
  categories,
  onReorder,
  onToggleCompleted,
  onEdit,
  onDelete,
  onFocus,
}: {
  title: string;
  tasks: Occurrence[];
  emptyText?: string;
  goalTitleById: Map<string, string>;
  categories: CategoryInfo[];
  onReorder: (previous: Occurrence[], next: Occurrence[]) => void;
  onToggleCompleted: (task: Occurrence, completed: boolean) => void;
  onEdit: (task: Occurrence) => void;
  onDelete: (task: Occurrence) => void;
  onFocus: (task: Occurrence) => void;
}) {
  if (!tasks.length) {
    return emptyText ? <div className="today-mobile__empty">{emptyText}</div> : null;
  }

  return (
    <section className="today-mobile__section" aria-label={title}>
      <div className="today-mobile__section-header">
        <h2>{title}</h2>
      </div>
      <Reorder.Group
        as="ul"
        axis="y"
        className="today-mobile__list"
        values={tasks}
        onReorder={(next) => onReorder(tasks, next)}
        layoutScroll
      >
        <AnimatePresence initial={false}>
          {tasks.map((task) => {
            const isStandalone = task.sourceKind === "standalone";
            const chip = isStandalone
              ? task.category
              : task.goalId
                ? goalTitleById.get(task.goalId) ?? ""
                : "";
            return (
              <TaskSwipeRow
                key={task.id}
                task={task}
                chip={chip}
                categories={categories}
                onToggleCompleted={(completed) => onToggleCompleted(task, completed)}
                onEdit={() => onEdit(task)}
                onDelete={() => onDelete(task)}
                onFocus={() => onFocus(task)}
              />
            );
          })}
        </AnimatePresence>
      </Reorder.Group>
    </section>
  );
}

export function TodayMobile() {
  const navigate = useNavigate();
  const tasksQuery = useTasks();
  const categoriesQuery = useTaskCategories();
  const defaultTasksQuery = useDefaultTasks();
  const goalsQuery = useGoals();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const reorderTasks = useReorderTasks();

  const tasks = tasksQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const goals = goalsQuery.data ?? [];

  const [addOpen, setAddOpen] = useState(false);
  const [filter, setFilter] = useState<FilterValue>("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const goalTitleById = useMemo(() => {
    const map = new Map<string, string>();
    goals.forEach((g) => map.set(g.id, g.title));
    return map;
  }, [goals]);

  const completedCount = useMemo(() => tasks.filter((t) => t.completed).length, [tasks]);
  const totalCount = tasks.length;
  const openCount = totalCount - completedCount;

  const filterOptions = useMemo(() => {
    let hasGoal = false;
    let hasOther = false;
    for (const task of tasks) {
      if (task.sourceKind === "standalone") hasOther = true;
      else hasGoal = true;
      if (hasGoal && hasOther) break;
    }
    const opts: Array<{ value: FilterValue; label: string }> = [{ value: "", label: "All" }];
    if (hasGoal) opts.push({ value: "goals", label: "Goals" });
    if (hasOther) opts.push({ value: "other", label: "Other" });
    return opts;
  }, [tasks]);

  useEffect(() => {
    if (filter && !filterOptions.some((o) => o.value === filter)) setFilter("");
  }, [filter, filterOptions]);

  const visibleTasks = useMemo(() => {
    if (filter === "goals") return tasks.filter((t) => t.sourceKind !== "standalone");
    if (filter === "other") return tasks.filter((t) => t.sourceKind === "standalone");
    return tasks;
  }, [tasks, filter]);

  const openTasks = useMemo(() => sortTasksByTime(visibleTasks.filter((task) => !task.completed)), [visibleTasks]);
  const doneTasks = useMemo(() => sortTasksByTime(visibleTasks.filter((task) => task.completed)), [visibleTasks]);
  const editingTask = useMemo(
    () => tasks.find((task) => task.id === editingId && task.sourceKind === "standalone") ?? null,
    [editingId, tasks],
  );

  const attention = useMemo(() => {
    const today = isoDate(0);
    const tomorrow = isoDate(1);
    let overdue = 0;
    let dueToday = 0;
    let dueSoon = 0;
    for (const goal of goals) {
      for (const task of goal.tasks) {
        const hasSubs = task.subtasks && task.subtasks.length > 0;
        const complete = hasSubs ? task.subtasks.every((s) => s.completed) : task.completed;
        if (complete || !task.deadline) continue;
        const openSubtasks = hasSubs ? task.subtasks.filter((s) => !s.completed).length : 1;
        if (task.deadline < today) overdue += openSubtasks;
        else if (task.deadline === today) dueToday += openSubtasks;
        else if (task.deadline === tomorrow) dueSoon += openSubtasks;
      }
    }
    return { overdue, dueToday, dueSoon, total: overdue + dueToday + dueSoon };
  }, [goals]);

  const attentionItems = useMemo(() => {
    const items: Array<{ key: string; className: string; count: number; label: string }> = [];
    if (attention.overdue > 0) {
      items.push({
        key: "overdue",
        className: "today-mobile__attention-count--overdue",
        count: attention.overdue,
        label: "overdue",
      });
    }
    if (attention.dueToday > 0) {
      items.push({
        key: "today",
        className: "today-mobile__attention-count--today",
        count: attention.dueToday,
        label: "due today",
      });
    }
    if (attention.dueSoon > 0) {
      items.push({
        key: "soon",
        className: "today-mobile__attention-count--soon",
        count: attention.dueSoon,
        label: "due soon",
      });
    }
    return items;
  }, [attention]);

  const commitReorder = (previousSection: Occurrence[], nextSection: Occurrence[]) => {
    const visibleIds = new Set(previousSection.map((task) => task.id));
    const queue = [...nextSection];
    const merged = tasks.map((task) => {
      if (!visibleIds.has(task.id)) return task;
      return queue.shift() ?? task;
    });
    reorderTasks.mutate(merged.map((task) => task.id));
  };

  const toggleCompleted = (task: Occurrence, completed: boolean) => {
    updateTask.mutate({ id: task.id, updates: { completed, completionScope: "today" } });
  };

  const removeTask = (task: Occurrence) => {
    if (editingId === task.id) setEditingId(null);
    deleteTask.mutate(task.id);
  };

  const focusTask = (task: Occurrence) => {
    navigate(`/focus?taskId=${encodeURIComponent(task.id)}`);
  };

  const editTask = (task: Occurrence) => {
    if (task.sourceKind !== "standalone") return;
    setEditingId(task.id);
  };

  return (
    <div className="today-mobile">
      <header className="today-mobile__header">
        <div>
          <h1 className="today-mobile__date">{formatTodayLabel()}</h1>
          <p className="today-mobile__counter">
            {openCount} open · {completedCount} done
            {attention.total > 0 ? ` · ${attention.total} alert${attention.total === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <div className="today-mobile__header-right">
          <ProgressRing done={completedCount} total={totalCount} />
        </div>
      </header>

      {attention.total > 0 ? (
        <button type="button" className="today-mobile__attention" onClick={() => navigate("/today/alerts")}>
          <svg className="today-mobile__attention-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 4.8 21 19.2H3L12 4.8Z" />
            <path d="M12 10v4.2" />
            <path d="M12 16.8h.01" />
          </svg>
          <span className="today-mobile__attention-text">
            {attentionItems.map((item, index) => (
              <span key={item.key}>
                {index > 0 ? <span> · </span> : null}
                <strong className={`today-mobile__attention-count ${item.className}`}>
                  {item.count} {item.label}
                </strong>
              </span>
            ))}
          </span>
          <span className="today-mobile__attention-chevron" aria-hidden="true">›</span>
        </button>
      ) : null}

      {filterOptions.length > 1 ? (
        <div className="today-mobile__filters" role="tablist" aria-label="Filter tasks">
          {filterOptions.map((opt) => (
            <button
              key={opt.value || "all"}
              type="button"
              role="tab"
              aria-selected={filter === opt.value}
              className={`today-mobile__filter ${filter === opt.value ? "is-active" : ""}`.trim()}
              onClick={() => setFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="today-mobile__list-wrap app-scroll">
        {visibleTasks.length ? (
          <>
            <TaskSectionList
              title="Today"
              tasks={openTasks}
              emptyText={tasksQuery.isLoading ? undefined : "No open tasks for today."}
              goalTitleById={goalTitleById}
              categories={categories}
              onReorder={commitReorder}
              onToggleCompleted={toggleCompleted}
              onEdit={editTask}
              onDelete={removeTask}
              onFocus={focusTask}
            />
            <TaskSectionList
              title="Done"
              tasks={doneTasks}
              goalTitleById={goalTitleById}
              categories={categories}
              onReorder={commitReorder}
              onToggleCompleted={toggleCompleted}
              onEdit={editTask}
              onDelete={removeTask}
              onFocus={focusTask}
            />
          </>
        ) : tasksQuery.isLoading ? null : (
          <div className="today-mobile__empty">No tasks for today.</div>
        )}
      </div>

      <button
        type="button"
        className="add-icon-btn today-mobile__fab"
        aria-label="Add task"
        onClick={() => setAddOpen(true)}
      >
        <span aria-hidden="true">+</span>
      </button>

      <AnimatePresence>
        {addOpen ? (
          <AddTaskModalMobile
            categories={categoriesQuery.data ?? []}
            defaultTasks={defaultTasksQuery.data ?? []}
            onClose={() => setAddOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {editingTask ? (
          <AddTaskModalMobile
            categories={categoriesQuery.data ?? []}
            defaultTasks={defaultTasksQuery.data ?? []}
            editingTask={editingTask}
            onClose={() => setEditingId(null)}
            onSaveEdit={(updates) =>
              updateTask.mutateAsync({
                id: editingTask.id,
                updates,
              })
            }
          />
        ) : null}
      </AnimatePresence>

    </div>
  );
}
