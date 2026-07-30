import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "../lib/supabase";
import { AuthContext, type AuthNotice } from "./AuthContext";
import {
  clearAuthUrlParams,
  getSession,
  normalizeAuthError,
  readAuthUrlState,
  signOut as signOutWithSupabase,
  subscribeToAuthChanges,
} from "../services/authService";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<AuthNotice | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let mounted = true;
    const urlState = readAuthUrlState();

    const subscription = subscribeToAuthChanges((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setAuthError(null);

      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      if (event === "SIGNED_OUT") setRecoveryMode(false);
      if (event === "SIGNED_IN" && (urlState.authMode === "confirmed" || urlState.type === "signup")) {
        setAuthNotice({
          type: "success",
          title: "Email confirmed",
          message: "Your email address has been confirmed and your session is active.",
        });
      }
    });

    (async () => {
      const result = await getSession();
      if (!mounted) return;

      if (result.error) setAuthError(result.error);
      setSession(result.data);
      setUser(result.data?.user ?? null);

      if (urlState.error) {
        setAuthNotice({
          type: "error",
          title: "Authentication link problem",
          message: normalizeAuthError(urlState.error),
        });
      }

      if (urlState.authMode === "recovery" || urlState.type === "recovery") {
        if (result.data) {
          setRecoveryMode(true);
        } else {
          setAuthNotice({
            type: "error",
            title: "Password reset link problem",
            message: "This password reset link is invalid or expired. Please request a new one.",
          });
        }
      }

      if (urlState.hasAuthParams) clearAuthUrlParams();
      setLoading(false);
    })();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);
  const clearAuthNotice = useCallback(() => setAuthNotice(null), []);
  const completePasswordRecovery = useCallback(() => {
    setRecoveryMode(false);
    clearAuthUrlParams();
  }, []);

  const signOut = useCallback(async () => {
    const result = await signOutWithSupabase();
    if (result.error) {
      setAuthError(result.error);
      return { error: result.error };
    }

    setSession(null);
    setUser(null);
    setRecoveryMode(false);
    setAuthNotice({
      type: "success",
      title: "Signed out",
      message: "You have signed out. Local CrewQuote records in this browser were not removed.",
    });
    return { error: null };
  }, []);

  const value = useMemo(() => ({
    session,
    user,
    loading,
    authError,
    authNotice,
    recoveryMode,
    isConfigured: isSupabaseConfigured,
    clearAuthError,
    clearAuthNotice,
    completePasswordRecovery,
    signOut,
  }), [authError, authNotice, clearAuthError, clearAuthNotice, completePasswordRecovery, loading, recoveryMode, session, signOut, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
