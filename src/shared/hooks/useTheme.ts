import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dream" | "forest" | "moon";

const STORAGE_KEY = "planner-theme";
const DEFAULT_THEME: ThemeMode = "forest";

function readInitialTheme(): ThemeMode {
  return DEFAULT_THEME;
}

export function useTheme(): [ThemeMode, (next: ThemeMode) => void] {
  const [theme, setTheme] = useState<ThemeMode>(readInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return [theme, setTheme];
}
