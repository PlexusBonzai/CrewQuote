import type { Phase3AppDataLike } from "../data/crewquoteTypes";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import { getCurrentBusinessSettings } from "./businessSettingsService";
import { getCurrentUserPreferences } from "./userPreferencesService";
import { listClients } from "./clientService";
import { listRatePresets } from "./ratePresetService";
import { getCurrentProfile } from "./profileService";
import { listTimesheetsWithEntries } from "./timesheetService";

export interface Phase4CloudBackupData<T> {
  appData: T;
  cloudRecovery: {
    accountProfile: unknown;
    businessSettings: unknown;
    preferences: unknown;
    clients: unknown[];
    ratePresets: unknown[];
    timesheets?: unknown[];
  };
}

export async function buildPhase4CloudBackupData<T extends Phase3AppDataLike>(localData: T, includeCloudTimesheets = false): Promise<CloudResult<Phase4CloudBackupData<T>>> {
  try {
    const [profile, settings, preferences, clients, ratePresets, timesheets] = await Promise.all([
      getCurrentProfile(),
      getCurrentBusinessSettings(localData.profile),
      getCurrentUserPreferences({ onboardingDismissed: localData.onboardingDismissed, uiPreferences: {} }),
      listClients(),
      listRatePresets(),
      includeCloudTimesheets ? listTimesheetsWithEntries() : Promise.resolve(cloudOk<unknown[]>([])),
    ]);
    if (profile.error || !profile.data) return cloudFail(profile.error || "CrewQuote could not fetch the account profile for backup.");
    if (settings.error || !settings.data) return cloudFail(settings.error || "CrewQuote could not fetch cloud settings for backup.");
    if (preferences.error || !preferences.data) return cloudFail(preferences.error || "CrewQuote could not fetch cloud preferences for backup.");
    if (clients.error || !clients.data) return cloudFail(clients.error || "CrewQuote could not fetch cloud clients for backup.");
    if (ratePresets.error || !ratePresets.data) return cloudFail(ratePresets.error || "CrewQuote could not fetch cloud rate presets for backup.");
    if (timesheets.error || !timesheets.data) return {
      data: null,
      error: `Complete current backup stopped: ${timesheets.error || "CrewQuote could not fetch cloud Timesheets."} Browser recovery data was not labelled as current.`,
    };

    const appData = {
      ...localData,
      profile: {
        ...settings.data.profile,
        businessLogoDataUrl: localData.profile.businessLogoDataUrl || settings.data.profile.businessLogoDataUrl || "",
      },
      clients: clients.data,
      timesheets: includeCloudTimesheets ? timesheets.data : localData.timesheets,
      onboardingDismissed: preferences.data.preferences.onboardingDismissed,
    } as T;
    return cloudOk({
      appData,
      cloudRecovery: {
        accountProfile: profile.data,
        businessSettings: settings.data.profile,
        preferences: preferences.data.preferences,
        clients: clients.data,
        ratePresets: ratePresets.data,
        ...(includeCloudTimesheets ? { timesheets: timesheets.data } : {}),
      },
    });
  } catch (error) {
    return cloudFail(error);
  }
}

export async function buildCloudAwareBackupData<T extends Phase3AppDataLike>(localData: T, includeCloudTimesheets = false): Promise<CloudResult<T>> {
  const complete = await buildPhase4CloudBackupData(localData, includeCloudTimesheets);
  return complete.error || !complete.data ? cloudFail(complete.error) : cloudOk(complete.data.appData);
}
