import type { InputHTMLAttributes } from "react";
import { formatPhilippinePhoneInput, normalizePhilippinePhoneInput } from "@/shared/lib/philippinePhone";

interface PhilippinePhoneInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  autoComplete?: InputHTMLAttributes<HTMLInputElement>["autoComplete"];
  required?: boolean;
  readOnly?: boolean;
}

export function PhilippinePhoneInput({
  id,
  value,
  onChange,
  className = "",
  autoComplete = "tel",
  required = false,
  readOnly = false,
}: PhilippinePhoneInputProps) {
  return (
    <div className={`phone-number-field flex min-h-11 w-full items-center overflow-hidden rounded-lg border border-mist bg-white text-ink transition focus-within:border-sage-deep focus-within:ring-1 focus-within:ring-sage-deep/20 ${readOnly ? "bg-porcelain/40" : ""} ${className}`}>
      <span aria-hidden="true" className="shrink-0 border-r border-mist px-3 text-xs font-medium tracking-wide text-ink/60">
        PH&nbsp; +63
      </span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete={autoComplete}
        required={required}
        readOnly={readOnly}
        maxLength={13}
        pattern="9[0-9]{9}"
        title="Enter the 10 digits after +63, starting with 9."
        value={formatPhilippinePhoneInput(value)}
        onChange={(event) => onChange(normalizePhilippinePhoneInput(event.target.value))}
        placeholder="9XX XXX XXXX"
        className="phone-number-input min-h-11 min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-base text-ink outline-none focus:outline-none focus:ring-0 focus:shadow-none"
      />
    </div>
  );
}
