import { getSupabaseBrowserClient } from "../lib/supabase";
import { getCurrentUserId } from "../data/cloudDataProvider";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import type { UserPreferencesModel } from "../data/crewquoteTypes";
import type { Json } from "../types/database.types";

const USER_PREFERENCES_COLUMNS = "*";

export async function getCurrentUserPreferences(fallback: UserPreferencesModel): Promise<CloudResult<{ preferences: UserPreferencesModel; exists: boolean }>> {
  try {
    const userIdResult = await getCurrentUserId();
    if (userIdResult.error || !userIdResult.data) return cloudFail(userIdResult.error);
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.from("user_preferences").select(USER_PREFERENCES_COLUMNS).eq("user_id", userIdResult.data).maybeSingle();
    if (error) return cloudFail(error);
    if (!data) return cloudOk({ preferences: fallback, exists: false });
    return cloudOk({
      exists: true,
      preferences: {
        onboardingDismissed: Boolean(data.onboarding_dismissed),
        uiPreferences: data.ui_preferences && typeof data.ui_preferences === "object" && !Array.isArray(data.ui_preferences) ? data.ui_preferences as Record<string, unknown> : {},
      },
    });
  } catch (error) {
    return cloudFail(error);
  }
}

export async function saveCurrentUserPreferences(preferences: UserPreferencesModel): Promise<CloudResult<UserPreferencesModel>> {
  try {
    const userIdResult = await getCurrentUserId();
    if (userIdResult.error || !userIdResult.data) return cloudFail(userIdResult.error);
    const client = getSupabaseBrowserClient();
    const { data, error } = await client
      .from("user_preferences")
      .upsert({
        user_id: userIdResult.data,
        onboarding_dismissed: Boolean(preferences.onboardingDismissed),
        ui_preferences: (preferences.uiPreferences || {}) as unknown as Json,
      }, { onConflict: "user_id" })
      .select(USER_PREFERENCES_COLUMNS)
      .single();
    if (error) return cloudFail(error);
    return cloudOk({
      onboardingDismissed: Boolean(data.onboarding_dismissed),
      uiPreferences: data.ui_preferences && typeof data.ui_preferences === "object" && !Array.isArray(data.ui_preferences) ? data.ui_preferences as Record<string, unknown> : {},
    });
  } catch (error) {
    return cloudFail(error);
  }
}
