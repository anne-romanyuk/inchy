import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { formatTaskDuration, parseTaskDuration } from "../../../shared/duration";

const MAX_DURATION_HOURS = 24;
const MAX_DURATION_MINUTES = 60;

function durationNumberInput(value: string, max: number) {
  const digits = value.replace(/\D/g, "").slice(0, 2);
  if (!digits) return "0";
  return String(Math.min(Number(digits), max));
}

type DurationSegment = "hours" | "minutes";

export function TaskDurationInput({
  ariaLabel = "Duration",
  className = "",
  placeholder = "Duration",
  value,
  onChange,
}: {
  ariaLabel?: string;
  className?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const parsedValue = parseTaskDuration(value);
  const [durationHours, setDurationHours] = useState(parsedValue ? String(parsedValue.hours) : "");
  const [durationMinutes, setDurationMinutes] = useState(parsedValue ? String(parsedValue.minutes) : "");
  const [durationActive, setDurationActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const draftDuration = formatTaskDuration(Number(durationHours || 0), Number(durationMinutes || 0));
  const durationDisplayValue =
    durationActive || draftDuration ? `${durationHours || "0"}h ${durationMinutes || "0"}m` : "";

  useEffect(() => {
    if (durationActive) return;
    const next = parseTaskDuration(value);
    setDurationHours(next ? String(next.hours) : "");
    setDurationMinutes(next ? String(next.minutes) : "");
  }, [durationActive, value]);

  const notify = (hours: string, minutes: string) => {
    onChange(formatTaskDuration(Number(hours || 0), Number(minutes || 0)));
  };

  const openDurationEditor = () => {
    setDurationActive(true);
    setDurationHours((current) => (current ? current : "0"));
    setDurationMinutes((current) => (current ? current : "0"));
  };

  const closeDurationEditor = () => {
    const normalized = formatTaskDuration(Number(durationHours || 0), Number(durationMinutes || 0));
    if (!normalized) {
      setDurationHours("");
      setDurationMinutes("");
    }
    onChange(normalized);
    setDurationActive(false);
  };

  const updateDurationSegment = (segment: DurationSegment, nextValue: string) => {
    const nextHours = segment === "hours" ? durationNumberInput(nextValue, MAX_DURATION_HOURS) : durationHours || "0";
    const nextMinutes = segment === "minutes" ? durationNumberInput(nextValue, MAX_DURATION_MINUTES) : durationMinutes || "0";
    setDurationHours(nextHours);
    setDurationMinutes(nextMinutes);
    notify(nextHours, nextMinutes);
  };

  const getDurationSegmentFromCaret = (caretPosition: number | null): DurationSegment => {
    const hIndex = durationDisplayValue.indexOf("h");
    if (hIndex === -1 || caretPosition === null) return "hours";
    return caretPosition <= hIndex ? "hours" : "minutes";
  };

  const placeDurationCaret = (segment: DurationSegment, segmentLength: number) => {
    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      const hoursLength = segment === "hours" ? segmentLength : String(durationHours || "0").length;
      const position = segment === "hours" ? segmentLength : hoursLength + 2 + segmentLength;
      input.setSelectionRange(position, position);
    });
  };

  const handleDurationKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const key = event.key;
    if (event.metaKey || event.ctrlKey || event.altKey || key === "Tab") return;

    const segment = getDurationSegmentFromCaret(event.currentTarget.selectionStart);
    const currentValue = segment === "hours" ? durationHours || "0" : durationMinutes || "0";

    if (/^\d$/.test(key)) {
      event.preventDefault();
      const nextValue = durationNumberInput(
        currentValue === "0" ? key : `${currentValue}${key}`,
        segment === "hours" ? MAX_DURATION_HOURS : MAX_DURATION_MINUTES,
      );
      updateDurationSegment(segment, nextValue);
      placeDurationCaret(segment, nextValue.length);
      return;
    }

    if (key === "Backspace" || key === "Delete") {
      event.preventDefault();
      const nextValue = currentValue.length <= 1 ? "0" : currentValue.slice(0, -1);
      updateDurationSegment(segment, nextValue);
      placeDurationCaret(segment, nextValue.length);
      return;
    }

    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;
    event.preventDefault();
  };

  const handleDurationChange = (nextValue: string) => {
    const parsed = parseTaskDuration(nextValue);
    if (parsed) {
      const nextHours = String(parsed.hours);
      const nextMinutes = String(parsed.minutes);
      setDurationHours(nextHours);
      setDurationMinutes(nextMinutes);
      notify(nextHours, nextMinutes);
      return;
    }

    const digits = nextValue.replace(/\D/g, "").slice(0, 4);
    if (!digits) {
      setDurationHours("0");
      setDurationMinutes("0");
      onChange("");
      return;
    }

    if (digits.length <= 2) {
      const nextHours = durationNumberInput(digits, MAX_DURATION_HOURS);
      setDurationHours(nextHours);
      setDurationMinutes("0");
      notify(nextHours, "0");
      return;
    }

    const nextHours = durationNumberInput(digits.slice(0, 2), MAX_DURATION_HOURS);
    const nextMinutes = durationNumberInput(digits.slice(2), MAX_DURATION_MINUTES);
    setDurationHours(nextHours);
    setDurationMinutes(nextMinutes);
    notify(nextHours, nextMinutes);
  };

  return (
    <input
      ref={inputRef}
      className={`task-modal__duration-input task-modal__duration-input--masked ${className}`.trim()}
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={durationDisplayValue}
      onFocus={openDurationEditor}
      onClick={openDurationEditor}
      onBlur={closeDurationEditor}
      onKeyDown={handleDurationKeyDown}
      onChange={(event) => handleDurationChange(event.target.value)}
    />
  );
}
