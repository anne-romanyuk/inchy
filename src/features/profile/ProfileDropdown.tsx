import { useEffect, useRef } from "react";
import { Avatar } from "../../shared/ui/Avatar";

export function ProfileDropdown({
  open,
  setOpen,
  avatarId,
  name,
  onLogout,
}: {
  open: boolean;
  setOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  avatarId: string;
  name: string;
  onLogout: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOut = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOut);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOut);
      document.removeEventListener("keydown", onEsc);
    };
  }, [setOpen]);

  return (
    <div ref={ref} className="profile-dropdown" data-open={open ? "true" : "false"}>
      <svg width="0" height="0" className="profile-dropdown__svg" aria-hidden="true">
        <defs>
          <filter id="profile-goo" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -8"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      <div className="profile-dropdown__blob-wrap" aria-hidden="true">
        <div className="profile-dropdown__avatar-disc" />
        <div className="profile-dropdown__panel-disc" />
      </div>

      <button
        type="button"
        className="profile-dropdown__avatar-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${name} menu`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Avatar avatarId={avatarId} name={name} />
      </button>

      <div className="profile-dropdown__menu-wrap">
        <ul className="profile-dropdown__menu" role="menu">
          <li role="none" className="profile-dropdown__item">
            <button
              role="menuitem"
              type="button"
              className="profile-dropdown__menu-btn"
              onClick={() => {
                onLogout();
                setOpen(false);
              }}
            >
              <LogoutIcon />
              <span>Logout</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}

function LogoutIcon() {
  return (
    <svg className="floating-user-menu__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10 6.2H6.8a2 2 0 0 0-2 2v7.6a2 2 0 0 0 2 2H10" />
      <path d="M13.5 8.2 17.3 12l-3.8 3.8" />
      <path d="M8.8 12h8.3" />
    </svg>
  );
}
