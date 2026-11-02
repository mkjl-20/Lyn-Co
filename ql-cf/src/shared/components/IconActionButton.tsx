import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { SystemIcon } from "./SystemIcon";

export function IconActionButton({
  icon,
  label,
  className = "",
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button
      {...buttonProps}
      type={buttonProps.type ?? "button"}
      aria-label={label}
      title={label}
      className={`system-icon-action ${className}`}
    >
      <SystemIcon icon={icon} />
    </button>
  );
}
