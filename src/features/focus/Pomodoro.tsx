import { AnimatePresence, motion } from "motion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FocusMode, FocusSession, Task } from "../../../shared/schemas";
import { queryKeys } from "../../shared/api/queryClient";
import * as focusApi from "./api";

type Mode = FocusMode;

type PomodoroSettings = {
  focus_minutes: number;
  short_break_minutes: number;
  long_break_minutes: number;
  sessions_until_long_break: number;
  sound_enabled: boolean;
};

const DEFAULT_SETTINGS: PomodoroSettings = {
  focus_minutes: 25,
  short_break_minutes: 5,
  long_break_minutes: 15,
  sessions_until_long_break: 4,
  sound_enabled: true,
};

const MODES: Array<{ key: Mode; label: string }> = [
  { key: "focus", label: "Focus" },
  { key: "short_break", label: "Short break" },
  { key: "long_break", label: "Long break" },
];

const SETTINGS_KEY = "planner.pomodoro.settings";
const TASK_KEY = "planner.pomodoro.task";
const ACTIVE_SESSION_CACHE_KEY = "planner.pomodoro.activeSession";

type ResetConfirmation = "assigned-focus" | "unassigned-progress" | null;

type TaskDuration = { taskId: string; durationSeconds: number };

type ActiveSessionCache = {
  id: string;
  startedAt: string;
  plannedSeconds: number;
  mode: Mode;
  taskId: string | null;
  label: string;
};

function loadSettings(): PomodoroSettings {
  try {
    const stored = window.localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

function loadTaskName(): string {
  try {
    return window.localStorage.getItem(TASK_KEY) ?? "";
  } catch {
    return "";
  }
}

function isMode(value: unknown): value is Mode {
  return value === "focus" || value === "short_break" || value === "long_break";
}

function loadActiveSessionCache(): ActiveSessionCache | null {
  try {
    const stored = window.localStorage.getItem(ACTIVE_SESSION_CACHE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);

    if (
      typeof parsed.id === "string" &&
      typeof parsed.startedAt === "string" &&
      typeof parsed.plannedSeconds === "number" &&
      isMode(parsed.mode)
    ) {
      return {
        id: parsed.id,
        startedAt: parsed.startedAt,
        plannedSeconds: parsed.plannedSeconds,
        mode: parsed.mode,
        taskId: typeof parsed.taskId === "string" ? parsed.taskId : null,
        label: typeof parsed.label === "string" ? parsed.label : "",
      };
    }
  } catch {}

  return null;
}

function saveActiveSessionCache(session: FocusSession) {
  try {
    window.localStorage.setItem(
      ACTIVE_SESSION_CACHE_KEY,
      JSON.stringify({
        id: session.id,
        startedAt: session.startedAt,
        plannedSeconds: session.plannedSeconds,
        mode: session.mode,
        taskId: session.taskId,
        label: session.label,
      } satisfies ActiveSessionCache),
    );
  } catch {}
}

function clearActiveSessionCache() {
  try {
    window.localStorage.removeItem(ACTIVE_SESSION_CACHE_KEY);
  } catch {}
}

function modePlanned(mode: Mode, settings: PomodoroSettings): number {
  const minutes =
    mode === "focus"
      ? settings.focus_minutes
      : mode === "short_break"
      ? settings.short_break_minutes
      : settings.long_break_minutes;
  return minutes * 60;
}

function remainingFromSession(session: Pick<ActiveSessionCache, "startedAt" | "plannedSeconds">): number {
  const started = new Date(session.startedAt).getTime();
  const elapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));
  return Math.max(0, session.plannedSeconds - elapsed);
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

let audioCtx: AudioContext | null = null;

function playChime() {
  try {
    if (!audioCtx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC() as AudioContext;
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    const ctx = audioCtx;
    const now = ctx.currentTime;
    const notes = [
      { freq: 880, t: 0, dur: 0.6 },
      { freq: 1318.5, t: 0.18, dur: 0.7 },
      { freq: 1760, t: 0.36, dur: 0.9 },
    ];
    notes.forEach(({ freq, t, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + t;
      const end = start + dur;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.05);
    });
  } catch {}
}

export default function PomodoroPanel({
  selectedTask,
  onLinkedTaskChange,
  onRunningTaskChange,
  fullPage = false,
}: {
  selectedTask?: Task | null;
  onLinkedTaskChange?: (taskId: string | null) => void;
  onRunningTaskChange?: (taskId: string | null) => void;
  fullPage?: boolean;
}) {
  const queryClient = useQueryClient();
  const cachedSession = useMemo(loadActiveSessionCache, []);
  const initialMode = cachedSession?.mode ?? "focus";
  const [settings, setSettings] = useState<PomodoroSettings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState<ResetConfirmation>(null);
  const [pendingModeSwitch, setPendingModeSwitch] = useState<Mode | null>(null);
  const [taskName, setTaskName] = useState<string>(() => cachedSession?.label || loadTaskName());
  const [mode, setMode] = useState<Mode>(initialMode);
  const [isRunning, setIsRunning] = useState(Boolean(cachedSession && remainingFromSession(cachedSession) > 0));
  const [remaining, setRemaining] = useState<number>(() =>
    cachedSession ? remainingFromSession(cachedSession) : modePlanned(initialMode, loadSettings()),
  );
  const [focusCount, setFocusCount] = useState(0);
  const endTimeRef = useRef<number | null>(null);
  const activeSessionIdRef = useRef<string | null>(cachedSession?.id ?? null);
  const sessionHadAssignedTaskRef = useRef(Boolean(cachedSession?.taskId));
  const taskFocusMsRef = useRef<Record<string, number>>({});
  const activeTaskSegmentRef = useRef<{ taskId: string; startedAt: number } | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const focusCountRef = useRef(focusCount);
  focusCountRef.current = focusCount;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const selectedTaskIdRef = useRef<string | null>(selectedTask?.id ?? null);
  selectedTaskIdRef.current = selectedTask?.id ?? null;

  const closeActiveTaskSegment = (now = Date.now()) => {
    const segment = activeTaskSegmentRef.current;
    if (!segment) return;

    const elapsedMs = Math.max(0, now - segment.startedAt);
    if (elapsedMs > 0) {
      taskFocusMsRef.current[segment.taskId] = (taskFocusMsRef.current[segment.taskId] ?? 0) + elapsedMs;
    }
    activeTaskSegmentRef.current = null;
  };

  const openActiveTaskSegment = (taskId: string | null, now = Date.now()) => {
    if (modeRef.current !== "focus" || !taskId) return;
    if (activeTaskSegmentRef.current?.taskId === taskId) return;
    closeActiveTaskSegment(now);
    sessionHadAssignedTaskRef.current = true;
    activeTaskSegmentRef.current = { taskId, startedAt: now };
  };

  const resetTaskFocusTracking = () => {
    taskFocusMsRef.current = {};
    activeTaskSegmentRef.current = null;
  };

  const hasTrackedTaskFocus = () =>
    sessionHadAssignedTaskRef.current ||
    Boolean(activeTaskSegmentRef.current) ||
    Object.values(taskFocusMsRef.current).some((durationMs) => durationMs > 0);

  const getTaskDurations = (): TaskDuration[] =>
    Object.entries(taskFocusMsRef.current)
      .map(([taskId, durationMs]) => ({ taskId, durationSeconds: Math.floor(durationMs / 1000) }))
      .filter((item) => item.durationSeconds > 0);

  const getLiveRemaining = () => {
    if (!isRunning) return remaining;
    const end = endTimeRef.current;
    if (!end) return remaining;
    return Math.max(0, Math.round((end - Date.now()) / 1000));
  };

  const activeSessionQuery = useQuery({
    queryKey: queryKeys.activeFocusSession,
    queryFn: focusApi.getActiveFocusSession,
  });

  const startSessionMutation = useMutation({
    mutationFn: focusApi.startFocusSession,
    onSuccess: ({ session }) => {
      activeSessionIdRef.current = session.id;
      sessionHadAssignedTaskRef.current = sessionHadAssignedTaskRef.current || Boolean(session.taskId);
      endTimeRef.current = new Date(session.startedAt).getTime() + session.plannedSeconds * 1000;
      saveActiveSessionCache(session);
      queryClient.setQueryData(queryKeys.activeFocusSession, { session });
    },
  });

  const finishSessionMutation = useMutation({
    mutationFn: ({
      id,
      status,
      durationSeconds,
      taskDurations,
    }: {
      id: string;
      status: "completed" | "skipped" | "abandoned";
      durationSeconds?: number;
      taskDurations?: TaskDuration[];
    }) => focusApi.finishFocusSession(id, { status, durationSeconds, taskDurations }),
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.activeFocusSession, { session: null });
      // Today's list reads from occurrences now; invalidating refreshes focus
      // seconds aggregations after the session is recorded.
      queryClient.invalidateQueries({ queryKey: ["occurrences"] });
    },
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TASK_KEY, taskName);
    } catch {}
  }, [taskName]);

  useEffect(() => {
    if (!isRunning || modeRef.current !== "focus") return;

    const now = Date.now();
    const nextTaskId = selectedTask?.id ?? null;
    closeActiveTaskSegment(now);
    openActiveTaskSegment(nextTaskId, now);
    onRunningTaskChange?.(nextTaskId);
    if (nextTaskId) {
      sessionHadAssignedTaskRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTask?.id]);

  useEffect(() => {
    const session = activeSessionQuery.data?.session;

    if (activeSessionQuery.data && !session) {
      activeSessionIdRef.current = null;
      endTimeRef.current = null;
      resetTaskFocusTracking();
      clearActiveSessionCache();
      onLinkedTaskChange?.(null);
      onRunningTaskChange?.(null);
      if (isRunning) {
        setIsRunning(false);
        setRemaining(modePlanned(modeRef.current, settingsRef.current));
      }
      return;
    }

    if (!session) return;

    activeSessionIdRef.current = session.id;
    sessionHadAssignedTaskRef.current = sessionHadAssignedTaskRef.current || Boolean(session.taskId);
    onLinkedTaskChange?.(session.taskId);
    onRunningTaskChange?.(session.taskId);
    setMode(session.mode);
    if (session.label) {
      setTaskName(session.label);
    }

    const nextRemaining = remainingFromSession(session);
    endTimeRef.current = new Date(session.startedAt).getTime() + session.plannedSeconds * 1000;
    saveActiveSessionCache(session);

    if (nextRemaining <= 0) {
      setRemaining(0);
      setIsRunning(false);
      onRunningTaskChange?.(null);
      finishSessionMutation.mutate({
        id: session.id,
        status: "completed",
        durationSeconds: session.plannedSeconds,
      });
      completeLocal(session.mode);
      return;
    }

    setRemaining(nextRemaining);
    setIsRunning(true);
    openActiveTaskSegment(session.taskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionQuery.data]);

  // Update remaining when planned time changes while the timer is idle.
  useEffect(() => {
    if (!isRunning && !activeSessionIdRef.current) {
      setRemaining(modePlanned(mode, settings));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, settings.focus_minutes, settings.short_break_minutes, settings.long_break_minutes]);

  // Tick loop driven by a single setInterval, computing remaining off wall-clock.
  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => {
      const end = endTimeRef.current ?? 0;
      const diff = Math.max(0, Math.round((end - Date.now()) / 1000));
      setRemaining(diff);
      if (diff <= 0) {
        window.clearInterval(id);
        setIsRunning(false);
        completeTimer();
      }
    }, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  const completeLocal = (completedMode: Mode = modeRef.current) => {
    if (settingsRef.current.sound_enabled) {
      playChime();
    }
    const currentMode = completedMode;
    if (currentMode === "focus") {
      const newCount = focusCountRef.current + 1;
      setFocusCount(newCount);
      const every = Math.max(1, settingsRef.current.sessions_until_long_break);
      const next: Mode = newCount % every === 0 ? "long_break" : "short_break";
      setMode(next);
      setRemaining(modePlanned(next, settingsRef.current));
    } else {
      setMode("focus");
      setRemaining(modePlanned("focus", settingsRef.current));
    }
  };

  const completeTimer = () => {
    const sessionId = activeSessionIdRef.current;
    const plannedSeconds = modePlanned(modeRef.current, settingsRef.current);
    closeActiveTaskSegment();
    const taskDurations = getTaskDurations();

    activeSessionIdRef.current = null;
    endTimeRef.current = null;
    sessionHadAssignedTaskRef.current = false;
    resetTaskFocusTracking();
    clearActiveSessionCache();
    onRunningTaskChange?.(null);

    if (sessionId) {
      finishSessionMutation.mutate({
        id: sessionId,
        status: "completed",
        durationSeconds: plannedSeconds,
        taskDurations,
      });
    }

    completeLocal();
  };

  const start = () => {
    const seconds = remaining > 0 ? remaining : modePlanned(mode, settings);
    const label = selectedTask?.title ?? taskName.trim();
    const optimisticEnd = Date.now() + seconds * 1000;
    endTimeRef.current = optimisticEnd;
    setRemaining(seconds);
    setIsRunning(true);
    if (selectedTask?.id) {
      sessionHadAssignedTaskRef.current = true;
    }
    onLinkedTaskChange?.(selectedTask?.id ?? null);
    onRunningTaskChange?.(selectedTask?.id ?? null);
    openActiveTaskSegment(selectedTask?.id ?? null);

    if (activeSessionIdRef.current) {
      return;
    }

    startSessionMutation.mutate({
      plannedSeconds: seconds,
      mode,
      taskId: selectedTask?.id,
      label,
    });
  };

  const pause = () => {
    const nextRemaining = getLiveRemaining();
    closeActiveTaskSegment();
    setRemaining(nextRemaining);
    setIsRunning(false);
    endTimeRef.current = null;
    onRunningTaskChange?.(null);
  };

  const reset = () => {
    if (mode !== "focus") {
      commitReset();
      return;
    }

    const totalSeconds = modePlanned(mode, settings);
    const currentRemaining = getLiveRemaining();
    const elapsedSeconds = Math.max(0, totalSeconds - currentRemaining);
    if (isRunning || elapsedSeconds > 0) {
      setResetConfirmation(hasTrackedTaskFocus() ? "assigned-focus" : "unassigned-progress");
      return;
    }

    commitReset();
  };

  const commitReset = () => {
    const sessionId = activeSessionIdRef.current;
    const currentRemaining = getLiveRemaining();
    const elapsedSeconds = Math.max(0, modePlanned(mode, settings) - currentRemaining);
    closeActiveTaskSegment();
    const taskDurations = getTaskDurations();

    setIsRunning(false);
    setRemaining(modePlanned(mode, settings));
    setResetConfirmation(null);
    clearActiveSessionCache();
    activeSessionIdRef.current = null;
    sessionHadAssignedTaskRef.current = false;
    resetTaskFocusTracking();
    endTimeRef.current = null;
    onRunningTaskChange?.(null);

    if (sessionId) {
      finishSessionMutation.mutate({
        id: sessionId,
        status: "skipped",
        durationSeconds: elapsedSeconds,
        taskDurations,
      });
    }
  };

  const requestModeChange = (next: Mode) => {
    if (next === modeRef.current) return;
    const isLeavingActiveFocus =
      modeRef.current === "focus" &&
      next !== "focus" &&
      (Boolean(activeSessionIdRef.current) || isRunning);

    if (isLeavingActiveFocus) {
      setPendingModeSwitch(next);
      return;
    }

    changeMode(next);
  };

  const confirmModeSwitch = () => {
    const next = pendingModeSwitch;
    if (!next) return;
    setPendingModeSwitch(null);
    changeMode(next);
  };

  const changeMode = (next: Mode) => {
    if (next === modeRef.current) return;
    const sessionId = activeSessionIdRef.current;
    const currentRemaining = getLiveRemaining();
    const elapsedSeconds = Math.max(0, modePlanned(mode, settings) - currentRemaining);
    closeActiveTaskSegment();
    const taskDurations = getTaskDurations();

    setIsRunning(false);
    setMode(next);
    setRemaining(modePlanned(next, settings));
    clearActiveSessionCache();
    activeSessionIdRef.current = null;
    sessionHadAssignedTaskRef.current = false;
    resetTaskFocusTracking();
    endTimeRef.current = null;
    onRunningTaskChange?.(null);

    if (sessionId) {
      finishSessionMutation.mutate({
        id: sessionId,
        status: "skipped",
        durationSeconds: elapsedSeconds,
        taskDurations,
      });
    }
  };

  const total = modePlanned(mode, settings);
  const progress = total > 0 ? 1 - remaining / total : 0;
  const cycleTotal = Math.max(1, settings.sessions_until_long_break);
  const cycleComplete = focusCount === 0 ? 0 : focusCount % cycleTotal || cycleTotal;
  const hasSelectedFocusTask = Boolean(selectedTask);
  const focusTaskName = selectedTask?.title ?? taskName;
  const activeIndex = Math.max(
    0,
    MODES.findIndex((m) => m.key === mode),
  );
  const pendingSwitchHasTaskFocus = hasTrackedTaskFocus();

  return (
    <motion.section
      className={`tasks-panel pomodoro-panel ${fullPage ? "pomodoro-panel--full" : ""} ${hasSelectedFocusTask ? "has-focus-task" : ""}`.trim()}
      aria-label="Pomodoro timer"
    >
      <header className="tasks-panel__header">
        <div>
          <h2 className="tasks-title">Focus</h2>
        </div>
        <div className="tasks-panel__actions">
          <div className="pomodoro-cycle" aria-label={`${cycleComplete} of ${cycleTotal} focus sessions complete`}>
            <span className="pomodoro-cycle__label">
              {cycleComplete} of {cycleTotal} complete
            </span>
            <span className="pomodoro-cycle__dots" aria-hidden="true">
              {Array.from({ length: cycleTotal }, (_, index) => (
                <span
                  key={index}
                  className={`pomodoro-cycle__dot ${index < cycleComplete ? "is-complete" : ""}`.trim()}
                />
              ))}
            </span>
          </div>
        </div>
      </header>

      <div className="category-toggle pomodoro-mode-toggle" role="tablist" aria-label="Timer mode">
        <div className="category-toggle__track">
          <div className="category-toggle__scroll">
            <div
              className="category-toggle__inner"
              style={{
                ["--category-toggle-count" as any]: MODES.length,
                ["--category-toggle-active" as any]: activeIndex,
              }}
            >
              <span className="category-toggle__thumb" aria-hidden="true" />
              {MODES.map((m, i) => (
                <button
                  key={m.key}
                  type="button"
                  role="tab"
                  aria-selected={i === activeIndex}
                  className={`category-toggle__option ${i === activeIndex ? "is-active" : ""}`.trim()}
                  onClick={() => requestModeChange(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="pomodoro-ring-shell">
        <PomodoroRing progress={progress} mode={mode} size={hasSelectedFocusTask ? "compact" : "large"}>
          <p className="pomodoro-ring__kicker">{MODES[activeIndex].label.toUpperCase()}</p>
          <AnimatedTime value={formatTime(remaining)} />
        </PomodoroRing>
      </div>

      <div className="pomodoro-focus-slot" aria-live="polite">
        <AnimatePresence initial={false}>
          {selectedTask ? (
            <motion.div
              className="pomodoro-ring__focus"
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="pomodoro-ring__focus-text" title={focusTaskName}>
                {focusTaskName}
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="pomodoro-controls">
        <button type="button" className="pomodoro-btn pomodoro-btn--ghost" aria-label="Reset timer" onClick={reset}>
          <ResetIcon />
        </button>
        <button
          type="button"
          className={`pomodoro-btn pomodoro-btn--primary ${!isRunning && selectedTask ? "is-pulse" : ""}`.trim()}
          aria-label={isRunning ? "Pause timer" : "Start timer"}
          onClick={() => (isRunning ? pause() : start())}
        >
          {isRunning ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          className="pomodoro-btn pomodoro-btn--ghost"
          aria-label="Open timer settings"
          onClick={() => setSettingsOpen(true)}
        >
          <GearIcon />
        </button>
      </div>

      <AnimatePresence>
        {resetConfirmation ? (
          <PomodoroResetConfirmModal
            variant={resetConfirmation}
            onCancel={() => setResetConfirmation(null)}
            onConfirm={commitReset}
          />
        ) : null}
        {pendingModeSwitch ? (
          <PomodoroResetConfirmModal
            variant={pendingSwitchHasTaskFocus ? "assigned-focus" : "unassigned-progress"}
            title="Switch to break?"
            confirmLabel={pendingSwitchHasTaskFocus ? "Save & switch" : "Reset & switch"}
            onCancel={() => setPendingModeSwitch(null)}
            onConfirm={confirmModeSwitch}
          />
        ) : null}
        {settingsOpen ? (
          <PomodoroSettingsModal
            settings={settings}
            onClose={() => setSettingsOpen(false)}
            onSave={(next) => {
              setSettings(next);
              setSettingsOpen(false);
              // If timer is idle, refresh remaining to reflect new duration.
              if (!isRunning) {
                setRemaining(modePlanned(modeRef.current, next));
              }
            }}
          />
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}

function AnimatedTime({ value }: { value: string }) {
  return (
    <h1 className="pomodoro-ring__time" aria-label={value}>
      {value.split("").map((character, index) => (
        <span key={index} className="pomodoro-ring__time-slot" aria-hidden="true">
          {character === ":" ? (
            <span className="pomodoro-ring__time-colon">:</span>
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={character}
                className="pomodoro-ring__time-digit"
                initial={{ opacity: 0, y: 5, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -5, filter: "blur(4px)" }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                {character}
              </motion.span>
            </AnimatePresence>
          )}
        </span>
      ))}
    </h1>
  );
}

const RING_SIZES = {
  compact: 178,
  large: 218,
} as const;
const RING_STROKE = 8;
const RING_TICKS = 60;

function PomodoroRing({
  progress,
  mode,
  size,
  children,
}: {
  progress: number;
  mode: Mode;
  size: keyof typeof RING_SIZES;
  children?: React.ReactNode;
}) {
  const ringSize = RING_SIZES[size];
  const ringRadius = ringSize / 2 - RING_STROKE - 6;
  const ringCenter = ringSize / 2;
  const clamped = Math.min(1, Math.max(0, progress));
  // Keep progress values normalized so changing the visual ring size (large ↔ compact)
  // cannot animate from one circumference to another and briefly paint a fake arc.
  const dashOffset = 1 - clamped;
  const shouldShowProgress = clamped > 0.0001;
  const angle = -Math.PI / 2 + 2 * Math.PI * clamped;
  const handleX = ringCenter + ringRadius * Math.cos(angle);
  const handleY = ringCenter + ringRadius * Math.sin(angle);

  const ticks = useMemo(() => {
    const arr: Array<{ x1: number; y1: number; x2: number; y2: number; long: boolean }> = [];
    for (let i = 0; i < RING_TICKS; i++) {
      const a = (i / RING_TICKS) * 2 * Math.PI - Math.PI / 2;
      const isLong = i % 5 === 0;
      const inner = isLong ? ringRadius + 4 : ringRadius + 8;
      const outer = ringRadius + 14;
      arr.push({
        x1: ringCenter + inner * Math.cos(a),
        y1: ringCenter + inner * Math.sin(a),
        x2: ringCenter + outer * Math.cos(a),
        y2: ringCenter + outer * Math.sin(a),
        long: isLong,
      });
    }
    return arr;
  }, [ringCenter, ringRadius]);

  return (
    <div
      className={`pomodoro-ring pomodoro-ring--${mode}`}
      style={{ ["--ring-size" as string]: `${ringSize}px` }}
    >
      <svg width="100%" height="100%" viewBox={`0 0 ${ringSize} ${ringSize}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id="pomodoro-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--pomodoro-grad-start, #faa08a)" />
            <stop offset="55%" stopColor="var(--pomodoro-grad-mid, #f194c2)" />
            <stop offset="100%" stopColor="var(--pomodoro-grad-end, #bf95e6)" />
          </linearGradient>
          <filter id="pomodoro-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            className={`pomodoro-ring__tick ${t.long ? "is-long" : ""}`.trim()}
          />
        ))}

        <circle
          cx={ringCenter}
          cy={ringCenter}
          r={ringRadius}
          className="pomodoro-ring__track"
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
        />

        {shouldShowProgress ? (
          <>
            <circle
              cx={ringCenter}
              cy={ringCenter}
              r={ringRadius}
              className="pomodoro-ring__progress pomodoro-ring__progress--glow"
              fill="none"
              stroke="url(#pomodoro-grad)"
              strokeWidth={RING_STROKE + 6}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${ringCenter} ${ringCenter})`}
              filter="url(#pomodoro-glow)"
              opacity={0.55}
            />

            <circle
              cx={ringCenter}
              cy={ringCenter}
              r={ringRadius}
              className="pomodoro-ring__progress"
              fill="none"
              stroke="url(#pomodoro-grad)"
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${ringCenter} ${ringCenter})`}
            />
          </>
        ) : null}

        <g style={{ transition: "all 0.4s cubic-bezier(0.22, 1, 0.36, 1)" }}>
          <circle cx={handleX} cy={handleY} r={10} className="pomodoro-ring__handle" />
          <circle cx={handleX} cy={handleY} r={4} className="pomodoro-ring__handle-dot" />
        </g>
      </svg>

      <div className="pomodoro-ring__content">{children}</div>
    </div>
  );
}

function PomodoroResetConfirmModal({
  variant,
  title = "Reset timer?",
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  variant: Exclude<ResetConfirmation, null>;
  title?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isAssignedFocus = variant === "assigned-focus";

  return (
    <motion.div
      className="pomodoro-confirm-overlay"
      aria-label="Confirm timer reset"
      role="dialog"
      aria-modal="true"
      initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: 8, filter: "blur(8px)" }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="pomodoro-confirm__card pomodoro-confirm__card--reset">
        <div className="pomodoro-confirm__icon" aria-hidden="true">
          <ResetIcon />
        </div>
        <div className="pomodoro-confirm__content">
          <h3>{title}</h3>
          <p>
            {isAssignedFocus
              ? "Time spent will be saved to focused tasks. This Pomodoro won’t count as completed."
              : "Your current progress will be lost. This Pomodoro won’t count as completed."}
          </p>
        </div>
        <div className="pomodoro-confirm__actions">
          <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="task-add" onClick={onConfirm}>
            {confirmLabel ?? (isAssignedFocus ? "Save & reset" : "Reset timer")}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function PomodoroSettingsModal({
  settings,
  onClose,
  onSave,
}: {
  settings: PomodoroSettings;
  onClose: () => void;
  onSave: (settings: PomodoroSettings) => void;
}) {
  const [focus, setFocus] = useState(settings.focus_minutes);
  const [shortBreak, setShortBreak] = useState(settings.short_break_minutes);
  const [longBreak, setLongBreak] = useState(settings.long_break_minutes);
  const [cycles, setCycles] = useState(settings.sessions_until_long_break);
  const [soundEnabled, setSoundEnabled] = useState(settings.sound_enabled);

  return (
    <motion.div
      className="pomodoro-settings-overlay"
      aria-label="Pomodoro settings"
      role="dialog"
      aria-modal="true"
      initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: 8, filter: "blur(8px)" }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="pomodoro-settings__header">
        <h3>Timer settings</h3>
        <button className="task-modal__close" type="button" aria-label="Close settings" onClick={onClose}>
          x
        </button>
      </header>

      <div className="pomodoro-settings__body">
          <SliderRow label="Focus duration" unit="min" value={focus} min={1} max={90} onChange={setFocus} />
          <SliderRow label="Short break" unit="min" value={shortBreak} min={1} max={30} onChange={setShortBreak} />
          <SliderRow label="Long break" unit="min" value={longBreak} min={1} max={60} onChange={setLongBreak} />
          <SliderRow label="Sessions until long break" unit="" value={cycles} min={2} max={8} onChange={setCycles} />

          <div className="pomodoro-settings__row">
            <span className="pomodoro-settings__label">Sound on complete</span>
            <div className="checkbox-wrapper">
              <input
                id="pomodoro-sound"
                type="checkbox"
                checked={soundEnabled}
                onChange={(event) => setSoundEnabled(event.target.checked)}
              />
              <label htmlFor="pomodoro-sound">
                <span className="tick_mark" aria-hidden="true"></span>
              </label>
            </div>
          </div>
        </div>

      <footer className="pomodoro-settings__footer">
        <button type="button" className="pomodoro-btn pomodoro-btn--ghost-text" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="task-add"
          onClick={() =>
            onSave({
              focus_minutes: focus,
              short_break_minutes: shortBreak,
              long_break_minutes: longBreak,
              sessions_until_long_break: cycles,
              sound_enabled: soundEnabled,
            })
          }
        >
          Save
        </button>
      </footer>
    </motion.div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="pomodoro-settings__slider">
      <div className="pomodoro-settings__slider-header">
        <span className="pomodoro-settings__label">{label}</span>
        <span className="pomodoro-settings__value">
          {value}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 5.5v13l11-6.5L8 5.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="6.5" y="5.5" width="4" height="13" rx="1.2" />
      <rect x="13.5" y="5.5" width="4" height="13" rx="1.2" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12a7 7 0 1 0 2.3-5.2" />
      <path d="M4.5 4.5v4h4" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3" />
      <path d="m4.9 10 .9-2.2 2 .3 1.3-1.1.2-2.1h5.4l.2 2.1 1.3 1.1 2-.3.9 2.2-1.6 1.3v1.4l1.6 1.3-.9 2.2-2-.3-1.3 1.1-.2 2.1H9.3l-.2-2.1-1.3-1.1-2 .3-.9-2.2 1.6-1.3v-1.4L4.9 10Z" />
    </svg>
  );
}
