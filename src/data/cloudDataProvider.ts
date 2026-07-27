import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { cloudFail, cloudOk, type CloudResult } from "./dataErrors";

export async function getCurrentCloudUser(): Promise<CloudResult<User>> {
  try {
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.auth.getUser();
    if (error) return cloudFail(error);
    if (!data.user) return cloudFail("Your CrewQuote session has expired. Please sign in again.");
    return cloudOk(data.user);
  } catch (error) {
    return cloudFail(error);
  }
}

export async function getCurrentUserId(): Promise<CloudResult<string>> {
  const result = await getCurrentCloudUser();
  if (result.error || !result.data) return cloudFail(result.error || "Your CrewQuote session has expired. Please sign in again.");
  return cloudOk(result.data.id);
}
