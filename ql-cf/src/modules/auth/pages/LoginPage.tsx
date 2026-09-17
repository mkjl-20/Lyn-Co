import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/context/AuthContext";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { loginWithUsername, } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent) {
  event.preventDefault();
  setErrorMessage(null);
  setIsSubmitting(true);

  try {
    const profile = await loginWithUsername({ username, password });
    navigate(profile.accountRole === "admin" ? "/admin" : "/staff");
  } catch (error) {
    setErrorMessage(error instanceof Error ? error.message : "Login failed.");
  } finally {
    setIsSubmitting(false);
  }
}

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist p-3 sm:p-6">
      {/* Hide native browser password-reveal icons (Edge/Chrome) so only our custom eye button shows */}
      <style>{`
        input[type="password"]::-ms-reveal,
        input[type="password"]::-ms-clear {
          display: none;
        }
        input[type="password"]::-webkit-credentials-auto-fill-button,
        input[type="password"]::-webkit-strong-password-auto-fill-button {
          visibility: hidden;
          display: none !important;
        }
      `}</style>

      <div className="flex w-full max-w-[846px] min-h-[clamp(380px,90vh,460px)] flex-col gap-3 overflow-hidden rounded-2xl bg-white shadow-xl sm:gap-4 sm:rounded-3xl lg:flex-row">
        {/* Left — brand panel: banner on mobile (image goes here later), side panel on desktop */}
        <div className="relative flex h-32 w-full flex-col items-center justify-center overflow-hidden rounded-2xl bg-white p-4 text-center text-white xs:h-36 sm:h-44 sm:rounded-3xl sm:p-6 lg:h-auto lg:w-3/5 lg:p-10">
          {/* Decorative shapes — sit behind everything in this panel */}

          {/* Inset framed design element — gives the empty panel real structure */}
          <div className="relative z-20 flex h-full w-full items-center justify-center rounded-xl border border-white/20 bg-sage p-3 sm:rounded-2xl sm:p-4 lg:rounded-3xl lg:p-6">
            {/* TODO: image goes here — will replace this inner frame's content */}
          </div>
        </div>

        {/* Right — login form */}
        <div className="relative flex w-full flex-col items-center justify-center overflow-hidden px-4 py-6 xs:px-5 sm:px-10 sm:py-10 lg:w-2/5 lg:px-16 lg:py-16 [@media(max-height:550px)]:py-4">
          {/* Decorative shape — sits behind the form content */}
          {/* Form content — sits above the decorative shapes */}
          <div className="relative z-10 w-full max-w-[320px] sm:max-w-[280px]">
            <h1 className="mb-4 text-center font-display text-base font-semibold text-ink sm:mb-6 sm:text-lg">
              Sign in to LynQ
            </h1>

            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMessage && (
                <p role="alert" className="text-center text-xs text-clay">
                  {errorMessage}
                </p>
              )}

              {/* Username — floating label */}
              <div className="relative rounded-lg border border-mist bg-porcelain/40">
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder=" "
                  autoComplete="username"
                  required
                  className="peer w-full bg-transparent px-3 pb-2 pt-4 text-base text-ink outline-none sm:text-sm"
                />
                <label
                  htmlFor="username"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 px-1 text-sm text-ink/40 transition-all duration-150
                    peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-[10px]
                    peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-[10px]"
                >
                  Username
                </label>
              </div>

              {/* Password — floating label */}
              <div className="relative rounded-lg border border-mist bg-porcelain/40">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder=" "
                  autoComplete="current-password"
                  required
                  className="peer w-full bg-transparent px-3 pb-2 pt-4 pr-9 text-base text-ink outline-none sm:text-sm"
                />
                <label
                  htmlFor="password"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 px-1 text-sm text-ink/40 transition-all duration-150
                    peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-[10px]
                    peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-[10px]"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  title={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-ink/40 transition-colors hover:bg-sage-light hover:text-sage-deep focus:outline-none focus:ring-2 focus:ring-sage-light"
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="1.8" />
                      <path
                        d="M10.6 6.3A9.8 9.8 0 0 1 12 6c6 0 9 6 9 6a16 16 0 0 1-2.6 3.6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                      <path
                        d="M6.7 8.7A15.9 15.9 0 0 0 3 12s3 6 9 6c1.1 0 2.2-.2 3.2-.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path
                        d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                  )}
                </button>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="!mt-6 w-full rounded-lg bg-sage-deep py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 sm:!mt-5 sm:py-2"
              >
                {isSubmitting ? "Signing in…" : "Log in"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}