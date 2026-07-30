import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export interface AuthNotice {
  type: "success" | "error" | "info";
  title: string;
  message: string;
}

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  authError: string | null;
  authNotice: AuthNotice | null;
  recoveryMode: boolean;
  isConfigured: boolean;
  clearAuthError: () => void;
  clearAuthNotice: () => void;
  completePasswordRecovery: () => void;
  signOut: () => Promise<{ error: string | null }>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
