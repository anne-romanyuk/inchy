import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { AddTaskModal, type AddTaskModalCreateInput } from "../today/AddTaskModal";
import { useCreateOccurrence, useGoalLinkedSchedule, useUpdateGoalLinkedSchedule, todayDateKey } from "../today/useOccurrences";
import { useTaskCategories } from "../today/useTasks";
import { queryKeys } from "../../shared/api/queryClient";
import { formatTaskTimeDisplay } from "../../../shared/time";
import type { GoalLinkedOneOffSchedule, GoalLinkedRecurringSchedule } from "../../../shared/schemas";

type Props = {
  goalTitle: string;
  sourceTitle: string;
  goalTaskId?: string;
  goalSubtaskId?: string;
  className?: string;
  size?: "sm" | "md";
};

export function CalendarScheduleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="5" y="6.2" width="14" height="13" rx="2.6" />
      <path d="M8.5 4.5v3.4" />
      <path d="M15.5 4.5v3.4" />
      <path d="M5 10h14" />
      <path d="M9 14h3.8" />
      <path d="M9 16.5h5.9" />
    </svg>
  );
}

export function ScheduleGoalTaskButton({
  goalTitle,
  sourceTitle,
  goalTaskId,
  goalSubtaskId,
  className = "",
  size = "sm",
}: Props) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const createOccurrence = useCreateOccurrence();
  const updateGoalLinkedSchedule = useUpdateGoalLinkedSchedule();
  const categoriesQuery = useTaskCategories();
  const sourceKind = goalTaskId ? "goal_task" : "goal_subtask";
  const sourceId = goalTaskId ?? goalSubtaskId ?? "";
  const scheduleQuery = useGoalLinkedSchedule({
    sourceKind,
    id: sourceId,
    enabled: open && Boolean(sourceId),
  });
  const recurring = scheduleQuery.data?.recurring ?? null;
  const oneOffOccurrences = scheduleQuery.data?.oneOffOccurrences ?? [];
  const scheduleQueryKey = sourceId ? queryKeys.goalLinkedSchedule(sourceKind, sourceId) : null;

  const invalidateSchedule = () => {
    if (scheduleQueryKey) void queryClient.invalidateQueries({ queryKey: scheduleQueryKey });
  };

  const scheduleTask = async (input: AddTaskModalCreateInput) => {
    const repeat = {
      repeatFrequency: input.repeatFrequency,
      repeatInterval: input.repeatInterval,
      repeatWeekdays: input.repeatWeekdays,
      repeatMonthDays: input.repeatMonthDays,
      repeatMonthOverflow: input.repeatMonthOverflow,
      repeatYearMonths: input.repeatYearMonths,
      repeatEndDate: input.repeatEndDate,
    };

    if (recurring) {
      await updateGoalLinkedSchedule.mutateAsync({
        id: recurring.id,
        updates: {
          occurrenceDate: input.occurrenceDate,
          duration: input.duration,
          time: input.time,
          ...repeat,
          recurrenceUpdateScope: "series",
        },
      });
      invalidateSchedule();
      return;
    }

    if (goalTaskId) {
      await createOccurrence.mutateAsync({
        sourceKind: "goal_task",
        occurrenceDate: input.occurrenceDate,
        goalTaskId,
        duration: input.duration,
        time: input.time,
        ...repeat,
      });
      invalidateSchedule();
      return;
    }

    if (goalSubtaskId) {
      await createOccurrence.mutateAsync({
        sourceKind: "goal_subtask",
        occurrenceDate: input.occurrenceDate,
        goalSubtaskId,
        duration: input.duration,
        time: input.time,
        ...repeat,
      });
      invalidateSchedule();
      return;
    }

    throw new Error("Missing goal source.");
  };

  return (
    <span className={`add-to-today schedule-goal-task ${className}`.trim()}>
      <button
        type="button"
        className={`add-to-today__btn add-to-today__btn--${size} schedule-goal-task__btn`.trim()}
        onClick={() => setOpen(true)}
        aria-label={`Schedule ${sourceTitle}`}
        title="Schedule"
      >
        <span className="schedule-goal-task__icon" aria-hidden="true">
          <CalendarScheduleIcon />
        </span>
        <span className="add-to-today__btn-label">Schedule</span>
      </button>
      <AnimatePresence>
        {open ? (
          <AddTaskModal
            variant="dialog"
            context="plan"
            modalTitle={recurring ? "Edit schedule" : "Schedule task"}
            submitLabel={recurring ? "Save schedule" : "Schedule task"}
            pendingLabel={recurring ? "Saving..." : "Scheduling..."}
            onClose={() => setOpen(false)}
            categories={categoriesQuery.data ?? []}
            defaultTasks={[]}
            initialTask={{
              title: sourceTitle,
              category: goalTitle,
              occurrenceDate: recurring?.startsOn ?? todayDateKey(),
              duration: recurring?.duration ?? "",
              time: recurring?.time ?? "",
              repeatFrequency: recurring?.repeatFrequency ?? null,
              repeatInterval: recurring?.repeatInterval ?? 1,
              repeatWeekdays: recurring?.repeatWeekdays ?? [],
              repeatMonthDays: recurring?.repeatMonthDays ?? [],
              repeatMonthOverflow: recurring?.repeatMonthOverflow ?? "skip",
              repeatYearMonths: recurring?.repeatYearMonths ?? [],
              repeatEndDate: recurring?.repeatEndDate ?? null,
            }}
            lockedFields={{ title: true, category: true }}
            scheduleNotice={
              <ScheduleStateSummary
                loading={scheduleQuery.isLoading}
                recurring={recurring}
                oneOffOccurrences={oneOffOccurrences}
              />
            }
            confirmDisableRepeatOnCreate={Boolean(recurring)}
            disableRepeatConfirmMessage="Unchecked occurrences from today forward will be removed. Completed occurrences will stay in the calendar."
            onCreateTask={scheduleTask}
          />
        ) : null}
      </AnimatePresence>
    </span>
  );
}

function formatScheduleDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function formatScheduleFrequency(recurring: GoalLinkedRecurringSchedule) {
  if (!recurring) return "";
  const unit = recurring.repeatFrequency === "daily"
    ? "days"
    : recurring.repeatFrequency === "weekly"
      ? "weeks"
      : recurring.repeatFrequency === "monthly"
        ? "months"
        : "years";
  const base = recurring.repeatInterval > 1 ? `Every ${recurring.repeatInterval} ${unit}` : recurring.repeatFrequency;
  const time = recurring.time ? ` at ${formatTaskTimeDisplay(recurring.time)}` : "";
  return `${base}${time}`;
}

function ScheduleStateSummary({
  loading,
  recurring,
  oneOffOccurrences,
}: {
  loading: boolean;
  recurring: GoalLinkedRecurringSchedule | null;
  oneOffOccurrences: GoalLinkedOneOffSchedule[];
}) {
  if (loading) {
    return (
      <>
        <strong>Checking current schedule</strong>
        <span>Looking for future occurrences.</span>
      </>
    );
  }
  if (!recurring && oneOffOccurrences.length === 0) {
    return (
      <>
        <strong>No future schedule yet</strong>
        <span>Pick a date or turn on repeat to create one.</span>
      </>
    );
  }
  return (
    <>
      {recurring ? (
        <>
          <strong>Already scheduled</strong>
          <span>
            {formatScheduleFrequency(recurring)}
            {recurring.repeatEndDate ? ` until ${formatScheduleDate(recurring.repeatEndDate)}` : ""}
          </span>
          {recurring.nextDates.length ? (
            <small>Next: {recurring.nextDates.map(formatScheduleDate).join(", ")}</small>
          ) : null}
        </>
      ) : null}
      {oneOffOccurrences.length ? (
        <>
          <strong>One-off dates kept</strong>
          <small>
            {oneOffOccurrences
              .slice(0, 5)
              .map((item) => `${formatScheduleDate(item.occurrenceDate)}${item.time ? ` ${formatTaskTimeDisplay(item.time)}` : ""}`)
              .join(", ")}
          </small>
        </>
      ) : null}
    </>
  );
}
