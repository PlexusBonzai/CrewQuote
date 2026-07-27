import type { Phase3AppDataLike } from "../data/crewquoteTypes";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import { getCurrentBusinessSettings } from "./businessSettingsService";
import { getCurrentUserPreferences } from "./userPreferencesService";
import { listClients } from "./clientService";

export async function buildCloudAwareBackupData<T extends Phase3AppDataLike>(localData: T): Promise<CloudResult<T>> {
  try {
    const settings = await getCurrentBusinessSettings(localData.profile);
    if (settings.error || !settings.data) return cloudFail(settings.error || "CrewQuote could not fetch cloud settings for backup.");
    const preferences = await getCurrentUserPreferences({ onboardingDismissed: localData.onboardingDismissed, uiPreferences: {} });
    if (preferences.error || !preferences.data) return cloudFail(preferences.error || "CrewQuote could not fetch cloud preferences for backup.");
    const clients = await listClients();
    if (clients.error || !clients.data) return cloudFail(clients.error || "CrewQuote could not fetch cloud clients for backup.");

    return cloudOk({
      ...localData,
      profile: {
        ...settings.data.profile,
        businessLogoDataUrl: localData.profile.businessLogoDataUrl || settings.data.profile.businessLogoDataUrl || "",
      },
      clients: clients.data,
      onboardingDismissed: preferences.data.preferences.onboardingDismissed,
    } as T);
  } catch (error) {
    return cloudFail(error);
  }
}
