import { NavLink, Outlet } from "react-router-dom";
import { SidebarIcon } from "../shared/ui/SidebarIcon";
import type { SidebarItemId } from "./sidebar";

// The mobile chrome: a full-screen flex column with the routed page in a single
// internally-scrolling content area and a thumb-reachable bottom tab bar
// instead of the desktop sidebar. Each page supplies its own header.
//
// The first three tabs reuse the sidebar's icons (sun / target / leaf). "More"
// is a placeholder that lands on Notes for now — it will open a sheet with the
// secondary destinations (Notes, History, Settings, Profile, Logout) later.
type Tab =
  | { id: SidebarItemId; label: string; path: string; more?: false }
  | { id: "more"; label: string; path: string; more: true };

const TABS: Tab[] = [
  { id: "today", label: "Today", path: "/today" },
  { id: "goals", label: "Goals", path: "/goals" },
  { id: "focus", label: "Focus", path: "/focus" },
  { id: "more", label: "More", path: "/notes", more: true },
];

function MoreIcon() {
  return (
    <svg className="sidebar-nav__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
    </svg>
  );
}

export function MobileShell() {
  return (
    <div className="mobile-shell">
      <main className="mobile-shell__content">
        <Outlet />
      </main>
      <nav className="mobile-tabbar" aria-label="Main menu">
        {TABS.map((tab) => (
          <NavLink
            key={tab.id}
            to={tab.path}
            end={tab.path === "/today"}
            className={({ isActive }) =>
              isActive ? "mobile-tabbar__item is-active" : "mobile-tabbar__item"
            }
          >
            <span className="mobile-tabbar__icon">
              {tab.more ? <MoreIcon /> : <SidebarIcon id={tab.id} />}
            </span>
            <span className="mobile-tabbar__label">{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
