import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useTasks } from "../today/useTasks";
import PomodoroPanel from "./Pomodoro";

export function FocusPage() {
  const [params] = useSearchParams();
  const selectedTaskId = params.get("taskId");
  const tasksQuery = useTasks();
  const selectedTask = useMemo(
    () => tasksQuery.data?.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasksQuery.data],
  );

  return (
    <section className="focus-workspace" aria-label="Focus">
      <PomodoroPanel selectedTask={selectedTask} fullPage />
    </section>
  );
}
