import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabaseClient } from "@/shared/lib/supabaseClient";
import { apiRequest } from "@/shared/lib/apiClient";
import { BackButton } from "@/shared/components/BackButton";
import { PasswordVisibilityButton } from "@/shared/components/PasswordVisibilityButton";
import { PortalAccountMenu } from "@/shared/components/PortalAccountMenu";
import { useAuth } from "@/shared/context/AuthContext";

type AccountMode = "login" | "register" | "verify-signup" | "verify-password" | "verify-phone-link" | "set-password" | "privacy-consent";

const CUSTOMER_ACCOUNT_PRIVACY_NOTICE_VERSION = "customer-account-v1";

interface CustomerTransaction {
  id: string;
  ticket_number: string | null;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  payment_method: string;
  created_at: string;
  pos_transaction_items: { service_name: string; quantity: number }[];
}

function normalizePhilippinePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^09\d{9}$/.test(digits)) return { local: digits, international: `+63${digits.slice(1)}` };
  if (/^639\d{9}$/.test(digits)) return { local: `0${digits.slice(2)}`, international: `+${digits}` };
  return null;
}

export function CustomerAccountPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading, logout } = useAuth();
  const customerUser = user?.user_metadata?.account_role === "customer" ? user : null;
  const customerName = String(customerUser?.user_metadata?.full_name ?? customerUser?.email?.split("@")[0] ?? "Customer");
  const customerPhone = String(
    customerUser?.user_metadata?.contact_number
      ?? normalizePhilippinePhone(customerUser?.phone ?? "")?.local
      ?? "Not provided",
  );
  const [mode, setMode] = useState<AccountMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [privacyConsentAccepted, setPrivacyConsentAccepted] = useState(false);
  const [pendingAccountSetup, setPendingAccountSetup] = useState<{ displayName: string; contactNumber: string } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingPhone, setPendingPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [accountPrivacyChecking, setAccountPrivacyChecking] = useState(Boolean(customerUser));
  const [accountPrivacyError, setAccountPrivacyError] = useState<string | null>(null);

  async function handleCustomerSignOut() {
    await logout();
    navigate("/");
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      if (!session) return;
      if (active) setTransactionsLoading(true);
      const sessionUser = session.user;
      if (sessionUser.user_metadata?.account_role === "customer") {
        if (active) setAccountPrivacyChecking(true);
        let status: { privacyConsentRequired: boolean };
        try {
          status = await apiRequest<{ privacyConsentRequired: boolean }>("/api/customer/account");
        } catch (error) {
          if (active) {
            setAccountPrivacyError(error instanceof Error ? error.message : "Unable to check your account privacy settings.");
            setAccountPrivacyChecking(false);
          }
          return;
        }
        if (active && status.privacyConsentRequired) {
          setPendingAccountSetup({
            displayName: typeof sessionUser.user_metadata?.full_name === "string" ? sessionUser.user_metadata.full_name : "",
            contactNumber: typeof sessionUser.user_metadata?.contact_number === "string"
              ? sessionUser.user_metadata.contact_number
              : normalizePhilippinePhone(sessionUser.phone ?? "")?.local ?? "",
          });
          setMode("privacy-consent");
          return;
        }
      }
      if (active) setAccountPrivacyChecking(false);
      const response = await apiRequest<{ transactions: CustomerTransaction[] }>("/api/customer/transactions");
      if (active) setTransactions(response.transactions);
    })()
      .catch((error: unknown) => {
        if (active) {
          setTransactionsError(error instanceof Error ? error.message : "Unable to load transaction history.");
          setAccountPrivacyChecking(false);
        }
      })
      .finally(() => {
        if (active) setTransactionsLoading(false);
      });
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("set-password");
        setMessage("Choose a new password for your account.");
        setErrorMessage(null);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function sendPasswordVerification(phoneValue: string, flow: "reset" | "change") {
    const normalizedIdentifier = phoneValue.trim().toLowerCase();
    if (flow === "reset" && normalizedIdentifier.includes("@")) {
      if (isSendingCode) return;
      setIsSendingCode(true);
      setErrorMessage(null);
      setMessage(null);
      try {
        const response = await apiRequest<{ message: string }>("/api/auth/password-reset", {
          method: "POST",
          body: JSON.stringify({ email: normalizedIdentifier }),
        });
        setMessage(response.message);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to process the password reset request.");
      } finally {
        setIsSendingCode(false);
      }
      return;
    }

    const phone = normalizePhilippinePhone(phoneValue);
    if (!phone || isSendingCode) {
      if (!phone) setErrorMessage("Enter a valid Philippine mobile number.");
      return;
    }

    setIsSendingCode(true);
    setErrorMessage(null);
    setMessage(null);
    try {
      const { error } = await supabaseClient.auth.signInWithOtp({
        phone: phone.international,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      setPendingPhone(phone.local);
      setVerificationCode("");
      setMode("verify-password");
      setMessage(`A verification code was sent to ${phone.local}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to send a verification code.");
    } finally {
      setIsSendingCode(false);
    }
  }

  async function handleResendCode() {
    const phone = normalizePhilippinePhone(pendingPhone);
    if (!phone || isSendingCode) return;
    setIsSendingCode(true);
    setErrorMessage(null);
    setMessage(null);
    try {
      const { error } = mode === "verify-phone-link"
        ? await supabaseClient.auth.updateUser({ phone: phone.international })
        : await supabaseClient.auth.signInWithOtp({
            phone: phone.international,
            options: { shouldCreateUser: false },
          });
      if (error) throw error;
      setMessage(`A new verification code was sent to ${phone.local}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to resend the verification code.");
    } finally {
      setIsSendingCode(false);
    }
  }

  async function beginPasswordChange() {
    const linkedPhone = normalizePhilippinePhone(customerUser?.phone ?? "");
    if (linkedPhone) {
      await sendPasswordVerification(linkedPhone.local, "change");
      return;
    }

    const accountPhone = normalizePhilippinePhone(customerPhone);
    if (!accountPhone || !customerUser) {
      setErrorMessage("Add a valid mobile number to your customer account before changing the password.");
      return;
    }
    if (isSendingCode) return;

    setIsSendingCode(true);
    setErrorMessage(null);
    setMessage(null);
    try {
      const { error } = await supabaseClient.auth.updateUser({ phone: accountPhone.international });
      if (error) throw error;
      setPendingPhone(accountPhone.local);
      setVerificationCode("");
      setMode("verify-phone-link");
      setMessage(`Verify ${accountPhone.local} by SMS to link it to your account and change your password.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to verify your mobile number.");
    } finally {
      setIsSendingCode(false);
    }
  }

  async function finishAccountSetup(
    user: { user_metadata?: Record<string, unknown>; phone?: string | null },
    acceptedPrivacyNotice = false,
  ) {
    const accountDetails = {
      displayName: displayName.trim() || user.user_metadata?.full_name,
      contactNumber: contactNumber.trim()
        || (typeof user.user_metadata?.contact_number === "string" ? user.user_metadata.contact_number : "")
        || normalizePhilippinePhone(user.phone ?? "")?.local,
    };
    if (!acceptedPrivacyNotice) {
      let status: { privacyConsentRequired: boolean };
      try {
        status = await apiRequest<{ privacyConsentRequired: boolean }>("/api/customer/account");
      } catch (error) {
        setAccountPrivacyError(error instanceof Error ? error.message : "Unable to check your account privacy settings.");
        throw error;
      } finally {
        setAccountPrivacyChecking(false);
      }
      if (status.privacyConsentRequired) {
        setPendingAccountSetup({
          displayName: String(accountDetails.displayName ?? ""),
          contactNumber: String(accountDetails.contactNumber ?? ""),
        });
        setPrivacyConsentAccepted(false);
        setMode("privacy-consent");
        return;
      }
      navigate("/");
      return;
    }

    await apiRequest("/api/customer/account", {
      method: "POST",
      body: JSON.stringify({
        ...accountDetails,
        privacyConsent: true,
        privacyNoticeVersion: CUSTOMER_ACCOUNT_PRIVACY_NOTICE_VERSION,
      }),
    });
    setAccountPrivacyChecking(false);
    navigate("/");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      if (mode === "verify-signup" || mode === "verify-password" || mode === "verify-phone-link") {
        const phone = normalizePhilippinePhone(pendingPhone);
        if (!phone || !/^\d{6}$/.test(verificationCode)) {
          setErrorMessage("Enter the six-digit SMS verification code.");
          return;
        }
        const { data, error } = await supabaseClient.auth.verifyOtp({
          phone: phone.international,
          token: verificationCode,
          type: mode === "verify-phone-link" ? "phone_change" : "sms",
        });
        if (error) throw error;
        if (!data.user) throw new Error("The verification code was accepted, but no account session was returned.");

        if (mode === "verify-signup") {
          await finishAccountSetup(data.user, true);
        } else {
          setMode("set-password");
          setPassword("");
          setConfirmPassword("");
          setMessage(mode === "verify-phone-link"
            ? "Your mobile number is verified and linked. Choose a new password."
            : "Your number is verified. Choose a new password.");
        }
      } else if (mode === "set-password") {
        if (password.length < 8) {
          setErrorMessage("Password must be at least 8 characters.");
          return;
        }
        if (password !== confirmPassword) {
          setErrorMessage("The passwords do not match.");
          return;
        }
        const { error } = await supabaseClient.auth.updateUser({ password });
        if (error) throw error;
        await supabaseClient.auth.signOut();
        setMode("login");
        setPassword("");
        setConfirmPassword("");
        setPendingPhone("");
        setIdentifier("");
        setMessage("Your password has been updated. Sign in with your mobile number and new password.");
      } else if (mode === "privacy-consent") {
        if (!privacyConsentAccepted) {
          setErrorMessage("Review the privacy notice and check the box to continue.");
          return;
        }
        await apiRequest("/api/customer/account", {
          method: "POST",
          body: JSON.stringify({
            ...pendingAccountSetup,
            privacyConsent: true,
            privacyNoticeVersion: CUSTOMER_ACCOUNT_PRIVACY_NOTICE_VERSION,
          }),
        });
        navigate("/");
      } else if (mode === "register") {
        const phone = normalizePhilippinePhone(contactNumber);
        if (!displayName.trim() || !phone) {
          setErrorMessage("Enter your name and a valid Philippine mobile number.");
          return;
        }
        if (!privacyConsentAccepted) {
          setErrorMessage("Review and accept the customer-account privacy notice before continuing.");
          return;
        }
        const { data, error } = await supabaseClient.auth.signUp({
          phone: phone.international,
          password,
          options: {
            data: {
              account_role: "customer",
              full_name: displayName.trim(),
              contact_number: phone.local,
              contact_email: contactEmail.trim().toLowerCase() || null,
            },
          },
        });
        if (error) throw error;
        if (!data.user) throw new Error("Unable to create your customer account.");
        setPendingPhone(phone.local);
        setVerificationCode("");
        if (data.session) {
          await supabaseClient.auth.signOut();
          setMode("login");
          throw new Error("Phone verification is not enforced by the current Supabase Auth settings. Enable phone confirmations and configure an SMS provider before customer registration.");
        }
        setMode("verify-signup");
        setMessage(`We sent a verification code to ${phone.local}. Enter it to finish creating your account.`);
      } else {
        const loginPhone = normalizePhilippinePhone(identifier);
        const isEmailLogin = identifier.trim().includes("@");
        if (!loginPhone && !isEmailLogin) {
          setErrorMessage("Enter a valid Philippine mobile number. Existing accounts may still use their email.");
          return;
        }
        const { data, error } = loginPhone
          ? await supabaseClient.auth.signInWithPassword({ phone: loginPhone.international, password })
          : await supabaseClient.auth.signInWithPassword({ email: identifier.trim().toLowerCase(), password });
        if (error) throw error;
        if (!data.user) throw new Error("Unable to sign in.");
        setAccountPrivacyChecking(true);
        await finishAccountSetup(data.user);
      }
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Unable to process your account.";
      setErrorMessage(errorText);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="customer-gradient-page flex min-h-screen items-center justify-center px-4 py-10 text-ink">
      <section className="w-full max-w-md rounded-2xl border border-mist bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <BackButton to="/" label="Back to booking" />
          {customerUser && mode === "login" && (
            <PortalAccountMenu
              fullName={customerName}
              identifier={customerUser.email ?? "Customer account"}
              roleLabel="Customer"
              isActive
              accountHref="/customer-account"
              onSignOut={handleCustomerSignOut}
            />
          )}
        </div>
        {authLoading && !customerUser && (
          <p role="status" className="mt-6 text-sm text-ink/60">Loading your account…</p>
        )}
        {customerUser && mode === "login" && accountPrivacyChecking ? (
          <p role="status" className="mt-6 text-sm text-ink/60">Checking your account privacy settings…</p>
        ) : customerUser && mode === "login" && accountPrivacyError ? (
          <p role="alert" className="mt-6 rounded-lg bg-clay-light px-3 py-2 text-sm text-clay">
            {accountPrivacyError} Refresh the page to retry before viewing your account.
          </p>
        ) : customerUser && mode === "login" ? (
          <section aria-labelledby="customer-account-title" className="mt-6">
            <h1 id="customer-account-title" className="font-display text-2xl font-semibold">Your customer account</h1>
            <p className="mt-2 text-sm text-ink/60">Your saved contact details and salon visit history.</p>
            <dl className="mt-5 space-y-3 rounded-xl border border-mist bg-porcelain/40 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink/60">Name</dt>
                <dd className="text-right font-medium">{customerName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink/60">Email</dt>
                <dd className="break-all text-right font-medium">
                  {customerUser.email ?? customerUser.user_metadata?.contact_email ?? "Not provided"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink/60">Mobile number</dt>
                <dd className="text-right font-medium">{customerPhone}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => void beginPasswordChange()}
              disabled={isSendingCode || customerPhone === "Not provided"}
              className="mt-4 w-full rounded-lg border border-sage-deep px-4 py-2.5 text-sm font-semibold text-sage-deep transition-colors hover:bg-sage-light disabled:opacity-50"
            >
              {isSendingCode ? "Sending verification code…" : "Change password"}
            </button>
          </section>
        ) : !authLoading || mode !== "login" ? (
          <>
        <h1 className="mt-6 font-display text-2xl font-semibold">
          {mode === "register" ? "Create your customer account"
            : mode === "verify-signup" ? "Verify your mobile number"
              : mode === "verify-password" ? "Confirm it’s you"
                : mode === "set-password" ? "Set a new password"
                  : mode === "privacy-consent" ? "Your privacy, clearly explained"
                  : "Customer sign in"}
        </h1>
        <p className="mt-2 text-sm text-ink/60">
          {mode === "register"
            ? "Create an account with your Philippine mobile number. We’ll send an SMS code to verify it."
            : mode === "privacy-consent"
              ? "Please review and accept this notice to finish setting up or using your customer account."
            : mode === "verify-signup" || mode === "verify-password" || mode === "verify-phone-link"
              ? `Enter the six-digit code sent to ${pendingPhone}.`
              : mode === "set-password"
                ? "Choose a password with at least 8 characters."
                : "Sign in with your mobile number. Existing accounts can also use their email."}
        </p>
        {message && <p role="status" className="mt-4 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">{message}</p>}
        {errorMessage && <p role="alert" className="mt-4 rounded-lg bg-clay-light px-3 py-2 text-sm text-clay">{errorMessage}</p>}
        {(mode === "verify-signup" || mode === "verify-password" || mode === "verify-phone-link") && (
          <button
            type="button"
            onClick={() => void handleResendCode()}
            disabled={isSendingCode}
            className="mt-3 w-full rounded-lg border border-sage-deep px-4 py-2.5 text-sm font-semibold text-sage-deep transition-colors hover:bg-sage-light disabled:opacity-50"
          >
            {isSendingCode ? "Sending code…" : "Resend SMS code"}
          </button>
        )}

        <form onSubmit={(event) => void handleSubmit(event)} className="mt-5 space-y-4">
          {mode === "register" && (
            <>
              <label className="block text-sm font-medium">
                Full name
                <input required maxLength={100} autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-mist px-3 py-2.5 text-base" />
              </label>
              <label className="block text-sm font-medium">
                Philippine mobile number
                <input required type="tel" inputMode="numeric" autoComplete="tel" maxLength={16} value={contactNumber} onChange={(event) => setContactNumber(event.target.value.replace(/[^\d+ ]/g, "").slice(0, 16))} placeholder="09XX XXX XXXX" className="mt-1.5 w-full rounded-lg border border-mist px-3 py-2.5 text-base" />
              </label>
              <label className="block text-sm font-medium">
                Email (optional)
                <input type="email" autoComplete="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} className="mt-1.5 w-full rounded-lg border border-mist px-3 py-2.5 text-base" />
              </label>
            </>
          )}
          {(mode === "register" || mode === "privacy-consent") && (
            <section aria-labelledby="account-privacy-heading" className="rounded-2xl border border-sage-deep/25 bg-sage-light/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sage-deep">Your information matters</p>
              <h2 id="account-privacy-heading" className="mt-1 font-display text-lg font-semibold">Customer account privacy notice</h2>
              <p className="mt-2 text-sm leading-6 text-ink/75">
                Under the Data Privacy Act of 2012 (Republic Act No. 10173), Lyn &amp; Co uses the information below to create and secure your account and provide customer services.
              </p>
              <details className="mt-2 text-sm text-ink/75">
                <summary className="cursor-pointer font-semibold text-sage-deep">Read how your information is used</summary>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-6">
                  <li>Your name and mobile number identify your account and support SMS verification and account recovery.</li>
                  <li>Account-linked visit and receipt history helps us provide and manage your salon services.</li>
                      <li>Access is limited to authorized personnel who need the information to provide customer services. Records are retained while needed for these services and any applicable legal requirements.</li>
                      <li>You may request access to or correction of your information, withdraw this consent, or raise a privacy concern through the salon’s published contact channels.</li>
                  <li>This consent covers account and service operations only; it does not sign you up for promotional messages.</li>
                </ul>
              </details>
              <label className="mt-4 flex cursor-pointer items-start gap-3 border-t border-sage-deep/15 pt-4 text-sm font-medium leading-6">
                <input
                  required
                  type="checkbox"
                  checked={privacyConsentAccepted}
                  onChange={(event) => setPrivacyConsentAccepted(event.target.checked)}
                  className="mt-1 size-4 accent-sage-deep"
                />
                <span>I have read this notice and consent to the use of my information for the customer-account and service purposes described above.</span>
              </label>
            </section>
          )}
          {mode === "login" && <label className="block text-sm font-medium">
            Mobile number or existing account email
            <input required autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="09XX XXX XXXX" className="mt-1.5 w-full rounded-lg border border-mist px-3 py-2.5 text-base" />
          </label>}
          {(mode === "login" || mode === "register" || mode === "set-password") && (
            <label className="block text-sm font-medium">
              {mode === "login" ? "Password" : "New password"}
              <span className="relative mt-1.5 block">
                <input required type={showPassword ? "text" : "password"} minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-mist px-3 py-2.5 pr-12 text-base" />
                <PasswordVisibilityButton visible={showPassword} onToggle={() => setShowPassword((visible) => !visible)} />
              </span>
            </label>
          )}
          {mode === "set-password" && <label className="block text-sm font-medium">
            Confirm new password
            <input required type="password" minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1.5 w-full rounded-lg border border-mist px-3 py-2.5 text-base" />
          </label>}
          {(mode === "verify-signup" || mode === "verify-password" || mode === "verify-phone-link") && <label className="block text-sm font-medium">
            Six-digit SMS code
            <input required type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))} className="mt-1.5 w-full rounded-lg border border-mist px-3 py-2.5 text-base tracking-[0.3em]" />
          </label>}
          <button type="submit" disabled={isSubmitting} className="w-full rounded-lg bg-sage-deep px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {isSubmitting ? "Please wait…" : mode === "register" ? "Send verification code"
              : mode === "verify-signup" ? "Verify number"
                : mode === "verify-password" || mode === "verify-phone-link" ? "Verify code"
                  : mode === "set-password" ? "Update password"
                    : mode === "privacy-consent" ? "Accept and continue"
                    : "Sign in"}
          </button>
        </form>

        {mode === "login" && (
          <button
            type="button"
            onClick={() => void sendPasswordVerification(identifier, "reset")}
            disabled={isSendingCode || !identifier.trim()}
            className="mt-3 w-full text-center text-sm font-semibold text-sage-deep hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSendingCode ? "Sending verification code…" : "Forgot or change password?"}
          </button>
        )}

        {(mode === "login" || mode === "register") && <p className="mt-5 text-center text-sm text-ink/65">
          {mode === "register" ? "Already have an account?" : "New to Lyn & Co?"}{" "}
          <button type="button" onClick={() => { setMode(mode === "register" ? "login" : "register"); setPrivacyConsentAccepted(false); setErrorMessage(null); setMessage(null); }} className="font-semibold text-sage-deep hover:underline">
            {mode === "register" ? "Sign in" : "Register"}
          </button>
        </p>}
        {(mode === "verify-signup" || mode === "verify-password" || mode === "verify-phone-link" || mode === "set-password") && (
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setPrivacyConsentAccepted(false);
              setVerificationCode("");
              setPassword("");
              setConfirmPassword("");
              setErrorMessage(null);
              setMessage(null);
            }}
            className="mt-4 w-full text-center text-sm font-semibold text-sage-deep hover:underline"
          >
            Cancel and return to sign in
          </button>
        )}
          </>
        ) : null}
        {transactionsLoading && <p className="mt-6 text-sm text-ink/60">Loading your transaction history…</p>}
        {transactionsError && <p role="alert" className="mt-6 text-sm text-clay">{transactionsError}</p>}
        {transactions.length > 0 && (
          <section aria-labelledby="transaction-history-title" className="mt-8 border-t border-mist pt-6">
            <h2 id="transaction-history-title" className="font-display text-lg font-semibold">Your past transactions</h2>
            <ul className="mt-3 space-y-3">
              {transactions.map((transaction) => (
                <li key={transaction.id} className="rounded-xl border border-mist p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{transaction.ticket_number ? `Ticket ${transaction.ticket_number}` : "Salon visit"}</p>
                      <p className="mt-1 text-xs text-ink/60">{new Date(transaction.created_at).toLocaleString()}</p>
                      <p className="mt-1 text-xs text-ink/70">
                        {transaction.pos_transaction_items.map((item) => `${item.service_name} × ${item.quantity}`).join(", ")}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold">₱{Number(transaction.total_amount).toFixed(2)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>
    </main>
  );
}
