import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { MIN_PASSWORD_LENGTH, signUpWithEmail } from "../../services/authService";
import { AlertMessage, authUi, emailLooksValid, FieldError } from "./authUi";

interface RegisterFormProps {
  onBackToLogin: () => void;
  onConfirmationRequired: (email: string) => void;
}

export function RegisterForm({ onBackToLogin, onConfirmationRequired }: RegisterFormProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [busy, setBusy] = useState(false);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!fullName.trim()) next.fullName = "Full name is required.";
    if (!email.trim()) next.email = "Email is required.";
    else if (!emailLooksValid(email)) next.email = "Enter a valid email address.";
    if (!password) next.password = "Password is required.";
    else if (password.length < MIN_PASSWORD_LENGTH) next.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (!confirmPassword) next.confirmPassword = "Confirm your password.";
    else if (password !== confirmPassword) next.confirmPassword = "Passwords do not match.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError("");
    if (!validate()) return;

    setBusy(true);
    const result = await signUpWithEmail({ fullName, email, password });
    setBusy(false);

    if (result.error) {
      setSubmitError(result.error);
      return;
    }

    if (!result.data?.session) onConfirmationRequired(email);
  };

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      {submitError && <AlertMessage type="error">{submitError}</AlertMessage>}

      <div>
        <label htmlFor="register-full-name" className="block text-[11px] font-semibold uppercase text-slate-600">Full Name <span className="text-red-500">*</span></label>
        <input
          id="register-full-name"
          type="text"
          value={fullName}
          onChange={event => setFullName(event.target.value)}
          autoComplete="name"
          className={`${authUi.field} mt-1.5`}
          aria-invalid={Boolean(errors.fullName)}
          disabled={busy}
        />
        <FieldError>{errors.fullName}</FieldError>
      </div>

      <div>
        <label htmlFor="register-email" className="block text-[11px] font-semibold uppercase text-slate-600">Email <span className="text-red-500">*</span></label>
        <input
          id="register-email"
          type="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          autoComplete="email"
          className={`${authUi.field} mt-1.5`}
          aria-invalid={Boolean(errors.email)}
          disabled={busy}
        />
        <FieldError>{errors.email}</FieldError>
      </div>

      <div>
        <label htmlFor="register-password" className="block text-[11px] font-semibold uppercase text-slate-600">Password <span className="text-red-500">*</span></label>
        <div className="relative mt-1.5">
          <input
            id="register-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={event => setPassword(event.target.value)}
            autoComplete="new-password"
            className={`${authUi.field} pr-11`}
            aria-invalid={Boolean(errors.password)}
            disabled={busy}
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword(value => !value)}
            className={`absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 ${authUi.focus}`}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <FieldError>{errors.password}</FieldError>
      </div>

      <div>
        <label htmlFor="register-confirm-password" className="block text-[11px] font-semibold uppercase text-slate-600">Confirm Password <span className="text-red-500">*</span></label>
        <input
          id="register-confirm-password"
          type={showPassword ? "text" : "password"}
          value={confirmPassword}
          onChange={event => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          className={`${authUi.field} mt-1.5`}
          aria-invalid={Boolean(errors.confirmPassword)}
          disabled={busy}
        />
        <FieldError>{errors.confirmPassword}</FieldError>
      </div>

      <button type="submit" className={authUi.primaryButton} disabled={busy}>
        {busy ? "Creating account..." : "Create Account"}
      </button>

      <button type="button" className={authUi.linkButton} onClick={onBackToLogin} disabled={busy}>Return to Login</button>
    </form>
  );
}
