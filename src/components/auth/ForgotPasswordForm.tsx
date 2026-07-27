import { useState, type FormEvent } from "react";
import { sendPasswordReset } from "../../services/authService";
import { AlertMessage, authUi, emailLooksValid, FieldError } from "./authUi";

interface ForgotPasswordFormProps {
  initialEmail?: string;
  onBackToLogin: () => void;
}

export function ForgotPasswordForm({ initialEmail = "", onBackToLogin }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [emailError, setEmailError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError("");
    setSent(false);

    if (!email.trim()) {
      setEmailError("Email is required.");
      return;
    }
    if (!emailLooksValid(email)) {
      setEmailError("Enter a valid email address.");
      return;
    }

    setEmailError("");
    setBusy(true);
    const result = await sendPasswordReset(email);
    setBusy(false);

    if (result.error) {
      setSubmitError(result.error);
      return;
    }

    setSent(true);
  };

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      {submitError && <AlertMessage type="error">{submitError}</AlertMessage>}
      {sent && <AlertMessage type="success">If an account exists for this email address, a password reset link has been sent.</AlertMessage>}

      <div>
        <label htmlFor="forgot-email" className="block text-[11px] font-semibold uppercase text-slate-600">Email <span className="text-red-500">*</span></label>
        <input
          id="forgot-email"
          type="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          autoComplete="email"
          className={`${authUi.field} mt-1.5`}
          aria-invalid={Boolean(emailError)}
          disabled={busy}
        />
        <FieldError>{emailError}</FieldError>
      </div>

      <button type="submit" className={authUi.primaryButton} disabled={busy}>
        {busy ? "Sending reset link..." : "Send Reset Link"}
      </button>

      <button type="button" className={authUi.linkButton} onClick={onBackToLogin} disabled={busy}>Return to Login</button>
    </form>
  );
}
