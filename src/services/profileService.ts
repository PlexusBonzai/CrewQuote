import { getSupabaseBrowserClient } from "../lib/supabase";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import { getCurrentCloudUser } from "../data/cloudDataProvider";
import type { AccountProfileRow } from "../data/mappers/profileMapper";

const PROFILE_COLUMNS = "id, full_name, email, created_at, updated_at";

export async function getCurrentProfile(): Promise<CloudResult<AccountProfileRow>> {
  try {
    const userResult = await getCurrentCloudUser();
    if (userResult.error || !userResult.data) return cloudFail(userResult.error);
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.from("profiles").select(PROFILE_COLUMNS).eq("id", userResult.data.id).maybeSingle();
    if (error) return cloudFail(error);
    if (data) return cloudOk(data);
    return ensureCurrentProfileExists();
  } catch (error) {
    return cloudFail(error);
  }
}

export async function ensureCurrentProfileExists(): Promise<CloudResult<AccountProfileRow>> {
  try {
    const userResult = await getCurrentCloudUser();
    if (userResult.error || !userResult.data) return cloudFail(userResult.error);
    const user = userResult.data;
    const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";
    const client = getSupabaseBrowserClient();
    const { data, error } = await client
      .from("profiles")
      .upsert({ id: user.id, full_name: fullName, email: user.email || "" }, { onConflict: "id" })
      .select(PROFILE_COLUMNS)
      .single();
    if (error) return cloudFail(error);
    return cloudOk(data);
  } catch (error) {
    return cloudFail(error);
  }
}

export async function updateCurrentProfile(input: { fullName: string }): Promise<CloudResult<AccountProfileRow>> {
  try {
    const userResult = await getCurrentCloudUser();
    if (userResult.error || !userResult.data) return cloudFail(userResult.error);
    const user = userResult.data;
    const client = getSupabaseBrowserClient();
    const { data, error } = await client
      .from("profiles")
      .update({ full_name: input.fullName.trim(), email: user.email || "" })
      .eq("id", user.id)
      .select(PROFILE_COLUMNS)
      .maybeSingle();
    if (error) return cloudFail(error);
    if (data) return cloudOk(data);
    return ensureCurrentProfileExists();
  } catch (error) {
    return cloudFail(error);
  }
}
