import PomodoroPanel from "./Pomodoro";

export function FocusPage() {
  return (
    <section className="focus-workspace" aria-label="Focus">
      <PomodoroPanel fullPage />
    </section>
  );
}
