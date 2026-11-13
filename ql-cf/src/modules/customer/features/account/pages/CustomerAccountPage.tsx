import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, Camera, ChevronLeft, KeyRound, Pencil, Save, ShieldCheck, UserRound } from "lucide-react";
import { supabaseClient } from "@/shared/lib/supabaseClient";
import { apiRequest } from "@/shared/lib/apiClient";
import { BackButton } from "@/shared/components/BackButton";
import { ProfileEditDialog } from "@/shared/components/ProfileEditDialog";
import { PasswordVisibilityButton } from "@/shared/components/PasswordVisibilityButton";
import { useAuth } from "@/shared/context/useAuth";
import { PhilippinePhoneInput } from "@/shared/components/PhilippinePhoneInput";
import { useFeedback } from "@/shared/components/FeedbackContext";
import { removeObsoleteProfileAvatars, uploadProfileAvatar } from "@/shared/lib/profileAvatar";

type AccountMode = "login" | "register" | "verify-signup" | "verify-email-signup" | "verify-password" | "verify-phone-link" | "verify-profile-phone" | "set-password" | "privacy-consent";
type SignupMethod = "email" | "phone";

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
  const { confirm } = useFeedback();
  const { user, loading: authLoading } = useAuth();
  const customerUser = user?.user_metadata?.account_role === "customer" ? user : null;
  const customerName = String(customerUser?.user_metadata?.full_name ?? customerUser?.email?.split("@")[0] ?? "Customer");
  const customerPhone = String(
    customerUser?.user_metadata?.contact_number
      ?? normalizePhilippinePhone(customerUser?.phone ?? "")?.local
      ?? "Not provided",
  );
  const customerContactEmail = typeof customerUser?.user_metadata?.contact_email === "string"
    ? customerUser.user_metadata.contact_email
    : customerUser?.email && !customerUser.email.endsWith("@lynq.internal") ? customerUser.email : "";
  const customerAvatarUrl = typeof customerUser?.user_metadata?.avatar_url === "string"
    ? customerUser.user_metadata.avatar_url
    : "";
  const [mode, setMode] = useState<AccountMode>("login");
  const [signupMethod, setSignupMethod] = useState<SignupMethod>("email");
  const [displayName, setDisplayName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [privacyConsentAccepted, setPrivacyConsentAccepted] = useState(false);
  const [pendingAccountSetup, setPendingAccountSetup] = useState<{ displayName: string; contactNumber: string } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const verificationInputRefs = useRef<Array<HTMLInputElement | null>>([]);
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
  const [isEditingCustomerAccount, setIsEditingCustomerAccount] = useState(false);
  const [customerProfileName, setCustomerProfileName] = useState("");
  const [customerProfilePhone, setCustomerProfilePhone] = useState("");
  const [isSavingCustomerProfile, setIsSavingCustomerProfile] = useState(false);
  const [pendingProfileUpdate, setPendingProfileUpdate] = useState<{
    displayName: string;
    contactNumber: string;
    contactEmail: string;
    avatarFile: File | null;
    removeAvatar: boolean;
  } | null>(null);
  const [customerProfileEmail, setCustomerProfileEmail] = useState("");
  const [customerAvatarFile, setCustomerAvatarFile] = useState<File | null>(null);
  const [customerAvatarPreview, setCustomerAvatarPreview] = useState("");
  const [removeCustomerAvatar, setRemoveCustomerAvatar] = useState(false);
  const isVerificationMode = mode === "verify-signup"
    || mode === "verify-email-signup"
    || mode === "verify-password"
    || mode === "verify-phone-link"
    || mode === "verify-profile-phone"
    || mode === "set-password";

  async function handleCancelVerification() {
    if (!await confirm({
      title: "Cancel verification?",
      message: "Your verification will be stopped and the code you entered will be cleared.",
      confirmLabel: "Cancel verification",
      cancelLabel: "Keep verifying",
      destructive: true,
    })) return;

    setVerificationCode("");
    setPendingPhone("");
    setPendingEmail("");
    setPendingProfileUpdate(null);
    setPassword("");
    setConfirmPassword("");
    setPrivacyConsentAccepted(false);
    setErrorMessage(null);
    setMessage(null);
    if (customerUser) {
      setMode("login");
    } else {
      setMode("login");
      navigate("/");
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      if (!session) return;
      if (active) setTransactionsLoading(true);
      const sessionUser = session.user;
      if (sessionUser.user_metadata?.account_role !== "customer") {
        if (active) {
          setTransactionsLoading(false);
          setAccountPrivacyChecking(false);
        }
        return;
      }

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
    if (mode === "verify-email-signup") {
      if (!pendingEmail || isSendingCode) return;
      setIsSendingCode(true);
      setErrorMessage(null);
      setMessage(null);
      try {
        const { error } = await supabaseClient.auth.resend({ type: "signup", email: pendingEmail });
        if (error) throw error;
        setMessage(`A new confirmation email was sent to ${pendingEmail}.`);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to resend the verification code.");
      } finally {
        setIsSendingCode(false);
      }
      return;
    }

    const phone = normalizePhilippinePhone(pendingPhone);
    if (!phone || isSendingCode) return;
    setIsSendingCode(true);
    setErrorMessage(null);
    setMessage(null);
    try {
      const { error } = mode === "verify-phone-link" || mode === "verify-profile-phone"
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
    if (!await confirm({
      title: "Change your password?",
      message: "We’ll send a verification code or reset link so you can set a new password. Continue?",
      confirmLabel: "Continue",
      cancelLabel: "Not now",
    })) return;

    const linkedPhone = normalizePhilippinePhone(customerUser?.phone ?? "");
    if (linkedPhone) {
      await sendPasswordVerification(linkedPhone.local, "change");
      return;
    }

    if (customerUser?.email) {
      if (isSendingCode) return;
      setIsSendingCode(true);
      setErrorMessage(null);
      setMessage(null);
      try {
        const response = await apiRequest<{ message: string }>("/api/auth/password-reset", {
          method: "POST",
          body: JSON.stringify({ email: customerUser.email }),
        });
        setMessage(response.message);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to send a password reset link.");
      } finally {
        setIsSendingCode(false);
      }
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

  async function saveCustomerProfile(
    displayNameValue: string,
    contactNumberValue: string,
    contactEmailValue: string,
    avatarFile: File | null,
    removeAvatar: boolean,
  ) {
    if (!customerUser) throw new Error("Sign in to update your customer profile.");
    const contactEmail = contactEmailValue.trim().toLowerCase();
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      throw new Error("Enter a valid contact email address or leave it blank.");
    }
    const avatarUrl = avatarFile
      ? await uploadProfileAvatar(customerUser.id, avatarFile)
      : removeAvatar ? null : customerAvatarUrl || null;
    const response = await apiRequest<{ account: { display_name: string; contact_number: string } }>("/api/customer/account", {
      method: "PATCH",
      body: JSON.stringify({ displayName: displayNameValue, contactNumber: contactNumberValue }),
    });
    const { error } = await supabaseClient.auth.updateUser({
      data: {
        ...customerUser.user_metadata,
        full_name: response.account.display_name,
        contact_number: response.account.contact_number,
        contact_email: contactEmail || null,
        avatar_url: avatarUrl,
      },
    });
    if (error) throw error;
    await removeObsoleteProfileAvatars(customerUser.id, avatarUrl);
    setCustomerProfileName(response.account.display_name);
    setCustomerProfilePhone(response.account.contact_number);
    setCustomerProfileEmail(contactEmail);
    setCustomerAvatarFile(null);
    setCustomerAvatarPreview("");
    setRemoveCustomerAvatar(false);
    setIsEditingCustomerAccount(false);
    setPendingProfileUpdate(null);
    setMessage("Profile information updated.");
  }

  async function handleSaveCustomerProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customerUser || isSavingCustomerProfile) return;
    const name = customerProfileName.trim();
    const phone = normalizePhilippinePhone(customerProfilePhone);
    const email = customerProfileEmail.trim().toLowerCase();
    if (!name || name.length > 100 || !phone) {
      setErrorMessage("Enter your name and a valid Philippine mobile number.");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage("Enter a valid contact email address or leave it blank.");
      return;
    }
    if (!await confirm({
      title: "Save profile changes?",
      message: "Your name, contact details, and profile photo will be updated. If your phone number changed, you will verify it before the update is completed.",
      confirmLabel: "Save changes",
      cancelLabel: "Review changes",
    })) return;

    setIsSavingCustomerProfile(true);
    setErrorMessage(null);
    setMessage(null);
    try {
      const currentAuthPhone = normalizePhilippinePhone(customerUser.phone ?? "");
      if (!currentAuthPhone || currentAuthPhone.international !== phone.international) {
        const { error } = await supabaseClient.auth.updateUser({ phone: phone.international });
        if (error) throw error;
        setPendingPhone(phone.local);
        setPendingProfileUpdate({
          displayName: name,
          contactNumber: phone.local,
          contactEmail: email,
          avatarFile: customerAvatarFile,
          removeAvatar: removeCustomerAvatar,
        });
        setVerificationCode("");
        setIsEditingCustomerAccount(false);
        setMode("verify-profile-phone");
        setMessage(`Verify your new mobile number ${phone.local} to save the profile change.`);
        return;
      }
      await saveCustomerProfile(name, phone.local, email, customerAvatarFile, removeCustomerAvatar);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update your customer profile.");
    } finally {
      setIsSavingCustomerProfile(false);
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
      if (mode === "verify-email-signup") {
        const email = pendingEmail.trim().toLowerCase();
        if (!email || !/^\d{6}$/.test(verificationCode)) {
          setErrorMessage("Enter the six-digit email verification code.");
          return;
        }
        const { data, error } = await supabaseClient.auth.verifyOtp({
          email,
          token: verificationCode,
          type: "email",
        });
        if (error) throw error;
        if (!data.user) throw new Error("The verification code was accepted, but no account session was returned.");
        await finishAccountSetup(data.user, true);
      } else if (mode === "verify-signup" || mode === "verify-password" || mode === "verify-phone-link" || mode === "verify-profile-phone") {
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
          if (mode === "verify-profile-phone") {
            if (!pendingProfileUpdate) throw new Error("Your profile changes expired. Please edit and submit them again.");
            await saveCustomerProfile(
              pendingProfileUpdate.displayName,
              pendingProfileUpdate.contactNumber,
              pendingProfileUpdate.contactEmail,
              pendingProfileUpdate.avatarFile,
              pendingProfileUpdate.removeAvatar,
            );
            setMode("login");
          } else {
            setMode("set-password");
            setPassword("");
            setConfirmPassword("");
            setMessage(mode === "verify-phone-link"
              ? "Your mobile number is verified and linked. Choose a new password."
              : "Your number is verified. Choose a new password.");
          }
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
        setMessage("Your password has been updated. Sign in with your email or mobile number and new password.");
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
        if (signupMethod === "email") {
          const email = contactEmail.trim().toLowerCase();
          if (!email) {
            setErrorMessage("Enter your email address.");
            return;
          }
          if (!privacyConsentAccepted) {
            setErrorMessage("Review and accept the customer-account privacy notice before continuing.");
            return;
          }
          const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: new URL("/customer-account", window.location.origin).toString(),
              data: {
                account_role: "customer",
                full_name: displayName.trim(),
                contact_number: phone.local,
                contact_email: email,
              },
            },
          });
          if (error) throw error;
          if (!data.user) throw new Error("Unable to create your customer account.");
          if (data.session) {
            await supabaseClient.auth.signOut();
            setMode("login");
            throw new Error("Email verification is not enforced by the current Supabase Auth settings. Enable email confirmations before customer registration.");
          }
          setPendingEmail(email);
          setVerificationCode("");
          setMode("verify-email-signup");
          setMessage(`Check ${email} for a confirmation email. Follow its link, or enter the code below if one is provided.`);
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
        const { session } = await apiRequest<{ session: Session }>("/api/customer/login", {
          method: "POST",
          body: JSON.stringify({
            identifier: loginPhone?.international ?? identifier.trim().toLowerCase(),
            password,
          }),
        });
        const { data, error } = await supabaseClient.auth.setSession(session);
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
    <main className={`customer-gradient-page flex justify-center px-2 py-2 text-ink sm:px-4 sm:py-3 ${
      customerUser && mode === "login" ? "account-profile-shell h-dvh min-h-0 items-start overflow-y-auto overscroll-contain" : "min-h-screen items-center"
    }`}>
      <section className={`min-w-0 w-full ${
        customerUser && mode === "login"
          ? "max-w-[390px]"
          : mode === "login"
            ? "max-w-[360px] rounded-[1.25rem] border border-mist bg-white p-2.5 shadow-[0_18px_50px_rgba(30,35,30,0.1)] sm:p-4"
            : "max-w-[430px] rounded-[1.25rem] border border-mist bg-white p-3 shadow-[0_18px_50px_rgba(30,35,30,0.1)] sm:p-5"
      }`}>
        {authLoading && !customerUser && (
          <p role="status" className="mt-6 text-sm text-ink/60">Loading your account…</p>
        )}
        {customerUser && mode === "login" && accountPrivacyChecking ? (
          <p role="status" className="mt-6 text-sm text-ink/60">Checking your account privacy settings…</p>
        ) : customerUser && mode === "login" && accountPrivacyError ? (
          <p role="alert" className="dashboard-error-message mt-6">
            {accountPrivacyError} Refresh the page to retry before viewing your account.
          </p>
        ) : customerUser && mode === "login" ? (
          <>
            <section aria-labelledby="customer-account-title" className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
              <div className="relative h-20 bg-[var(--app-surface-soft)] sm:h-24">
                <BackButton
                  to="/"
                  label="Back to booking"
                  className="absolute left-3 top-1.5 z-10 text-ink hover:text-sage-deep sm:left-4 sm:top-2"
                />
                <span className="absolute bottom-0 left-3 z-10 flex h-14 w-14 translate-y-1/2 items-center justify-center overflow-hidden rounded-2xl border-2 border-white bg-ink text-white shadow-sm sm:left-5 sm:h-16 sm:w-16">
                  {customerAvatarUrl
                    ? <img src={customerAvatarUrl} alt="" className="h-full w-full object-cover" />
                    : <UserRound size={25} aria-hidden="true" />}
                </span>
              </div>
              <div className="px-3 pb-3 pt-7 sm:px-4 sm:pb-4 sm:pt-8">
                <div className="flex items-center justify-between gap-2">
                  <h1 id="customer-account-title" className="min-w-0 break-words font-display text-xl font-semibold leading-tight sm:text-2xl">{customerProfileName || customerName}</h1>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="Edit profile information"
                      title="Edit profile information"
                      onClick={() => {
                        setCustomerProfileName(customerName);
                        setCustomerProfilePhone(customerPhone);
                        setCustomerProfileEmail(customerContactEmail);
                        setCustomerAvatarFile(null);
                        setCustomerAvatarPreview(customerAvatarUrl);
                        setRemoveCustomerAvatar(false);
                        setErrorMessage(null);
                        setMessage(null);
                        setIsEditingCustomerAccount(true);
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-ink/10 text-ink/65 transition hover:bg-porcelain hover:text-ink"
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={isSendingCode ? "Sending password verification" : "Change password"}
                      title="Change password"
                      onClick={() => void beginPasswordChange()}
                      disabled={isSendingCode || customerPhone === "Not provided"}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-ink/10 text-ink/70 transition-colors hover:bg-porcelain hover:text-ink disabled:opacity-50"
                    >
                      <KeyRound size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <p className="mt-1 break-all text-xs text-ink/55 sm:text-sm">
                  {customerContactEmail || "Customer account"}
                </p>
                {errorMessage && <p role="alert" className="dashboard-error-message mt-3">{errorMessage}</p>}
                {message && <p role="status" className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">{message}</p>}
                <dl className="mt-3 grid gap-2 border-t border-mist pt-2.5 text-sm sm:grid-cols-2 sm:pt-3">
                  <div className="min-w-0 rounded-lg bg-[var(--app-canvas)] px-3 py-2">
                    <dt className="text-[11px] text-ink/60">Name</dt>
                    <dd className="mt-0.5 break-words font-medium">{customerProfileName || customerName}</dd>
                  </div>
                  <div className="min-w-0 rounded-lg bg-[var(--app-canvas)] px-3 py-2">
                    <dt className="text-[11px] text-ink/60">Email</dt>
                    <dd className="mt-0.5 break-all font-medium">{customerContactEmail || "Not provided"}</dd>
                  </div>
                  <div className="min-w-0 rounded-lg bg-[var(--app-canvas)] px-3 py-2 sm:col-span-2">
                    <dt className="text-[11px] text-ink/60">Mobile number</dt>
                    <dd className="mt-0.5 break-words font-medium">{customerProfilePhone || customerPhone}</dd>
                  </div>
                </dl>
              </div>
            </section>
            {isEditingCustomerAccount && (
              <ProfileEditDialog
                title="Edit profile information"
                description="Keep your contact details up to date. Email and photo are optional."
                onClose={() => setIsEditingCustomerAccount(false)}
              >
                <form onSubmit={(event) => void handleSaveCustomerProfile(event)} className="mt-4 max-h-[70dvh] space-y-3 overflow-y-auto">
                  {errorMessage && <p role="alert" className="dashboard-error-message">{errorMessage}</p>}
                  <div className="flex items-center gap-3">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-ink text-white">
                      {customerAvatarPreview
                        ? <img src={customerAvatarPreview} alt="Profile preview" className="h-full w-full object-cover" />
                        : <UserRound size={24} aria-hidden="true" />}
                    </span>
                    <div className="min-w-0">
                      <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-mist px-3 text-xs font-semibold text-ink/75 hover:bg-porcelain">
                        <Camera size={15} aria-hidden="true" />
                        Change photo
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
                              setErrorMessage("Choose a JPG, PNG, or WebP profile photo.");
                              return;
                            }
                            if (file.size > 2 * 1024 * 1024) {
                              setErrorMessage("Profile photos must be 2 MB or smaller.");
                              return;
                            }
                            setErrorMessage(null);
                            setCustomerAvatarFile(file);
                            setCustomerAvatarPreview(URL.createObjectURL(file));
                            setRemoveCustomerAvatar(false);
                          }}
                        />
                      </label>
                      {(customerAvatarPreview || customerAvatarFile) && (
                        <button type="button" onClick={() => {
                          setCustomerAvatarFile(null);
                          setCustomerAvatarPreview("");
                          setRemoveCustomerAvatar(true);
                        }} className="ml-2 text-xs font-semibold text-clay underline">
                          Remove
                        </button>
                      )}
                      <p className="mt-1 text-[11px] text-ink/50">Optional · JPG, PNG, or WebP · up to 2 MB</p>
                    </div>
                  </div>
                  <label className="block text-xs font-semibold text-ink/70">
                    Full name
                    <input required maxLength={100} value={customerProfileName} onChange={(event) => setCustomerProfileName(event.target.value)} className="dashboard-filter-control mt-1.5 w-full text-sm" />
                  </label>
                  <label className="block text-xs font-semibold text-ink/70">
                    Email <span className="font-normal text-ink/50">Optional</span>
                    <input type="email" maxLength={254} value={customerProfileEmail} onChange={(event) => setCustomerProfileEmail(event.target.value)} className="dashboard-filter-control mt-1.5 w-full text-sm" />
                  </label>
                  <label className="block text-xs font-semibold text-ink/70">
                    Mobile number
                    <PhilippinePhoneInput required value={customerProfilePhone} onChange={setCustomerProfilePhone} className="mt-1.5" />
                    <span className="mt-1 block font-normal text-ink/55">A new number must be verified by SMS.</span>
                  </label>
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setIsEditingCustomerAccount(false)} className="form-cancel-action min-h-10 rounded-lg px-4 text-sm font-semibold">
                      Cancel
                    </button>
                    <button type="submit" disabled={isSavingCustomerProfile} className="dashboard-primary-action inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50">
                      <Save size={15} aria-hidden="true" />
                      {isSavingCustomerProfile ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </form>
              </ProfileEditDialog>
            )}
          </>
        ) : !authLoading || mode !== "login" ? (
          <>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-1 font-display text-xl font-semibold leading-tight">
              {!customerUser && !isVerificationMode && <BackButton to="/" label="Back to booking" className="-ml-2" />}
              {isVerificationMode && (
                <button
                  type="button"
                  aria-label="Cancel verification and go back"
                  title="Back"
                  onClick={() => void handleCancelVerification()}
                  className="-ml-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink/65 transition-colors hover:bg-porcelain hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <ChevronLeft size={24} aria-hidden="true" />
                </button>
              )}
              {mode === "register" ? "Create your account"
            : mode === "verify-signup" ? "Verify your mobile number"
              : mode === "verify-email-signup" ? "Verify your email"
              : mode === "verify-password" ? "Confirm it’s you"
                : mode === "set-password" ? "Set a new password"
                  : mode === "privacy-consent" ? "Your privacy, clearly explained"
                  : "Sign in to your account"}
            </h1>
            {mode !== "register" && (
              <p className="mt-1 text-xs leading-5 text-ink/60">
                {mode === "privacy-consent"
                  ? "Review and accept this notice to continue."
                  : mode === "verify-signup" || mode === "verify-password" || mode === "verify-phone-link" || mode === "verify-profile-phone" || mode === "verify-email-signup"
                    ? `Enter the six-digit code sent to ${mode === "verify-email-signup" ? pendingEmail : pendingPhone}.`
                    : mode === "set-password"
                      ? "Choose a password with at least 8 characters."
                      : "Use your mobile number or email and password."}
              </p>
            )}
          </div>
          {(mode === "login" || mode === "register") && (
            <div role="group" aria-label="Account options" className="flex shrink-0 rounded-lg bg-porcelain p-1 text-[11px]">
              <button
                type="button"
                aria-pressed={mode === "register"}
                onClick={() => { setMode("register"); setPrivacyConsentAccepted(false); setErrorMessage(null); setMessage(null); }}
                className={`rounded-md px-2.5 py-1.5 font-medium transition ${mode === "register" ? "bg-white text-ink shadow-sm" : "text-ink/60 hover:text-ink"}`}
              >
                Create account
              </button>
              <button
                type="button"
                aria-pressed={mode === "login"}
                onClick={() => { setMode("login"); setPrivacyConsentAccepted(false); setErrorMessage(null); setMessage(null); }}
                className={`rounded-md px-2.5 py-1.5 font-medium transition ${mode === "login" ? "bg-white text-ink shadow-sm" : "text-ink/60 hover:text-ink"}`}
              >
                Sign in
              </button>
            </div>
          )}
        </div>
        {message && <p role="status" className="mt-4 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">{message}</p>}
        {errorMessage && <p role="alert" className="dashboard-error-message mt-4">{errorMessage}</p>}
        <form onSubmit={(event) => void handleSubmit(event)} className="mt-2 space-y-2">
          {mode === "register" && (
            <>
              <fieldset className="rounded-lg border border-mist p-2.5">
                <legend className="px-1 text-[10px] font-semibold uppercase tracking-wide text-ink/70">Sign up with</legend>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" aria-pressed={signupMethod === "email"} onClick={() => { setSignupMethod("email"); setErrorMessage(null); setMessage(null); }} className={`min-h-9 rounded-md px-2 text-xs font-semibold ${signupMethod === "email" ? "bg-sage-deep text-white" : "bg-porcelain text-ink/65"}`}>Email (e.g. Gmail)</button>
                  <button type="button" aria-pressed={signupMethod === "phone"} onClick={() => { setSignupMethod("phone"); setErrorMessage(null); setMessage(null); }} className={`min-h-9 rounded-md px-2 text-xs font-semibold ${signupMethod === "phone" ? "bg-sage-deep text-white" : "bg-porcelain text-ink/65"}`}>Phone</button>
                </div>
              </fieldset>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink/70">
                Full name
                <input required maxLength={100} autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-mist bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal" />
              </label>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink/70">
                <span className="flex items-center justify-between">Philippine mobile number <span className="font-normal normal-case tracking-normal text-ink/45">{signupMethod === "phone" ? "Used to sign in" : "For queue updates"}</span></span>
                <PhilippinePhoneInput required value={contactNumber} onChange={setContactNumber} className="mt-1.5" />
              </label>
              {signupMethod === "email" ? (
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink/70">
                  Email address
                  <input required type="email" autoComplete="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="name@gmail.com" className="mt-1.5 w-full rounded-lg border border-mist bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal placeholder:text-ink/40" />
                </label>
              ) : (
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink/70">
                  <span className="flex items-center justify-between">Email <span className="font-normal normal-case tracking-normal text-ink/45">Optional</span></span>
                  <input type="email" autoComplete="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="name@example.ph" className="mt-1.5 w-full rounded-lg border border-mist bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal placeholder:text-ink/40" />
                </label>
              )}
            </>
          )}
          {mode === "login" && <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink/70">
            Mobile number or email
            <input required autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="09XX XXX XXXX or name@example.ph" className="mt-1.5 w-full rounded-lg border border-mist bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal placeholder:text-ink/40" />
          </label>}
          {(mode === "login" || mode === "register" || mode === "set-password") && (
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink/70">
              {mode === "login" ? "Password" : "New password"}
              <span className="relative mt-1.5 block">
                <input required type={showPassword ? "text" : "password"} minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-mist bg-white px-3 py-2.5 pr-12 text-sm font-normal normal-case tracking-normal" />
                <PasswordVisibilityButton visible={showPassword} onToggle={() => setShowPassword((visible) => !visible)} />
              </span>
            </label>
          )}
          {mode === "set-password" && <label className="block text-sm font-medium">
            Confirm new password
            <input required type="password" minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1.5 w-full rounded-lg border border-mist px-3 py-2.5 text-base" />
          </label>}
          {(mode === "verify-signup" || mode === "verify-password" || mode === "verify-phone-link" || mode === "verify-profile-phone" || mode === "verify-email-signup") && (
            <fieldset className="min-w-0">
              <legend className="text-sm font-medium text-ink/75">
                {mode === "verify-email-signup" ? "Email verification code" : "SMS verification code"}
              </legend>
              <div className="mt-2 grid grid-cols-6 gap-2" role="group" aria-label="Six-digit verification code">
                {Array.from({ length: 6 }, (_, index) => (
                  <input
                    key={index}
                    ref={(element) => { verificationInputRefs.current[index] = element; }}
                    required
                    type="text"
                    inputMode="numeric"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    autoFocus={index === 0}
                    pattern="[0-9]"
                    maxLength={6}
                    value={verificationCode[index] ?? ""}
                    aria-label={`Digit ${index + 1} of 6`}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, "");
                      if (digits.length > 1) {
                        const pastedCode = digits.slice(0, 6);
                        setVerificationCode(pastedCode);
                        verificationInputRefs.current[Math.min(pastedCode.length, 5)]?.focus();
                        return;
                      }
                      const nextCode = Array.from({ length: 6 }, (_, digitIndex) =>
                        digitIndex === index ? digits : verificationCode[digitIndex] ?? ""
                      ).join("");
                      setVerificationCode(nextCode);
                      if (digits && index < 5) verificationInputRefs.current[index + 1]?.focus();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Backspace" && !verificationCode[index] && index > 0) {
                        verificationInputRefs.current[index - 1]?.focus();
                      } else if (event.key === "ArrowLeft" && index > 0) {
                        verificationInputRefs.current[index - 1]?.focus();
                      } else if (event.key === "ArrowRight" && index < 5) {
                        verificationInputRefs.current[index + 1]?.focus();
                      }
                    }}
                    className="h-12 min-w-0 rounded-lg border border-ink/15 bg-white text-center text-xl font-medium text-ink outline-none transition focus:border-ink/40 focus:ring-2 focus:ring-ink/10"
                  />
                ))}
              </div>
              <p className="mt-2 text-xs font-normal text-ink/55">
                Enter the six-digit code sent to {mode === "verify-email-signup" ? pendingEmail : pendingPhone}.
              </p>
            </fieldset>
          )}
          {(mode === "verify-signup" || mode === "verify-password" || mode === "verify-phone-link" || mode === "verify-profile-phone" || mode === "verify-email-signup") && (
            <button
              type="button"
              onClick={() => void handleResendCode()}
              disabled={isSendingCode}
              className="w-full py-2 text-sm font-medium text-ink/65 underline decoration-ink/20 underline-offset-4 transition-colors hover:text-ink disabled:opacity-50"
            >
              {isSendingCode ? "Sending code…" : mode === "verify-email-signup" ? "Resend confirmation email" : "Resend SMS code"}
            </button>
          )}
          {(mode === "login" || mode === "register" || mode === "privacy-consent") && (
            <section aria-labelledby="account-privacy-heading" className="rounded-xl border border-mist bg-porcelain/30 p-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck aria-hidden="true" size={15} className="shrink-0 text-success" />
                <h2 id="account-privacy-heading" className="text-[11px] font-semibold uppercase tracking-wide">Privacy notice</h2>
                <span className="ml-auto shrink-0 text-[9px] text-ink/45">RA 10173</span>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-ink/65">
                We use your details to manage your account and salon visits.
              </p>
              <details className="mt-1 text-[11px] text-ink/70">
                <summary className="cursor-pointer font-semibold text-ink">Learn more</summary>
                <p className="mt-1 leading-4">
                  Your name, mobile number, and visit history are used for account security and salon services. We limit access to authorized staff and do not use your details for promotional messages.
                </p>
              </details>
              {(mode === "register" || mode === "privacy-consent") && (
                <label className="mt-2 flex cursor-pointer items-center gap-2 border-t border-mist pt-2 text-[11px] leading-4 text-ink/70">
                  <input
                    required
                    type="checkbox"
                    checked={privacyConsentAccepted}
                    onChange={(event) => setPrivacyConsentAccepted(event.target.checked)}
                    className="size-4 accent-sage-deep"
                  />
                  <span>I agree to the privacy notice.</span>
                </label>
              )}
            </section>
          )}
          <button type="submit" disabled={isSubmitting} className="dashboard-primary-action flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-wait disabled:opacity-50">
            {isSubmitting ? "Please wait…" : mode === "register" ? signupMethod === "email" ? "Send email verification code" : "Send SMS verification code"
              : mode === "verify-signup" ? "Verify number"
                : mode === "verify-email-signup" ? "Verify email"
                : mode === "verify-password" || mode === "verify-phone-link" || mode === "verify-profile-phone" ? "Verify code"
                  : mode === "set-password" ? "Update password"
                    : mode === "privacy-consent" ? "Accept and continue"
                    : "Sign in"}
            {(mode === "register" || mode === "login") && <ArrowRight aria-hidden="true" size={15} />}
          </button>
        </form>

        {mode === "login" && (
          <button
            type="button"
            onClick={() => void sendPasswordVerification(identifier, "reset")}
            disabled={isSendingCode || !identifier.trim()}
            className="mt-2 w-full text-center text-sm font-semibold text-sage-deep hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSendingCode ? "Sending verification code…" : "Forgot or change password?"}
          </button>
        )}

        {(mode === "login" || mode === "register") && <p className="mt-3 text-center text-sm text-ink/65">
          {mode === "register" ? "Already have an account?" : "New here?"}{" "}
          <button type="button" onClick={() => { setMode(mode === "register" ? "login" : "register"); setPrivacyConsentAccepted(false); setErrorMessage(null); setMessage(null); }} className="font-semibold text-ink hover:underline">
            {mode === "register" ? "Sign in" : "Create account"}
          </button>
        </p>}
          </>
        ) : null}
        {customerUser && mode === "login" && (
          <section aria-labelledby="transaction-history-title" className="mt-8 border-t border-mist pt-6">
            <h2 id="transaction-history-title" className="font-display text-lg font-semibold">Service history</h2>
            {transactionsLoading ? (
              <p className="mt-3 text-sm text-ink/60">Loading your service history…</p>
            ) : transactionsError ? (
              <p role="alert" className="mt-3 dashboard-error-message">{transactionsError}</p>
            ) : transactions.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {transactions.map((transaction) => (
                  <li key={transaction.id} className="rounded-xl border border-mist bg-white p-3 text-sm shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{transaction.ticket_number ? `Ticket ${transaction.ticket_number}` : "Salon visit"}</p>
                        <p className="mt-1 text-xs text-ink/60">{new Date(transaction.created_at).toLocaleString()}</p>
                        <p className="mt-1 break-words text-xs text-ink/70">
                          {transaction.pos_transaction_items.map((item) => `${item.service_name} × ${item.quantity}`).join(", ")}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold">₱{Number(transaction.total_amount).toFixed(2)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-xl border border-mist bg-white/80 p-4 text-sm text-ink/60">
                No service history is available yet.
              </p>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
