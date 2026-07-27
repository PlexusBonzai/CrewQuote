import { useState } from "react";
import { resendConfirmationEmail } from "../../services/authService";
import { AlertMessage, authUi, emailLooksValid, FieldError } from "./authUi";

interface EmailConfirmationStateProps {
  email?: string;
  errorMessage?: string;
  onReturnToLogin: () => void;
}

export function EmailConfirmationState({ email = "", errorMessage, onReturnToLogin }: EmailConfirmationStateProps) {
  const [resendEmail, setResendEmail] = useState(email);
  const [fieldError, setFieldError] = useState("");
  const [status, setStatus] = useState<"idle" | "sent">("idle");
  const [submitError, setSubmitError] = useState("");
  const [busy, setBusy] = useState(false);
  const canResend = resendEmail.trim().length > 0;

  const resend = async () => {
    setSubmitError("");
    setStatus("idle");

    if (!resendEmail.trim()) {
      setFieldError("Email is required.");
      return;
    }
    if (!emailLooksValid(resendEmail)) {
      setFieldError("Enter a valid email address.");
      return;
    }

    setFieldError("");
    setBusy(true);
    const result = await resendConfirmationEmail(resendEmail);
    setBusy(false);

    if (result.error) {
      setSubmitError(result.error);
      return;
    }
    setStatus("sent");
  };

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <AlertMessage type="error">{errorMessage}</AlertMessage>
      ) : (
        <AlertMessage type="info">
          Check {email ? <span className="font-semibold">{email}</span> : "your email"} to confirm your account before logging in.
        </AlertMessage>
      )}
      {submitError && <AlertMessage type="error">{submitError}</AlertMessage>}
      {status === "sent" && <AlertMessage type="success">If this email is waiting for confirmation, a new confirmation email has been sent.</AlertMessage>}

      <div>
        <label htmlFor="confirm-email" className="block text-[11px] font-semibold uppercase text-slate-600">Email</label>
        <input
          id="confirm-email"
          type="email"
          value={resendEmail}
          onChange={event => setResendEmail(event.target.value)}
          autoComplete="email"
          className={`${authUi.field} mt-1.5`}
          aria-invalid={Boolean(fieldError)}
          disabled={busy}
        />
        <FieldError>{fieldError}</FieldError>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" className={authUi.primaryButton} onClick={resend} disabled={busy || !canResend}>
          {busy ? "Sending..." : "Resend Confirmation Email"}
        </button>
        <button type="button" className={`${authUi.secondaryButton} w-full`} onClick={onReturnToLogin} disabled={busy}>Return to Login</button>
      </div>
    </div>
  );
}
