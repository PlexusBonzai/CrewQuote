import { getSupabaseBrowserClient } from "../lib/supabase";
import { getCurrentUserId } from "../data/cloudDataProvider";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import type { RatePresetRow } from "../data/mappers/ratePresetMapper";

export async function listRatePresets(): Promise<CloudResult<RatePresetRow[]>> {
  try {
    const userIdResult = await getCurrentUserId();
    if (userIdResult.error || !userIdResult.data) return cloudFail(userIdResult.error);
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.from("rate_presets").select("*").eq("user_id", userIdResult.data).order("name", { ascending: true });
    if (error) return cloudFail(error);
    return cloudOk(data || []);
  } catch (error) {
    return cloudFail(error);
  }
}
