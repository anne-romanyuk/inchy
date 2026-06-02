import { useEffect, type DependencyList, type RefObject } from "react";

export function useOverflowFade<T extends HTMLElement>(
  ref: RefObject<T | null>,
  deps: DependencyList,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const overflowTop = el.scrollTop > 4;
      const overflowBottom = el.scrollHeight - el.clientHeight - el.scrollTop > 4;
      el.dataset.overflowTop = overflowTop ? "true" : "false";
      el.dataset.overflowBottom = overflowBottom ? "true" : "false";
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    Array.from(el.children).forEach((child) => observer.observe(child));

    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
