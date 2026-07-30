import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";
import { runtimeConfig, runtimeConfigErrorMessage } from "../config/runtimeConfig";

export const isSupabaseConfigured = runtimeConfig.isValid;

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(runtimeConfig.supabaseUrl, runtimeConfig.supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null;

export function getSupabaseBrowserClient() {
  if (!supabase) {
    throw new Error(runtimeConfigErrorMessage() || "Supabase is not configured for this browser application.");
  }

  return supabase;
}
