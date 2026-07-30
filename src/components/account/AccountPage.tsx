import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, CheckCircle, LogOut, Save, UserCircle } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { getCurrentProfile, updateCurrentProfile } from "../../services/profileService";

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500";
const field = "w-full min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 aria-[invalid=true]:border-red-300 aria-[invalid=true]:focus:border-red-500 aria-[invalid=true]:focus:ring-red-500/20";
const primaryButton = `inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;
const secondaryButton = `inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;

function formatDate(value?: string) {
  if (!value) return "Unavailable";
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
  } catch {
    return value;
  }
}

function Notice({ type, children }: { type: "error" | "success" | "info"; children: ReactNode }) {
  const cls = {
    error: "border-red-200 bg-red-50 text-red-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    info: "border-blue-200 bg-blue-50 text-blue-700",
  }[type];
  return <div className={`rounded-lg border px-3 py-2.5 text-sm leading-relaxed ${cls}`}>{children}</div>;
}

export function AccountPage() {
  const { signOut, user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileCreatedAt, setProfileCreatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const authEmail = user?.email || "";
  const accountCreatedAt = useMemo(() => formatDate(user?.created_at), [user?.created_at]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await getCurrentProfile();
    setLoading(false);

    if (result.error || !result.data) {
      setError(result.error || "CrewQuote could not load your account profile.");
      return;
    }

    setFullName(result.data.full_name || "");
    setProfileEmail(result.data.email || "");
    setProfileCreatedAt(result.data.created_at || "");
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }

    setSaving(true);
    const result = await updateCurrentProfile({ fullName });
    setSaving(false);

    if (result.error || !result.data) {
      setError(result.error || "CrewQuote could not save your profile.");
      return;
    }

    setFullName(result.data.full_name || "");
    setProfileEmail(result.data.email || "");
    setProfileCreatedAt(result.data.created_at || "");
    setSuccess("Account profile saved.");
  };

  const doSignOut = async () => {
    setError("");
    setSigningOut(true);
    const result = await signOut();
    if (result.error) {
      setError(result.error);
      setSigningOut(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-950">Account</h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">
            Account details are stored in your Supabase profile. CrewQuote business settings and records remain local in this browser until the migration phase.
          </p>
        </div>
        <button type="button" className={secondaryButton} onClick={doSignOut} disabled={signingOut}>
          <LogOut size={16} />
          {signingOut ? "Signing Out..." : "Sign Out"}
        </button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
        Cloud accounts are active, but local CrewQuote records are not yet synced or account-bound.
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <UserCircle size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-950">Profile</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">Only your account full name is editable in Phase 2.</p>
            </div>
          </div>

          {loading ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Loading account profile...</div>
          ) : (
            <form className="space-y-4" onSubmit={save}>
              {error && <Notice type="error"><AlertTriangle size={15} className="mr-1 inline" />{error}</Notice>}
              {success && <Notice type="success"><CheckCircle size={15} className="mr-1 inline" />{success}</Notice>}

              <div>
                <label htmlFor="account-full-name" className="block text-[11px] font-semibold uppercase text-slate-600">Full Name <span className="text-red-500">*</span></label>
                <input
                  id="account-full-name"
                  type="text"
                  value={fullName}
                  onChange={event => setFullName(event.target.value)}
                  autoComplete="name"
                  className={`${field} mt-1.5`}
                  disabled={saving}
                />
              </div>

              <div>
                <label htmlFor="account-email" className="block text-[11px] font-semibold uppercase text-slate-600">Authentication Email</label>
                <input id="account-email" type="email" value={authEmail || profileEmail} className={`${field} mt-1.5`} readOnly />
              </div>

              <button type="submit" className={primaryButton} disabled={saving}>
                <Save size={16} />
                {saving ? "Saving..." : "Save Full Name"}
              </button>
            </form>
          )}
        </section>

        <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase text-slate-500">Account Details</h2>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="text-[11px] font-semibold uppercase text-slate-500">Email</dt>
              <dd className="mt-1 break-words text-sm font-medium text-slate-900">{authEmail || profileEmail || "Unavailable"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase text-slate-500">Account Created</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">{accountCreatedAt}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase text-slate-500">Profile Row Created</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">{formatDate(profileCreatedAt)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
