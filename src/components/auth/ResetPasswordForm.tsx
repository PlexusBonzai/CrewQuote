import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { MIN_PASSWORD_LENGTH, updatePassword } from "../../services/authService";
import { AlertMessage, authUi, FieldError } from "./authUi";

export function ResetPasswordForm() {
  const { completePasswordRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!password) next.password = "New password is required.";
    else if (password.length < MIN_PASSWORD_LENGTH) next.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (!confirmPassword) next.confirmPassword = "Confirm your new password.";
    else if (password !== confirmPassword) next.confirmPassword = "Passwords do not match.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError("");
    setSuccess(false);
    if (!validate()) return;

    setBusy(true);
    const result = await updatePassword(password);
    setBusy(false);

    if (result.error) {
      setSubmitError(result.error);
      return;
    }

    setSuccess(true);
    setPassword("");
    setConfirmPassword("");
  };

  if (success) {
    return (
      <div className="space-y-4">
        <AlertMessage type="success">Your password has been updated.</AlertMessage>
        <button type="button" className={authUi.primaryButton} onClick={completePasswordRecovery}>Continue to CrewQuote</button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      {submitError && <AlertMessage type="error">{submitError}</AlertMessage>}

      <div>
        <label htmlFor="reset-password" className="block text-[11px] font-semibold uppercase text-slate-600">New Password <span className="text-red-500">*</span></label>
        <div className="relative mt-1.5">
          <input
            id="reset-password"
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
        <label htmlFor="reset-confirm-password" className="block text-[11px] font-semibold uppercase text-slate-600">Confirm New Password <span className="text-red-500">*</span></label>
        <input
          id="reset-confirm-password"
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
        {busy ? "Updating password..." : "Update Password"}
      </button>
    </form>
  );
}
