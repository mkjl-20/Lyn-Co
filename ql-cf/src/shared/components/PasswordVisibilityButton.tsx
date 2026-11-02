export function PasswordVisibilityButton({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  const label = visible ? "Hide password" : "Show password";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={visible}
      title={label}
      className="dashboard-icon-control password-visibility-control absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-ink/40 transition-colors hover:text-sage-deep focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z" />
        <circle cx="12" cy="12" r="3" />
        {visible && <path d="M3 3l18 18" strokeLinecap="round" />}
      </svg>
    </button>
  );
}
