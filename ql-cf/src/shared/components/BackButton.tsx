import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { SystemIcon } from "./SystemIcon";

export function BackButton({ to, label, className = "" }: { to: string; label: string; className?: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className={`group inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink/65 transition-colors duration-150 hover:text-sage-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-deep ${className}`}
    >
      <SystemIcon icon={ChevronLeft} className="!h-6 !w-6" />
    </Link>
  );
}
