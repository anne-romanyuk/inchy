import { useSyncExternalStore } from "react";

// Single source of truth for "are we in the mobile layout?". Breakpoint-based
// (not platform-based) on purpose: the whole mobile UI can be built and tested
// in a desktop browser's responsive mode, no native build required. When we
// wrap the app with Capacitor later, OR this with `Capacitor.isNativePlatform()`
// so the native build always gets the mobile layout regardless of window size.
const MOBILE_QUERY = "(max-width: 768px)";

function getMediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  return window.matchMedia(MOBILE_QUERY);
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mq = getMediaQuery();
      if (!mq) return () => {};
      mq.addEventListener("change", onStoreChange);
      return () => mq.removeEventListener("change", onStoreChange);
    },
    () => getMediaQuery()?.matches ?? false,
    () => false, // server/initial snapshot — desktop by default
  );
}
