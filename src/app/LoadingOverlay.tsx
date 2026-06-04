import { useEffect, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";

/**
 * Full-screen blurred loader shown while the page's data is loading for the
 * first time (e.g. right after a refresh, when the shell renders instantly from
 * the cached user but tasks/goals haven't arrived yet).
 *
 * It only counts queries that are *pending* (no data yet) and actively
 * fetching, so background revalidations — and the cached current user — never
 * trigger it. A short delay keeps quick loads from flashing a spinner.
 */
export function LoadingOverlay() {
  const pending = useIsFetching({
    predicate: (query) =>
      query.queryKey[0] !== "currentUser" &&
      query.state.status === "pending" &&
      query.state.fetchStatus === "fetching",
  });

  const isLoading = pending > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(timer);
  }, [isLoading]);

  if (!visible) return null;

  return (
    <div className="app-loader" role="status" aria-live="polite" aria-label="Loading">
      <span className="app-loader__spinner" aria-hidden="true" />
    </div>
  );
}
