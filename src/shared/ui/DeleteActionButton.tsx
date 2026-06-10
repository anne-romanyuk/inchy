import type { ButtonHTMLAttributes, ReactNode } from "react";

type DeleteActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function DeleteActionButton({ children, className = "", type = "button", ...props }: DeleteActionButtonProps) {
  return (
    <button
      type={type}
      className={`goal-ghost-button goal-ghost-button--danger task-modal__delete delete-action-button ${className}`.trim()}
      {...props}
    >
      <svg className="task-modal__delete-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M8 8.5h8" />
        <path d="M10 8.5V6.8c0-.6.5-1.1 1.1-1.1h1.8c.6 0 1.1.5 1.1 1.1v1.7" />
        <path d="m9 10.5.5 7.7c.1.8.7 1.3 1.5 1.3h2c.8 0 1.4-.5 1.5-1.3l.5-7.7" />
        <path d="m11.2 12.3.2 4.7M12.8 12.3l-.2 4.7" />
      </svg>
      {children}
    </button>
  );
}
