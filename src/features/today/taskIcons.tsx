// Shared task-row icons used by both the desktop Today list (TodayPage) and the
// mobile Today screen (TodayMobile), so the two layouts stay visually identical
// and there's a single source of truth for the focus "flower" and the
// edit/save/cancel/delete action glyphs.

export function FocusIcon({
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

export function ActionIcon({
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
