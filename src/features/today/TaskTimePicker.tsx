import { useCallback, useEffect, useRef, useState } from "react";
import { formatTaskTimeDisplay, taskTimeFrom12Hour, taskTimeTo12Hour } from "../../../shared/time";

const TIME_HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const TIME_MINUTES = Array.from({ length: 60 }, (_, index) => index);
const TIME_PERIODS = ["AM", "PM"] as const;

function initialTimeParts(value: string) {
  const parsed = taskTimeTo12Hour(value);
  if (parsed) return parsed;
  const now = new Date();
  const period = now.getHours() >= 12 ? "PM" : "AM";
  return {
    hour: now.getHours() % 12 || 12,
    minute: now.getMinutes(),
    period,
  } as const;
}

function timeInputMask(value: string, fallbackPeriod: "AM" | "PM") {
  const upper = value.toUpperCase();
  const explicitPeriod = upper.includes("P") ? "PM" : upper.includes("A") ? "AM" : "";
  const digits = upper.replace(/\D/g, "").slice(0, 4);
  if (!digits) return explicitPeriod;

  const hour = digits.length <= 2 ? digits : digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2);
  const minute = digits.length <= 2 ? "" : digits.length === 3 ? digits.slice(1) : digits.slice(2);
  const numericHour = Number(hour);
  const period = explicitPeriod || (minute.length === 2 && numericHour >= 1 && numericHour <= 12 ? fallbackPeriod : "");
  return `${hour}${minute ? `:${minute}` : ""}${period ? ` ${period}` : ""}`;
}

function parseTimeInput(value: string, fallbackPeriod: "AM" | "PM") {
  const upper = value.trim().toUpperCase();
  if (!upper) return null;

  const periodMatch = upper.match(/\b([AP])\.?M?\.?\b|([AP])$/);
  const period = periodMatch ? (periodMatch[1] || periodMatch[2]) === "P" ? "PM" : "AM" : "";
  const digits = upper.replace(/\D/g, "");
  if (digits.length < 3) return null;

  const hourText = digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2);
  const minuteText = digits.length === 3 ? digits.slice(1, 3) : digits.slice(2, 4);
  const rawHour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(rawHour) || !Number.isFinite(minute) || minute < 0 || minute > 59) return null;

  if (period) {
    if (rawHour < 1 || rawHour > 12) return null;
    return { hour: rawHour, minute, period } as const;
  }

  if (rawHour >= 0 && rawHour <= 23) {
    const inferredPeriod = rawHour >= 12 ? "PM" : "AM";
    return { hour: rawHour % 12 || 12, minute, period: inferredPeriod } as const;
  }

  if (rawHour >= 1 && rawHour <= 12) {
    return { hour: rawHour, minute, period: fallbackPeriod } as const;
  }

  return null;
}

function getWheelStep(column: HTMLDivElement) {
  const first = column.querySelector("button");
  const second = first?.nextElementSibling as HTMLElement | null;
  if (!first) return 1;
  return second ? second.offsetTop - first.offsetTop : first.offsetHeight;
}

function TimeWheel<TValue extends string | number>({
  ariaLabel,
  className = "",
  format,
  onChange,
  value,
  values,
}: {
  ariaLabel: string;
  className?: string;
  format: (value: TValue) => string;
  onChange: (value: TValue) => void;
  value: TValue;
  values: readonly TValue[];
}) {
  const columnRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const userScrollValueRef = useRef<TValue | null>(null);

  const scrollToIndex = (index: number, behavior: ScrollBehavior = "auto") => {
    const column = columnRef.current;
    if (!column) return;
    column.scrollTo({ top: index * getWheelStep(column), behavior });
  };

  useEffect(() => {
    if (userScrollValueRef.current === value) {
      userScrollValueRef.current = null;
      return;
    }
    const index = values.findIndex((option) => option === value);
    if (index >= 0) {
      requestAnimationFrame(() => scrollToIndex(index));
    }
  }, [value, values]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    };
  }, []);

  const handleScroll = () => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const column = columnRef.current;
      if (!column) return;
      const step = getWheelStep(column);
      const index = Math.max(0, Math.min(values.length - 1, Math.round(column.scrollTop / step)));
      const nextValue = values[index];
      if (nextValue !== value) {
        userScrollValueRef.current = nextValue;
        onChange(nextValue);
      }
    });
  };

  return (
    <div className={`task-modal__time-column-frame ${className}`.trim()}>
      <div ref={columnRef} className={`task-modal__time-column ${className}`.trim()} aria-label={ariaLabel} onScroll={handleScroll}>
        {values.map((option, index) => (
          <button
            key={String(option)}
            type="button"
            className={option === value ? "is-selected" : ""}
            onClick={() => {
              onChange(option);
              scrollToIndex(index);
            }}
          >
            {format(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TimePickerDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftHour, setDraftHour] = useState(() => initialTimeParts(value).hour);
  const [draftMinute, setDraftMinute] = useState(() => initialTimeParts(value).minute);
  const [draftPeriod, setDraftPeriod] = useState<"AM" | "PM">(() => initialTimeParts(value).period);
  const [timeText, setTimeText] = useState(() => formatTaskTimeDisplay(value));
  const pickerRef = useRef<HTMLDivElement>(null);
  const displayValue = formatTaskTimeDisplay(value);

  useEffect(() => {
    setTimeText(displayValue);
  }, [displayValue]);

  const updateDraftTime = useCallback((hour: number, minute: number, period: "AM" | "PM") => {
    setDraftHour(hour);
    setDraftMinute(minute);
    setDraftPeriod(period);
    setTimeText(formatTaskTimeDisplay(taskTimeFrom12Hour(hour, minute, period)));
  }, []);

  const commitTextValue = useCallback(() => {
    const trimmed = timeText.trim();
    if (!trimmed) {
      onChange("");
      return true;
    }
    const parsed = parseTimeInput(trimmed, draftPeriod);
    if (!parsed) {
      setTimeText(displayValue);
      return false;
    }
    setDraftHour(parsed.hour);
    setDraftMinute(parsed.minute);
    setDraftPeriod(parsed.period);
    onChange(taskTimeFrom12Hour(parsed.hour, parsed.minute, parsed.period));
    return true;
  }, [displayValue, draftPeriod, onChange, timeText]);

  useEffect(() => {
    if (!isOpen) return;
    const next = initialTimeParts(value);
    setDraftHour(next.hour);
    setDraftMinute(next.minute);
    setDraftPeriod(next.period);
  }, [isOpen, value]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        commitTextValue();
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [commitTextValue, isOpen]);

  const save = () => {
    if (timeText.trim()) {
      const committed = commitTextValue();
      if (committed) setIsOpen(false);
      return;
    }
    onChange(taskTimeFrom12Hour(draftHour, draftMinute, draftPeriod));
    setIsOpen(false);
  };

  return (
    <div className="task-modal__time-picker" ref={pickerRef}>
      <input
        className={`task-modal__time-trigger ${displayValue ? "" : "is-empty"}`.trim()}
        type="text"
        inputMode="numeric"
        placeholder="Time"
        value={timeText}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Task time"
        onFocus={() => setIsOpen(true)}
        onClick={() => setIsOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            if (!pickerRef.current?.contains(document.activeElement)) {
              commitTextValue();
              setIsOpen(false);
            }
          }, 0);
        }}
        onChange={(event) => {
          const nextText = timeInputMask(event.target.value, draftPeriod);
          setTimeText(nextText);
          const parsed = parseTimeInput(nextText, draftPeriod);
          if (parsed) {
            setDraftHour(parsed.hour);
            setDraftMinute(parsed.minute);
            setDraftPeriod(parsed.period);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (commitTextValue()) setIsOpen(false);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setTimeText(displayValue);
            setIsOpen(false);
          }
        }}
      />
      <span className="task-modal__dropdown-caret task-modal__time-caret" aria-hidden="true" />
      {isOpen ? (
        <div className="task-modal__time-popover" role="dialog" aria-label="Select time">
          <h3>Select time</h3>
          <div className="task-modal__time-wheels">
            <TimeWheel
              ariaLabel="Hour"
              format={(hour) => String(hour).padStart(2, "0")}
              onChange={(hour) => updateDraftTime(hour, draftMinute, draftPeriod)}
              value={draftHour}
              values={TIME_HOURS}
            />
            <div className="task-modal__time-separator" aria-hidden="true">:</div>
            <TimeWheel
              ariaLabel="Minute"
              format={(minute) => String(minute).padStart(2, "0")}
              onChange={(minute) => updateDraftTime(draftHour, minute, draftPeriod)}
              value={draftMinute}
              values={TIME_MINUTES}
            />
            <TimeWheel
              ariaLabel="Period"
              className="task-modal__time-column--period"
              format={(period) => period}
              onChange={(period) => updateDraftTime(draftHour, draftMinute, period)}
              value={draftPeriod}
              values={TIME_PERIODS}
            />
          </div>
          <div className="task-modal__time-actions">
            {displayValue ? (
              <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" onClick={() => {
                onChange("");
                setTimeText("");
                setIsOpen(false);
              }}>
                Clear
              </button>
            ) : null}
            <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" onClick={() => setIsOpen(false)}>
              Cancel
            </button>
            <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text task-modal__time-save" onClick={save}>
              Save
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
