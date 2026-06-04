import { NavLink, Outlet, useNavigate } from "react-router-dom";
import type { PublicUser } from "../../shared/schemas";
import { sidebarItems } from "./sidebar";
import { SidebarIcon } from "../shared/ui/SidebarIcon";
import { Character } from "../shared/ui/Avatar";
import { useLogout } from "../features/auth/useCurrentUser";
import { useTheme, type ThemeMode } from "../shared/hooks/useTheme";

// The mascot is no longer user-selectable — its colour follows the theme:
// violet on Light, blue on Dream & Moon, green on Forest.
const MASCOT_BY_THEME: Record<ThemeMode, string> = {
  light: "avatar-1",
  dream: "avatar-3",
  moon: "avatar-3",
  forest: "avatar-forest",
};

const LOADING_USER: PublicUser = {
  id: "loading",
  name: "",
  email: "",
  avatarId: null,
  needsAvatar: false,
};

export function loadingShellUser() {
  return LOADING_USER;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}

export function AppShell({ user }: { user: PublicUser }) {
  const navigate = useNavigate();
  const [theme] = useTheme();
  const logout = useLogout();

  const displayAvatarId = MASCOT_BY_THEME[theme] ?? "avatar-1";
  const displayName = firstName(user.name);

  const handleLogout = async () => {
    await logout.mutateAsync();
    navigate("/", { replace: true });
  };

  return (
    <section className="home-page" aria-label="Home page">
      {theme === "moon" ? (
        <div className="moon-theme-background" aria-hidden="true">
          <img className="moon-theme-background__stars" src="/theme-moon/star-field.svg" alt="" />
          <img className="moon-theme-background__moon" src="/theme-moon/moon-corner.svg" alt="" />
        </div>
      ) : null}
      <div className="home-content">
        <aside className="app-sidebar" aria-label="Sidebar">
          <div className="sidebar-brand">
            <span className="sidebar-brand__greeting">
              <span className="sidebar-brand__hello">
                Hello{displayName ? ", " : ""}{displayName && <strong>{displayName}</strong>}
              </span>
              <span className="sidebar-brand__tagline">New day, new progress</span>
            </span>
          </div>
          <nav className="sidebar-nav" aria-label="Main menu">
            {sidebarItems.map((item) =>
              item.disabled ? (
                <button
                  type="button"
                  className="sidebar-nav__item is-disabled"
                  key={item.id}
                  disabled
                  aria-disabled="true"
                >
                  <SidebarIcon id={item.id} />
                  <span>{item.label}</span>
                </button>
              ) : (
                <NavLink
                  className={({ isActive }) => (isActive ? "sidebar-nav__item is-active" : "sidebar-nav__item")}
                  to={item.path}
                  key={item.id}
                  end={item.path === "/today"}
                >
                  <SidebarIcon id={item.id} />
                  <span>{item.label}</span>
                </NavLink>
              ),
            )}
            <button
              type="button"
              className="sidebar-nav__item sidebar-nav__logout"
              onClick={handleLogout}
              disabled={logout.isPending}
            >
              <LogoutSidebarIcon />
              <span>{logout.isPending ? "Logging out" : "Logout"}</span>
            </button>
          </nav>
          {theme === "moon" ? (
            <img className="sidebar-moon-decor" src="/theme-moon/sidebar-moon-garden.svg" alt="" aria-hidden="true" />
          ) : null}
          <div className="sidebar-character" aria-hidden="true">
            <Character avatarId={displayAvatarId} />
          </div>
        </aside>

        <div className="tasks-shell">
          <Outlet />
        </div>
      </div>
    </section>
  );
}

function LogoutSidebarIcon() {
  return (
    <svg className="sidebar-nav__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10 6.2H6.8a2 2 0 0 0-2 2v7.6a2 2 0 0 0 2 2H10" />
      <path d="M13.5 8.2 17.3 12l-3.8 3.8" />
      <path d="M8.8 12h8.3" />
    </svg>
  );
}
