import { useCallback, useEffect, useState } from "react";

const APP_PREFERENCES_KEY = "planner.appPreferences";
const APP_PREFERENCES_EVENT = "planner:app-preferences";

export type AppPreferences = {
  showGoalsWidget: boolean;
  todaySelectedGoalId: string | null;
};

const DEFAULT_APP_PREFERENCES: AppPreferences = {
  showGoalsWidget: true,
  todaySelectedGoalId: null,
};

type AppPreferencesUpdate =
  | Partial<AppPreferences>
  | ((current: AppPreferences) => Partial<AppPreferences>);

function normalizePreferences(value: unknown): AppPreferences {
  if (!value || typeof value !== "object") return DEFAULT_APP_PREFERENCES;
  const partial = value as Partial<AppPreferences>;
  return {
    ...DEFAULT_APP_PREFERENCES,
    showGoalsWidget: partial.showGoalsWidget !== false,
    todaySelectedGoalId:
      typeof partial.todaySelectedGoalId === "string" && partial.todaySelectedGoalId.trim()
        ? partial.todaySelectedGoalId
        : null,
  };
}

function readPreferences(): AppPreferences {
  if (typeof window === "undefined") return DEFAULT_APP_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(APP_PREFERENCES_KEY);
    return normalizePreferences(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_APP_PREFERENCES;
  }
}

function writePreferences(preferences: AppPreferences) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(APP_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Keep the in-memory state usable if localStorage is unavailable.
  }
  window.dispatchEvent(new CustomEvent<AppPreferences>(APP_PREFERENCES_EVENT, { detail: preferences }));
}

export function useAppPreferences() {
  const [preferences, setPreferencesState] = useState<AppPreferences>(() => readPreferences());

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const sync = () => setPreferencesState(readPreferences());
    const onStorage = (event: StorageEvent) => {
      if (event.key === APP_PREFERENCES_KEY) sync();
    };
    const onPreferences = (event: Event) => {
      const next = (event as CustomEvent<AppPreferences>).detail;
      setPreferencesState(normalizePreferences(next));
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(APP_PREFERENCES_EVENT, onPreferences);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(APP_PREFERENCES_EVENT, onPreferences);
    };
  }, []);

  const setPreferences = useCallback((update: AppPreferencesUpdate) => {
    const current = readPreferences();
    const patch = typeof update === "function" ? update(current) : update;
    const next = normalizePreferences({ ...current, ...patch });
    writePreferences(next);
    setPreferencesState(next);
  }, []);

  return [preferences, setPreferences] as const;
}
