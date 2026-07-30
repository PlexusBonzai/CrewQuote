import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export const MIN_PASSWORD_LENGTH = 6;

const CONFIG_ERROR = "Supabase authentication is not configured.";
const AUTH_QUERY_KEYS = [
  "access_token",
  "auth",
  "code",
  "error",
  "error_code",
  "error_description",
  "expires_at",
  "expires_in",
  "provider_refresh_token",
  "provider_token",
  "refresh_token",
  "token_type",
  "type",
];

export interface AuthServiceResult<T> {
  data: T | null;
  error: string | null;
}

export interface SignUpInput {
  fullName: string;
  email: string;
  password: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface AuthUrlState {
  authMode: "confirmed" | "recovery" | null;
  type: string | null;
  error: string | null;
  hasAuthParams: boolean;
}

function ok<T>(data: T): AuthServiceResult<T> {
  return { data, error: null };
}

function fail<T>(error: string): AuthServiceResult<T> {
  return { data: null, error };
}

function getClient() {
  if (!isSupabaseConfigured || !supabase) return null;
  return supabase;
}

export function normalizeAuthError(error: unknown) {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const message = raw.trim();
  const lower = message.toLowerCase();

  if (!message) return "Authentication failed. Please try again.";
  if (lower.includes("not configured")) return CONFIG_ERROR;
  if (lower.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (lower.includes("email not confirmed") || lower.includes("confirm your email")) return "Please confirm your email before signing in.";
  if (lower.includes("rate limit") || lower.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
  if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("connection")) return "CrewQuote could not reach Supabase. Check your connection and try again.";
  if (lower.includes("user already registered") || lower.includes("already registered")) return "An account may already exist for this email. Try signing in or reset your password.";
  if (lower.includes("password")) return message;
  if (lower.includes("expired") || lower.includes("invalid")) return "This authentication link is invalid or expired. Please request a new one.";

  return message;
}

export function getAuthRedirectUrl(authMode: "confirmed" | "recovery") {
  if (typeof window === "undefined") return undefined;
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("auth", authMode);
  return url.toString();
}

function paramsFromHash() {
  if (typeof window === "undefined" || !window.location.hash.startsWith("#")) return new URLSearchParams();
  return new URLSearchParams(window.location.hash.slice(1));
}

export function readAuthUrlState(): AuthUrlState {
  if (typeof window === "undefined") {
    return { authMode: null, type: null, error: null, hasAuthParams: false };
  }

  const search = new URLSearchParams(window.location.search);
  const hash = paramsFromHash();
  const read = (key: string) => search.get(key) || hash.get(key);
  const authValue = read("auth");
  const type = read("type");
  const error = read("error_description") || read("error");
  const hasAuthParams = AUTH_QUERY_KEYS.some(key => search.has(key) || hash.has(key));

  return {
    authMode: authValue === "confirmed" || authValue === "recovery" ? authValue : null,
    type,
    error: error ? normalizeAuthError(error) : null,
    hasAuthParams,
  };
}

export function clearAuthUrlParams() {
  if (typeof window === "undefined" || !window.history?.replaceState) return;

  const url = new URL(window.location.href);
  AUTH_QUERY_KEYS.forEach(key => url.searchParams.delete(key));

  if (url.hash.startsWith("#")) {
    const hash = paramsFromHash();
    AUTH_QUERY_KEYS.forEach(key => hash.delete(key));
    const nextHash = hash.toString();
    url.hash = nextHash ? `#${nextHash}` : "";
  }

  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

export async function getSession(): Promise<AuthServiceResult<Session | null>> {
  const client = getClient();
  if (!client) return fail(CONFIG_ERROR);

  const { data, error } = await client.auth.getSession();
  if (error) return fail(normalizeAuthError(error));
  return ok(data.session);
}

export async function getCurrentUser(): Promise<AuthServiceResult<User | null>> {
  const client = getClient();
  if (!client) return fail(CONFIG_ERROR);

  const { data, error } = await client.auth.getUser();
  if (error) return fail(normalizeAuthError(error));
  return ok(data.user);
}

export async function signUpWithEmail(input: SignUpInput): Promise<AuthServiceResult<{ session: Session | null; user: User | null }>> {
  const client = getClient();
  if (!client) return fail<{ session: Session | null; user: User | null }>(CONFIG_ERROR);

  const { data, error } = await client.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: { full_name: input.fullName.trim() },
      emailRedirectTo: getAuthRedirectUrl("confirmed"),
    },
  });

  if (error) return fail(normalizeAuthError(error));
  return ok({ session: data.session, user: data.user });
}

export async function signInWithPassword(input: SignInInput): Promise<AuthServiceResult<Session>> {
  const client = getClient();
  if (!client) return fail(CONFIG_ERROR);

  const { data, error } = await client.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  });

  if (error) return fail(normalizeAuthError(error));
  return data.session ? ok(data.session) : fail("CrewQuote could not start an authenticated session. Please try again.");
}

export async function signOut(): Promise<AuthServiceResult<true>> {
  const client = getClient();
  if (!client) return fail(CONFIG_ERROR);

  const { error } = await client.auth.signOut();
  if (error) return fail(normalizeAuthError(error));
  return ok(true);
}

export async function sendPasswordReset(email: string): Promise<AuthServiceResult<true>> {
  const client = getClient();
  if (!client) return fail(CONFIG_ERROR);

  const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: getAuthRedirectUrl("recovery"),
  });

  if (error) return fail(normalizeAuthError(error));
  return ok(true);
}

export async function updatePassword(password: string): Promise<AuthServiceResult<User>> {
  const client = getClient();
  if (!client) return fail(CONFIG_ERROR);

  const { data, error } = await client.auth.updateUser({ password });
  if (error) return fail(normalizeAuthError(error));
  return data.user ? ok(data.user) : fail("CrewQuote could not update the password. Please request a new reset link.");
}

export async function resendConfirmationEmail(email: string): Promise<AuthServiceResult<true>> {
  const client = getClient();
  if (!client) return fail(CONFIG_ERROR);

  const { error } = await client.auth.resend({
    type: "signup",
    email: email.trim(),
    options: { emailRedirectTo: getAuthRedirectUrl("confirmed") },
  });

  if (error) return fail(normalizeAuthError(error));
  return ok(true);
}

export function subscribeToAuthChanges(callback: (event: AuthChangeEvent, session: Session | null) => void) {
  const client = getClient();
  if (!client) return { unsubscribe: () => {} };

  const { data } = client.auth.onAuthStateChange(callback);
  return data.subscription;
}
