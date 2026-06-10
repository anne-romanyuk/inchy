import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { CategoryInfo, Goal, Occurrence } from "../../../shared/schemas";
import { normalizeTaskDurationValue } from "../../../shared/duration";
import { compareTaskTimeForDisplay, formatTaskTimeDisplay, normalizeTaskTimeValue } from "../../../shared/time";
import { DeleteActionButton } from "../../shared/ui/DeleteActionButton";
import type { UpdateOccurrenceInput } from "../today/occurrencesApi";
import { GoalDatePicker } from "../goals/GoalDatePicker";
import { TaskCategoryPicker } from "../today/TaskCategoryPicker";
import { categoryStyleForName } from "../today/categoryColor";
import { ActionIcon } from "../today/taskIcons";
import { TimePickerDropdown } from "../today/AddTaskModal";
import { TaskDurationInput } from "../today/TaskDurationInput";

const DEFAULT_EMPTY_TITLE = "No tasks for this day";
const DEFAULT_EMPTY_TEXT = "Choose another date to browse planned or completed tasks.";
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatFocusDuration(seconds: number) {
  if (seconds <= 0) return "0m";
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

export type GoalTitleLookup = {
  byGoalId: Map<string, string>;
  byTaskId: Map<string, string>;
  bySubtaskId: Map<string, string>;
};

export function goalTitleLookup(goals: Goal[]): GoalTitleLookup {
  const byGoalId = new Map<string, string>();
  const byTaskId = new Map<string, string>();
  const bySubtaskId = new Map<string, string>();

  goals.forEach((goal) => {
    byGoalId.set(goal.id, goal.title);
    goal.tasks.forEach((task) => {
      byTaskId.set(task.id, goal.title);
      task.subtasks.forEach((subtask) => bySubtaskId.set(subtask.id, goal.title));
    });
  });

  return { byGoalId, byTaskId, bySubtaskId };
}

export function getOccurrenceCategory(occurrence: Occurrence, lookup: GoalTitleLookup) {
  const ownCategory = occurrence.category.trim();
  if (ownCategory) return ownCategory;
  if (occurrence.sourceKind === "standalone") return "Task";
  return (
    (occurrence.goalId ? lookup.byGoalId.get(occurrence.goalId) : null) ??
    (occurrence.goalTaskId ? lookup.byTaskId.get(occurrence.goalTaskId) : null) ??
    (occurrence.goalSubtaskId ? lookup.bySubtaskId.get(occurrence.goalSubtaskId) : null) ??
    "Goal"
  );
}

function formatHistoryDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMAT.format(date);
}

type TaskHistoryContentProps = {
  occurrences: Occurrence[];
  goals: Goal[];
  categories: CategoryInfo[];
  status: string;
  emptyTitle?: string;
  emptyText?: string;
  editable?: boolean;
  extraCategoryNames?: string[];
  onUpdateOccurrence?: (occurrence: Occurrence, updates: UpdateOccurrenceInput) => Promise<unknown> | unknown;
  onMoveOccurrence?: (occurrence: Occurrence, nextDate: string) => Promise<unknown> | unknown;
  onDeleteOccurrence?: (occurrence: Occurrence) => Promise<unknown> | unknown;
};

function HistoryTaskRow({
  occurrence,
  goalTitleById,
  categories,
  editable = false,
  isRowEditing = false,
  hasEditingRow = false,
  onEditStateChange,
  extraCategoryNames,
  onUpdateOccurrence,
  onMoveOccurrence,
  onDeleteOccurrence,
}: {
  occurrence: Occurrence;
  goalTitleById: GoalTitleLookup;
  categories: CategoryInfo[];
  editable?: boolean;
  isRowEditing?: boolean;
  hasEditingRow?: boolean;
  onEditStateChange?: (occurrenceId: string, editing: boolean) => void;
  extraCategoryNames?: string[];
  onUpdateOccurrence?: TaskHistoryContentProps["onUpdateOccurrence"];
  onMoveOccurrence?: TaskHistoryContentProps["onMoveOccurrence"];
  onDeleteOccurrence?: TaskHistoryContentProps["onDeleteOccurrence"];
}) {
  const category = getOccurrenceCategory(occurrence, goalTitleById);
  const ownCategory = occurrence.category.trim();
  const canEditMetadata = editable && isRowEditing && Boolean(onUpdateOccurrence);
  const canEditTitle = canEditMetadata && occurrence.sourceKind === "standalone";
  const canToggle = editable && Boolean(onUpdateOccurrence);
  const canDelete = editable && Boolean(onDeleteOccurrence);
  const canStartEdit = editable && Boolean(onUpdateOccurrence);
  const [titleDraft, setTitleDraft] = useState(occurrence.title);
  const [dateDraft, setDateDraft] = useState(occurrence.occurrenceDate);
  const [timeDraft, setTimeDraft] = useState(normalizeTaskTimeValue(occurrence.time));
  const [durationDraft, setDurationDraft] = useState(normalizeTaskDurationValue(occurrence.duration));
  const [categoryDraft, setCategoryDraft] = useState(occurrence.category);

  useEffect(() => setTitleDraft(occurrence.title), [occurrence.title]);
  useEffect(() => setDateDraft(occurrence.occurrenceDate), [occurrence.occurrenceDate]);
  useEffect(() => setTimeDraft(normalizeTaskTimeValue(occurrence.time)), [occurrence.time]);
  useEffect(() => setDurationDraft(normalizeTaskDurationValue(occurrence.duration)), [occurrence.duration]);
  useEffect(() => setCategoryDraft(occurrence.category), [occurrence.category]);

  const updateOccurrence = async (updates: UpdateOccurrenceInput) => {
    await onUpdateOccurrence?.(occurrence, updates);
  };

  const commitDrafts = async () => {
    const nextTitle = titleDraft.trim();
    const nextTime = normalizeTaskTimeValue(timeDraft);
    const nextDuration = normalizeTaskDurationValue(durationDraft);
    const nextCategory = categoryDraft.trim();
    const updates: UpdateOccurrenceInput = {};

    if (canEditTitle && nextTitle && nextTitle !== occurrence.title) updates.title = nextTitle;
    if (nextTime !== occurrence.time) updates.time = nextTime;
    if (nextDuration !== occurrence.duration) updates.duration = nextDuration;
    if (nextCategory !== occurrence.category) updates.category = nextCategory;
    if (dateDraft && dateDraft !== occurrence.occurrenceDate) updates.occurrenceDate = dateDraft;

    if (Object.keys(updates).length) await updateOccurrence(updates);
    setTitleDraft(nextTitle || occurrence.title);
    setTimeDraft(nextTime);
    setDurationDraft(nextDuration);
    setCategoryDraft(nextCategory);
  };

  const resetDrafts = () => {
    setTitleDraft(occurrence.title);
    setDateDraft(occurrence.occurrenceDate);
    setTimeDraft(normalizeTaskTimeValue(occurrence.time));
    setDurationDraft(normalizeTaskDurationValue(occurrence.duration));
    setCategoryDraft(occurrence.category);
  };

  const startEditing = () => {
    resetDrafts();
    onEditStateChange?.(occurrence.id, true);
  };

  const saveEditing = async () => {
    await commitDrafts();
    onEditStateChange?.(occurrence.id, false);
  };

  const cancelEditing = () => {
    resetDrafts();
    onEditStateChange?.(occurrence.id, false);
  };

  return (
    <motion.li
      className={`history-task ${occurrence.completed ? "is-completed" : ""} ${editable ? "is-editable" : ""} ${isRowEditing ? "is-row-editing" : ""} ${hasEditingRow ? "has-editing-row" : ""}`.trim()}
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
    >
      <div className="checkbox-wrapper task-checkbox history-task__check">
        <input
          id={`history-task-checkbox-${occurrence.id}`}
          type="checkbox"
          checked={occurrence.completed}
          readOnly={!canToggle}
          disabled={!canToggle}
          aria-label={`${occurrence.title} completion status`}
          onChange={(event) => {
            if (canToggle) void updateOccurrence({ completed: event.currentTarget.checked });
          }}
        />
        <label htmlFor={`history-task-checkbox-${occurrence.id}`}>
          <span className="tick_mark" aria-hidden="true" />
        </label>
      </div>

      {canEditTitle ? (
        <input
          className="history-task__field history-task__title-input"
          value={titleDraft}
          aria-label="Task title"
          onChange={(event) => setTitleDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void saveEditing();
            }
            if (event.key === "Escape") {
              cancelEditing();
            }
          }}
        />
      ) : (
        <span className="history-task__title" title={occurrence.title}>
          {occurrence.title}
        </span>
      )}

      {hasEditingRow ? canEditMetadata ? (
        <GoalDatePicker
          className="history-task__date-picker"
          value={dateDraft}
          onChange={(nextDate) => {
            if (nextDate) setDateDraft(nextDate);
          }}
          ariaLabel={`Change date for ${occurrence.title}`}
          allowClear={false}
          formatDisplayValue={formatHistoryDate}
        />
      ) : (
        <span className="history-task__date-spacer" aria-hidden="true" />
      ) : null}

      {canEditMetadata ? (
        <TimePickerDropdown value={timeDraft} onChange={setTimeDraft} />
      ) : (
        <span className="history-task__time">{formatTaskTimeDisplay(occurrence.time)}</span>
      )}

      {canEditMetadata ? (
        <TaskDurationInput
          className="history-task__duration-input"
          value={durationDraft}
          onChange={setDurationDraft}
        />
      ) : (
        <span className="history-task__duration">{occurrence.duration}</span>
      )}

      {canEditMetadata ? (
        <TaskCategoryPicker
          mode="select"
          className="history-task__category-picker"
          value={categoryDraft}
          onChange={setCategoryDraft}
          extraCategoryNames={extraCategoryNames}
          allowCreate
          emptyLabel="No category"
          placeholder="Category"
          ariaLabel={`Change category for ${occurrence.title}`}
        />
      ) : (
        ownCategory ? (
          <span
            className="task-category history-task__category"
            style={categoryStyleForName(ownCategory || category, categories)}
            title={ownCategory}
          >
            {ownCategory}
          </span>
        ) : (
          <span className="history-task__category-spacer" aria-hidden="true" />
        )
      )}

      {occurrence.focusSeconds > 0 ? (
        <span className="task-title__chip history-task__focus">
          {formatFocusDuration(occurrence.focusSeconds)} focus
        </span>
      ) : (
        <span className="history-task__focus" aria-hidden="true" />
      )}

      {editable ? (
        <span className="history-task__actions">
          {canStartEdit && isRowEditing ? (
            <>
              <ActionIcon
                type="cancel"
                label={`Cancel editing ${occurrence.title}`}
                className="history-task__cancel"
                onClick={cancelEditing}
              />
              <ActionIcon
                type="save"
                label={`Save ${occurrence.title}`}
                className="history-task__save"
                onClick={() => void saveEditing()}
              />
            </>
          ) : canStartEdit ? (
            <ActionIcon
              type="edit"
              label={`Edit ${occurrence.title}`}
              className="history-task__edit"
              onClick={startEditing}
            />
          ) : null}
          {canDelete ? (
            <DeleteActionButton
              className="history-task__delete"
              aria-label={`Delete ${occurrence.title}`}
              onClick={() => void onDeleteOccurrence?.(occurrence)}
            >
              <span className="history-task__delete-label">Delete</span>
            </DeleteActionButton>
          ) : (
            <span className="history-task__delete-spacer" aria-hidden="true" />
          )}
        </span>
      ) : null}
    </motion.li>
  );
}

export function TaskHistoryContent({
  occurrences,
  goals,
  categories,
  status,
  emptyTitle = DEFAULT_EMPTY_TITLE,
  emptyText = DEFAULT_EMPTY_TEXT,
  editable = false,
  extraCategoryNames,
  onUpdateOccurrence,
  onMoveOccurrence,
  onDeleteOccurrence,
}: TaskHistoryContentProps) {
  const goalTitleById = useMemo(() => goalTitleLookup(goals), [goals]);
  const [editingIds, setEditingIds] = useState<Set<string>>(() => new Set());
  const hasEditingRow = editingIds.size > 0;
  const sortedOccurrences = useMemo(
    () =>
      occurrences
        .map((occurrence, index) => ({ occurrence, index }))
        .sort((first, second) =>
          compareTaskTimeForDisplay(first.occurrence.time, second.occurrence.time) || first.index - second.index,
        )
        .map(({ occurrence }) => occurrence),
    [occurrences],
  );

  useEffect(() => {
    setEditingIds((current) => {
      const visibleIds = new Set(sortedOccurrences.map((occurrence) => occurrence.id));
      const next = new Set(Array.from(current).filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [sortedOccurrences]);

  const setRowEditing = (occurrenceId: string, editing: boolean) => {
    setEditingIds((current) => {
      const next = new Set(current);
      if (editing) next.add(occurrenceId);
      else next.delete(occurrenceId);
      return next;
    });
  };

  return (
    <>
      {status ? <p className="history-status" role="status">{status}</p> : null}

      <div className="history-list-shell app-scroll">
        {!status && sortedOccurrences.length === 0 ? (
          <div className="goals-empty history-empty">
            <strong>{emptyTitle}</strong>
            <span>{emptyText}</span>
          </div>
        ) : null}

        <AnimatePresence initial={false} mode="popLayout">
          {sortedOccurrences.length ? (
            <div className={`history-task-table ${editable ? "is-editable" : ""} ${hasEditingRow ? "has-editing-row" : ""}`.trim()}>
              <div className="history-task-table-head" aria-hidden="true">
                <span />
                <span>Task</span>
                {hasEditingRow ? <span>Date</span> : null}
                <span>Time</span>
                <span>Duration</span>
                <span>Category</span>
                <span>Focus</span>
                {editable ? <span /> : null}
              </div>
              <motion.ol className="history-task-list" layout>
                {sortedOccurrences.map((occurrence) => (
                  <HistoryTaskRow
                    key={occurrence.id}
                    occurrence={occurrence}
                    goalTitleById={goalTitleById}
                    categories={categories}
                    editable={editable}
                    isRowEditing={editingIds.has(occurrence.id)}
                    hasEditingRow={hasEditingRow}
                    onEditStateChange={setRowEditing}
                    extraCategoryNames={extraCategoryNames}
                    onUpdateOccurrence={onUpdateOccurrence}
                    onMoveOccurrence={onMoveOccurrence}
                    onDeleteOccurrence={onDeleteOccurrence}
                  />
                ))}
              </motion.ol>
            </div>
          ) : null}
        </AnimatePresence>
      </div>
    </>
  );
}
