import { getSupabaseBrowserClient } from "../lib/supabase";
import { getCurrentUserId } from "../data/cloudDataProvider";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import type { CrewProfile } from "../data/crewquoteTypes";
import { businessSettingsRowToProfile, profileToBusinessSettingsInsert } from "../data/mappers/businessSettingsMapper";

const BUSINESS_SETTINGS_COLUMNS = "*";

export async function getCurrentBusinessSettings(baseProfile: CrewProfile): Promise<CloudResult<{ profile: CrewProfile; exists: boolean }>> {
  try {
    const userIdResult = await getCurrentUserId();
    if (userIdResult.error || !userIdResult.data) return cloudFail(userIdResult.error);
    const client = getSupabaseBrowserClient();
    const { data, error } = await client
      .from("business_settings")
      .select(BUSINESS_SETTINGS_COLUMNS)
      .eq("user_id", userIdResult.data)
      .maybeSingle();
    if (error) return cloudFail(error);
    if (!data) return cloudOk({ profile: baseProfile, exists: false });
    return cloudOk({ profile: businessSettingsRowToProfile(data, baseProfile), exists: true });
  } catch (error) {
    return cloudFail(error);
  }
}

export async function saveCurrentBusinessSettings(profile: CrewProfile, baseProfile: CrewProfile): Promise<CloudResult<CrewProfile>> {
  try {
    const userIdResult = await getCurrentUserId();
    if (userIdResult.error || !userIdResult.data) return cloudFail(userIdResult.error);
    const client = getSupabaseBrowserClient();
    const payload = profileToBusinessSettingsInsert(profile, userIdResult.data);
    const { data, error } = await client
      .from("business_settings")
      .upsert(payload, { onConflict: "user_id" })
      .select(BUSINESS_SETTINGS_COLUMNS)
      .single();
    if (error) return cloudFail(error);
    return cloudOk(businessSettingsRowToProfile(data, { ...baseProfile, businessLogoDataUrl: profile.businessLogoDataUrl || baseProfile.businessLogoDataUrl || "" }));
  } catch (error) {
    return cloudFail(error);
  }
}
