import { useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle, Film, X } from "lucide-react";
import { useAuth } from "./AuthContext";
import { AuthScreen } from "../components/auth/AuthScreen";

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-900 px-4">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
          <Film size={20} className="text-white" />
        </div>
        <p className="text-sm text-slate-400">Checking your CrewQuote session...</p>
      </div>
    </div>
  );
}

function UnconfiguredScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <AlertTriangle size={22} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-950">Supabase authentication is not configured.</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Set these browser-safe environment variables to enable CrewQuote account access:
            </p>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700">
              <p>VITE_SUPABASE_URL</p>
              <p>VITE_SUPABASE_PUBLISHABLE_KEY</p>
              <p>VITE_SUPABASE_ANON_KEY</p>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              Use `VITE_SUPABASE_PUBLISHABLE_KEY` when available; `VITE_SUPABASE_ANON_KEY` is supported for local legacy projects. Values are intentionally not shown here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LocalDataNotice() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed right-3 top-3 z-50 w-[calc(100%-1.5rem)] max-w-xl sm:right-5 sm:top-5">
      <div className="pointer-events-auto rounded-lg border border-blue-200 bg-white p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <CheckCircle size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-950">Cloud accounts are now active.</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Your existing CrewQuote records are still stored in this browser and will be migrated to your account in the next phase.
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss cloud account notice"
            onClick={() => setVisible(false)}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProtectedApp({ children }: { children: ReactNode }) {
  const { authNotice, isConfigured, loading, recoveryMode, session } = useAuth();

  if (!isConfigured) return <UnconfiguredScreen />;
  if (loading) return <LoadingScreen />;
  if (recoveryMode) return <AuthScreen initialMode="reset" />;
  if (!session) {
    const initialMode = authNotice?.type === "error" && authNotice.title.toLowerCase().includes("password")
      ? "forgot"
      : authNotice?.type === "error"
        ? "confirmation"
        : "login";
    return <AuthScreen initialMode={initialMode} />;
  }

  return (
    <>
      <LocalDataNotice />
      {children}
    </>
  );
}
