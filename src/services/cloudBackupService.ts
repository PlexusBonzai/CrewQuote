import type { Phase3AppDataLike } from "../data/crewquoteTypes";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import { getCurrentBusinessSettings } from "./businessSettingsService";
import { getCurrentUserPreferences } from "./userPreferencesService";
import { listClients } from "./clientService";
import { listRatePresets } from "./ratePresetService";

export interface Phase4CloudBackupData<T> {
  appData: T;
  cloudRecovery: {
    profile: unknown;
    preferences: unknown;
    clients: unknown[];
    ratePresets: unknown[];
  };
}

export async function buildPhase4CloudBackupData<T extends Phase3AppDataLike>(localData: T): Promise<CloudResult<Phase4CloudBackupData<T>>> {
  try {
    const [settings, preferences, clients, ratePresets] = await Promise.all([
      getCurrentBusinessSettings(localData.profile),
      getCurrentUserPreferences({ onboardingDismissed: localData.onboardingDismissed, uiPreferences: {} }),
      listClients(),
      listRatePresets(),
    ]);
    if (settings.error || !settings.data) return cloudFail(settings.error || "CrewQuote could not fetch cloud settings for backup.");
    if (preferences.error || !preferences.data) return cloudFail(preferences.error || "CrewQuote could not fetch cloud preferences for backup.");
    if (clients.error || !clients.data) return cloudFail(clients.error || "CrewQuote could not fetch cloud clients for backup.");
    if (ratePresets.error || !ratePresets.data) return cloudFail(ratePresets.error || "CrewQuote could not fetch cloud rate presets for backup.");

    const appData = {
      ...localData,
      profile: {
        ...settings.data.profile,
        businessLogoDataUrl: localData.profile.businessLogoDataUrl || settings.data.profile.businessLogoDataUrl || "",
      },
      clients: clients.data,
      onboardingDismissed: preferences.data.preferences.onboardingDismissed,
    } as T;
    return cloudOk({
      appData,
      cloudRecovery: {
        profile: settings.data.profile,
        preferences: preferences.data.preferences,
        clients: clients.data,
        ratePresets: ratePresets.data,
      },
    });
  } catch (error) {
    return cloudFail(error);
  }
}

export async function buildCloudAwareBackupData<T extends Phase3AppDataLike>(localData: T): Promise<CloudResult<T>> {
  const complete = await buildPhase4CloudBackupData(localData);
  return complete.error || !complete.data ? cloudFail(complete.error) : cloudOk(complete.data.appData);
}
