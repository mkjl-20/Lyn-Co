import type { LucideIcon } from "lucide-react";

export function SystemIcon({
  icon: Icon,
  className = "",
}: {
  icon: LucideIcon;
  className?: string;
}) {
  return <Icon size={18} strokeWidth={1.8} aria-hidden="true" className={className} />;
}
