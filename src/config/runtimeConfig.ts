function legacyJwtRole(key: string) {
  try {
    const payload = key.split(".")[1];
    if (!payload) return "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return String(JSON.parse(atob(normalized))?.role || "");
  } catch {
    return "";
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || "";
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || "";
const legacyAnonKey = import.meta.env.DEV ? import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "" : "";
const browserKey = publishableKey || legacyAnonKey;
const errors: string[] = [];

if (!supabaseUrl) errors.push("VITE_SUPABASE_URL is missing.");
if (!publishableKey && import.meta.env.PROD) errors.push("VITE_SUPABASE_PUBLISHABLE_KEY is missing.");
if (!browserKey && import.meta.env.DEV) errors.push("VITE_SUPABASE_PUBLISHABLE_KEY is missing (VITE_SUPABASE_ANON_KEY is accepted only for local development).");

if (supabaseUrl) {
  try {
    const parsed = new URL(supabaseUrl);
    if (import.meta.env.PROD && parsed.protocol !== "https:") errors.push("VITE_SUPABASE_URL must use HTTPS in production.");
    if (!/^https?:$/.test(parsed.protocol)) errors.push("VITE_SUPABASE_URL must be an HTTP or HTTPS URL.");
  } catch {
    errors.push("VITE_SUPABASE_URL is not a valid URL.");
  }
}

if (browserKey.startsWith("sb_secret_") || legacyJwtRole(browserKey) === "service_role") {
  errors.push("A Supabase secret or service-role key cannot be used in this browser application.");
}

export const runtimeConfig = {
  supabaseUrl,
  supabasePublishableKey: browserKey,
  errors,
  isValid: errors.length === 0,
};

export function runtimeConfigErrorMessage() {
  return errors.length ? `CrewQuote production configuration is incomplete: ${errors.join(" ")}` : "";
}
