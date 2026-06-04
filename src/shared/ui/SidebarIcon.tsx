import type { ReactNode } from "react";
import type { SidebarItemId } from "../../app/sidebar";

export function SidebarIcon({ id }: { id: SidebarItemId }) {
  const paths: Record<SidebarItemId, ReactNode> = {
    today: (
      <>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5 7 7M17 17l1.5 1.5M18.5 5.5 17 7M7 17l-1.5 1.5" />
      </>
    ),
    goals: (
      <>
        <circle cx="12" cy="12" r="7.2" />
        <circle cx="12" cy="12" r="3.6" />
        <path d="m14.4 9.6 4.2-4.2M17.4 5.4h1.2v1.2M12 12l2.4-2.4" />
      </>
    ),
    plan: (
      <>
        <rect x="4" y="5.6" width="16" height="14" rx="2.4" />
        <path d="M8 3.6v4M16 3.6v4M4 10h16M8 14h2M13.5 14h2M8 17h2M13.5 17h2" />
      </>
    ),
    history: (
      <>
        <path d="M12 6.2v5.1l3.2 2" />
        <path d="M4.9 7.2A8.2 8.2 0 1 1 4 12" />
        <path d="M4 4.8v3.8h3.8" />
      </>
    ),
    focus: (
      <>
        <path d="M12 19.6c3-2.2 4.5-5 4.5-8.5 0-2.1-.7-4-2-5.6-1.5 1.2-2.3 2.9-2.5 5.1-.2-2.2-1.1-3.9-2.5-5.1-1.3 1.6-2 3.5-2 5.6 0 3.5 1.5 6.3 4.5 8.5Z" />
        <path d="M5.2 10.4C3.6 11.7 3 13.3 3.3 15c.4 2.3 2.4 3.8 6.1 4.4M18.8 10.4c1.6 1.3 2.2 2.9 1.9 4.6-.4 2.3-2.4 3.8-6.1 4.4" />
      </>
    ),
    progress: (
      <>
        <path d="M4 16.5 9 11l3.6 3.4L20 7" />
        <path d="M4 20h16" />
      </>
    ),
    notes: (
      <>
        <rect x="5" y="3.6" width="14" height="16.8" rx="2.4" />
        <path d="M8.4 8h7.2M8.4 11.5h7.2M8.4 15h4.4" />
      </>
    ),
    templates: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2.2" />
        <path d="M9.5 4v16M14.5 4v16M4 9.5h16M4 14.5h16" />
      </>
    ),
    settings: (
      <>
        <path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" />
        <path d="m4.9 10 .9-2.2 2 .3 1.3-1.1.2-2.1h5.4l.2 2.1 1.3 1.1 2-.3.9 2.2-1.6 1.3v1.4l1.6 1.3-.9 2.2-2-.3-1.3 1.1-.2 2.1H9.3l-.2-2.1-1.3-1.1-2 .3-.9-2.2 1.6-1.3v-1.4L4.9 10Z" />
      </>
    ),
  };

  return (
    <svg className="sidebar-nav__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[id]}
    </svg>
  );
}
