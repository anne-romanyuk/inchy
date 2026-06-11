import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});
const DEFAULT_POPOVER_Z_INDEX = 1000;
const TASK_MODAL_POPOVER_Z_INDEX = 5010;

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

function parseIsoDate(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayIsoDate() {
  return toIsoDate(new Date());
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function getVisibleDays(month: Date) {
  const first = startOfMonth(month);
  const offset = (first.getDay() + 6) % 7;
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const trailingDays = 6 - ((last.getDay() + 6) % 7);
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  const visibleDays = offset + last.getDate() + trailingDays;
  return Array.from({ length: visibleDays }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 4.5V7M17 4.5V7M5.5 9.5H18.5" />
      <path d="M6.8 6H17.2C18.2 6 19 6.8 19 7.8V18.2C19 19.2 18.2 20 17.2 20H6.8C5.8 20 5 19.2 5 18.2V7.8C5 6.8 5.8 6 6.8 6Z" />
      <path d="M8.2 12.5H8.25M12 12.5H12.05M15.8 12.5H15.85M8.2 16H8.25M12 16H12.05M15.8 16H15.85" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" | "up" | "down" }) {
  const paths = {
    left: "M15 6L9 12L15 18",
    right: "M9 6L15 12L9 18",
    up: "M7 14L12 9L17 14",
    down: "M7 10L12 15L17 10",
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={paths[direction]} />
    </svg>
  );
}

export function GoalDatePicker({
  value,
  onChange,
  className = "",
  ariaLabel,
  allowClear = true,
  formatDisplayValue,
  emptyDisplayValue = "No due date",
  displayValueOverride,
  footerActions = [],
  footerActionsAfterToday = [],
  showTodayShortcut = true,
  minDate,
  leadingControl,
  trailingControl,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel: string;
  allowClear?: boolean;
  formatDisplayValue?: (value: string) => string;
  emptyDisplayValue?: string;
  displayValueOverride?: string;
  footerActions?: Array<{ label: string; onClick: () => void }>;
  footerActionsAfterToday?: Array<{ label: string; onClick: () => void }>;
  showTodayShortcut?: boolean;
  minDate?: string;
  leadingControl?: ReactNode;
  trailingControl?: ReactNode;
}) {
  const selectedDate = parseIsoDate(value);
  const minIsoDate = minDate || "";
  const [isOpen, setIsOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selectedDate ?? new Date()));
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  // The calendar is rendered in a portal on <body> with fixed positioning, so
  // it can never be clipped or covered by sibling rows / modal stacking
  // contexts (every goal row is its own framer-motion stacking context, which
  // makes z-index battles unwinnable). This style is computed from the
  // trigger's position each time it opens. Hidden until measured to avoid a
  // flash at the wrong spot.
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const today = todayIsoDate();
  const days = useMemo(() => getVisibleDays(viewMonth), [viewMonth]);
  const displayValue =
    displayValueOverride ?? (selectedDate ? formatDisplayValue?.(value) ?? formatDate(value) : emptyDisplayValue);
  const hasCompoundTrigger = Boolean(leadingControl || trailingControl);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: Event) => {
      const target = event.target as Node;
      // The popover lives in a body portal, so it's outside pickerRef — check
      // both, otherwise clicking a calendar day would close before it registers.
      if (!pickerRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setViewMonth(startOfMonth(selectedDate ?? new Date()));
    }
  }, [isOpen, selectedDate?.getTime()]);

  // Position the body-portaled popover relative to the trigger. Runs before
  // paint (no flash) and re-runs on scroll/resize so it tracks the trigger.
  // pickerRef now contains only the trigger (popover is portaled out), so its
  // own rect is the trigger's. Flip upward only when it won't fit below AND
  // there's more room above; right-align to the trigger, clamped to the viewport.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const place = () => {
      const trigger = pickerRef.current?.getBoundingClientRect();
      const popover = popoverRef.current;
      if (!trigger || !popover) return;
      const gap = 8;
      const margin = 8;
      const popH = popover.offsetHeight;
      const popW = popover.offsetWidth;
      const spaceBelow = window.innerHeight - trigger.bottom;
      const openUp = spaceBelow < popH + gap && trigger.top > spaceBelow;
      const zIndex = pickerRef.current?.closest(".task-modal-backdrop")
        ? TASK_MODAL_POPOVER_Z_INDEX
        : DEFAULT_POPOVER_Z_INDEX;
      const left = Math.max(
        margin,
        Math.min(trigger.right - popW, window.innerWidth - popW - margin),
      );
      setPopoverStyle({
        position: "fixed",
        zIndex,
        left,
        right: "auto",
        top: openUp ? "auto" : trigger.bottom + gap,
        bottom: openUp ? window.innerHeight - trigger.top + gap : "auto",
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
  }, [isOpen, viewMonth]);

  return (
    <div ref={pickerRef} className={`goal-date-picker ${className}`.trim()}>
      {hasCompoundTrigger ? (
        <div
          className={`goal-date-picker__trigger goal-date-picker__trigger--compound ${!value ? "is-empty" : ""}`.trim()}
          aria-expanded={isOpen}
        >
          <span className="goal-date-picker__side-control">{leadingControl}</span>
          <button
            type="button"
            className="goal-date-picker__display"
            onClick={() => setIsOpen((current) => !current)}
            aria-label={ariaLabel}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
          >
            <span className="goal-date-picker__icon">
              <CalendarIcon />
            </span>
            <span className="goal-date-picker__value">{displayValue}</span>
          </button>
          <span className="goal-date-picker__side-control">{trailingControl}</span>
        </div>
      ) : (
        <button
          type="button"
          className={`goal-date-picker__trigger ${!value ? "is-empty" : ""}`.trim()}
          onClick={() => setIsOpen((current) => !current)}
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
        >
          <span className="goal-date-picker__icon">
            <CalendarIcon />
          </span>
          <span className="goal-date-picker__value">{displayValue}</span>
        </button>
      )}

      {isOpen
        ? createPortal(
        <div
          ref={popoverRef}
          className="goal-date-picker__popover"
          style={popoverStyle}
          role="dialog"
          aria-label={`${ariaLabel} calendar`}
        >
          <div className="goal-date-picker__header">
            <button
              type="button"
              className="goal-date-picker__nav"
              onClick={() => setViewMonth((current) => addMonths(current, -1))}
              aria-label="Previous month"
            >
              <ChevronIcon direction="left" />
            </button>
            <strong>{MONTH_FORMAT.format(viewMonth)}</strong>
            <button
              type="button"
              className="goal-date-picker__nav"
              onClick={() => setViewMonth((current) => addMonths(current, 1))}
              aria-label="Next month"
            >
              <ChevronIcon direction="right" />
            </button>
          </div>

          <div className="goal-date-picker__weekdays" aria-hidden="true">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>

          <div className="goal-date-picker__grid">
            {days.map((day) => {
              const iso = toIsoDate(day);
              const isSelected = iso === value;
              const isToday = iso === today;
              const isOutside = day.getMonth() !== viewMonth.getMonth();
              const isDisabled = Boolean(minIsoDate && iso < minIsoDate);
              return (
                <button
                  key={iso}
                  type="button"
                  className={[
                    "goal-date-picker__day",
                    isSelected ? "is-selected" : "",
                    isToday ? "is-today" : "",
                    isOutside ? "is-outside" : "",
                    isDisabled ? "is-disabled" : "",
                  ].filter(Boolean).join(" ")}
                  disabled={isDisabled}
                  onClick={() => {
                    if (isDisabled) return;
                    onChange(iso);
                    setIsOpen(false);
                  }}
                  aria-pressed={isSelected}
                  aria-label={formatDate(iso)}
                >
                  <span>{day.getDate()}</span>
                </button>
              );
            })}
          </div>

          <div className="goal-date-picker__footer">
            {footerActions.map((action) => (
              <button
                key={action.label}
                type="button"
                className="pomodoro-btn pomodoro-btn--ghost-text"
                onClick={() => {
                  action.onClick();
                  setIsOpen(false);
                }}
              >
                {action.label}
              </button>
            ))}
            {showTodayShortcut ? (
              <button
                type="button"
                className="pomodoro-btn pomodoro-btn--ghost-text"
                onClick={() => {
                  onChange(today);
                  setIsOpen(false);
                }}
              >
                Today
              </button>
            ) : null}
            {footerActionsAfterToday.map((action) => (
              <button
                key={action.label}
                type="button"
                className="pomodoro-btn pomodoro-btn--ghost-text"
                onClick={() => {
                  action.onClick();
                  setIsOpen(false);
                }}
              >
                {action.label}
              </button>
            ))}
            {allowClear ? (
              <button
                type="button"
                className="pomodoro-btn pomodoro-btn--ghost-text"
                onClick={() => {
                  onChange("");
                  setIsOpen(false);
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>,
          document.body,
        )
        : null}
    </div>
  );
}
