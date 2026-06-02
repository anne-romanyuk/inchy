import PomodoroPanel from "./Pomodoro";

export function FocusPage() {
  return (
    <>
      <header className="dashboard-header" aria-label="Focus">
        <h1 className="dashboard-title">Focus</h1>
      </header>
      <div className="dashboard-grid dashboard-grid--single">
        <PomodoroPanel />
      </div>
    </>
  );
}
