import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/context/useAuth";
import { useSalonBranding } from "@/shared/context/SalonBrandingContext";
import { PasswordVisibilityButton } from "@/shared/components/PasswordVisibilityButton";
import { SalonLogoImage } from "@/shared/components/SalonLogoImage";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [credentialsError, setCredentialsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { loginWithUsername, } = useAuth();
  const { logoDataUrl } = useSalonBranding();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setFieldErrors({});
    setCredentialsError(false);
    if (!username.trim()) {
      setFieldErrors({ username: "Please enter your username." });
      return;
    }
    if (!password) {
      setFieldErrors({ password: "Please enter your password." });
      return;
    }
    setIsSubmitting(true);

    try {
      const profile = await loginWithUsername({ username, password });
      navigate(profile.accountRole === "admin" ? "/lyn-co/admin" : "/lyn-co/staff");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed.";
      const isCredentialError = /password|username|credential/i.test(message);
      setCredentialsError(isCredentialError);
      setFieldErrors({ password: isCredentialError ? "Username or password is incorrect." : message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page flex min-h-screen items-center justify-center bg-[var(--app-canvas)] p-2.5 sm:p-4">
      <style>{`
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px var(--app-canvas) inset;
          -webkit-text-fill-color: var(--color-ink);
          caret-color: var(--color-ink);
          transition: background-color 9999s ease-out;
        }
      `}</style>

      <div className="login-card flex w-full max-w-[420px] flex-col items-center justify-start gap-1 overflow-hidden rounded-[24px] bg-white px-2 pb-3 pt-2 shadow-[0_16px_28px_rgba(0,0,0,0.12)] sm:gap-1 sm:px-3 sm:pb-4 sm:pt-3 lg:min-h-[496px] lg:max-w-[846px] lg:flex-row lg:justify-between lg:gap-0 lg:p-5">
        <div className="login-logo-panel flex h-28 w-full max-w-[240px] shrink-0 items-center justify-center overflow-hidden rounded-[24px] bg-white p-2 lg:aspect-square lg:h-auto lg:max-w-[417px] lg:p-4 lg:w-[55%]">
          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[18px] bg-white p-2 lg:p-[30px]">
            {logoDataUrl ? (
              <SalonLogoImage src={logoDataUrl} alt="Salon logo" className="h-full w-full rounded-2xl object-contain" />
            ) : (
              <div className="text-center text-ink">
                <div aria-hidden="true" className="font-display text-5xl font-semibold tracking-tight">L&amp;C</div>
                <p className="mt-2 text-sm font-medium">Lyn &amp; Co Salon and Spa</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full items-center justify-center lg:w-[45%]">
          <div className="w-full max-w-[240px]">
            <h1 className="mb-2 text-center font-display text-lg font-semibold text-ink lg:mb-3">
              {location.pathname === "/lyn-co/login" ? "Lyn & Co sign in" : "Sign in"}
            </h1>

            <form onSubmit={handleSubmit} noValidate autoComplete="off" className="space-y-2 lg:space-y-2.5">
              <div className={`login-field-control relative h-12 rounded-[10px] border bg-white transition focus-within:border-[#777] focus-within:ring-1 focus-within:ring-[#999]/20 ${fieldErrors.username || credentialsError ? "has-error border-danger" : "border-[#d6d6d6]"}`}>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setFieldErrors({});
                    setCredentialsError(false);
                  }}
                  placeholder=" "
                  autoComplete="off"
                  required
                  aria-invalid={Boolean(fieldErrors.username || credentialsError)}
                  aria-describedby={fieldErrors.username ? "username-error" : credentialsError ? "password-error" : undefined}
                  className="peer h-full w-full appearance-none bg-transparent px-4 py-3 text-sm leading-5 text-ink outline-none"
                />
                <label htmlFor="username" className="login-field-label pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 px-1 text-sm text-[#999] transition-all duration-150 peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:bg-white peer-focus:text-[10px] peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:bg-white peer-[:not(:placeholder-shown)]:text-[10px]">
                  Username
                </label>
              </div>
              {fieldErrors.username && <p id="username-error" role="alert" className="login-field-error -mt-2 text-xs text-danger">{fieldErrors.username}</p>}

              <div className={`login-field-control relative h-12 rounded-[10px] border bg-white transition focus-within:border-[#777] focus-within:ring-1 focus-within:ring-[#999]/20 ${fieldErrors.password ? "has-error border-danger" : "border-[#d6d6d6]"}`}>
               <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFieldErrors({});
                    setCredentialsError(false);
                  }}
                  placeholder=" "
                  autoComplete="new-password"
                  required
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? "password-error" : undefined}
                  className="peer h-full w-full appearance-none rounded-[10px] bg-transparent px-4 py-3 pr-11 text-sm leading-5 text-ink outline-none"
                />
                <label htmlFor="password" className="login-field-label pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 px-1 text-sm text-[#999] transition-all duration-150 peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:bg-white peer-focus:text-[10px] peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:bg-white peer-[:not(:placeholder-shown)]:text-[10px]">
                  Password
                </label>
                <PasswordVisibilityButton
                  visible={showPassword}
                  onToggle={() => setShowPassword((previous) => !previous)}
                />
              </div>
              {fieldErrors.password && <p id="password-error" role="alert" className="login-field-error -mt-2 text-xs text-danger">{fieldErrors.password}</p>}

              <button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="keep-black-submit !mt-4 mb-1 block h-11 w-full appearance-none rounded-[9px] bg-[#252525] py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-[#111] disabled:cursor-wait disabled:opacity-50"
              >
                <span aria-live="polite">{isSubmitting ? "Signing in..." : "Sign in"}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}