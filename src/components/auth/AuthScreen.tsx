import { useEffect, useState } from "react";
import { Film } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { AlertMessage } from "./authUi";
import { EmailConfirmationState } from "./EmailConfirmationState";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import { ResetPasswordForm } from "./ResetPasswordForm";

export type AuthMode = "login" | "register" | "forgot" | "reset" | "confirmation";

interface AuthScreenProps {
  initialMode?: AuthMode;
}

function headingFor(mode: AuthMode) {
  if (mode === "register") return "Create your CrewQuote account";
  if (mode === "forgot") return "Reset your password";
  if (mode === "reset") return "Choose a new password";
  if (mode === "confirmation") return "Confirm your email";
  return "Sign in to CrewQuote";
}

function copyFor(mode: AuthMode) {
  if (mode === "register") return "Create an account for cloud access. Your current records remain in this browser for now.";
  if (mode === "forgot") return "Enter your email address and CrewQuote will send a reset link if an account exists.";
  if (mode === "reset") return "Use your recovery session to set a new password.";
  if (mode === "confirmation") return "Email confirmation links may expire. You can resend the confirmation email below.";
  return "Cloud accounts protect access to the app while business records stay local until migration.";
}

export function AuthScreen({ initialMode = "login" }: AuthScreenProps) {
  const { authError, authNotice, clearAuthError, clearAuthNotice } = useAuth();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");

  useEffect(() => setMode(initialMode), [initialMode]);

  const goToLogin = () => {
    clearAuthError();
    clearAuthNotice();
    setMode("login");
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <div className="w-full rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 shadow-sm">
                <Film size={16} className="text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold leading-tight text-slate-950">CrewQuote Pro</p>
                  <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-200">Beta</span>
                </div>
                <p className="text-[11px] text-slate-500">Freelancer Timesheet</p>
              </div>
            </div>
            <h1 className="mt-5 text-xl font-bold text-slate-950">{headingFor(mode)}</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{copyFor(mode)}</p>
          </div>

          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-800">
            Existing CrewQuote records are still browser-local and are not yet account-bound.
          </div>

          {authNotice && mode !== "confirmation" && (
            <div className="mb-4">
              <AlertMessage type={authNotice.type}>
                <span className="font-semibold">{authNotice.title}</span> {authNotice.message}
              </AlertMessage>
            </div>
          )}
          {authError && (
            <div className="mb-4">
              <AlertMessage type="error">{authError}</AlertMessage>
            </div>
          )}

          {mode === "login" && (
            <LoginForm
              onCreateAccount={() => {
                clearAuthError();
                setMode("register");
              }}
              onForgotPassword={email => {
                clearAuthError();
                setForgotEmail(email);
                setMode("forgot");
              }}
              onNeedsConfirmation={email => {
                setConfirmationEmail(email);
                setMode("confirmation");
              }}
            />
          )}
          {mode === "register" && (
            <RegisterForm
              onBackToLogin={goToLogin}
              onConfirmationRequired={email => {
                setConfirmationEmail(email);
                setMode("confirmation");
              }}
            />
          )}
          {mode === "forgot" && <ForgotPasswordForm initialEmail={forgotEmail} onBackToLogin={goToLogin} />}
          {mode === "reset" && <ResetPasswordForm />}
          {mode === "confirmation" && (
            <EmailConfirmationState
              email={confirmationEmail}
              errorMessage={authNotice?.type === "error" ? authNotice.message : undefined}
              onReturnToLogin={goToLogin}
            />
          )}
        </div>
      </div>
    </div>
  );
}
