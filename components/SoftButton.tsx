import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./SoftButton.css";

type SoftButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function SoftButton({ children, className = "", ...props }: SoftButtonProps) {
  return (
    <button className={`soft-button ${className}`.trim()} type="button" {...props}>
      {children}
    </button>
  );
}
