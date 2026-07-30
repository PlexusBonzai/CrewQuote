import type { Phase3AppDataLike } from "../data/crewquoteTypes";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import { getCurrentBusinessSettings } from "./businessSettingsService";
import { getCurrentUserPreferences } from "./userPreferencesService";
import { listClients } from "./clientService";
import { listRatePresets } from "./ratePresetService";
import { getCurrentProfile } from "./profileService";
import { listTimesheetsWithEntries } from "./timesheetService";
import { listInvoicesWithLinesAndPayments } from "./invoiceService";
import type { CrewInvoice } from "../data/crewquoteTypes";
import { loadBusinessLogo } from "./businessLogoService";

export interface Phase4CloudBackupData<T> {
  appData: T;
  cloudRecovery: {
    accountProfile: unknown;
    businessSettings: unknown;
    preferences: unknown;
    clients: unknown[];
    ratePresets: unknown[];
    timesheets?: unknown[];
    invoices?: unknown[];
    businessLogo: {
      cloudBacked: boolean;
      mimeType: string | null;
      sizeBytes: number;
      dataUrl: string;
    };
  };
}

export async function buildPhase4CloudBackupData<T extends Phase3AppDataLike>(localData: T, includeCloudTimesheets = false, includeCloudInvoices = false): Promise<CloudResult<Phase4CloudBackupData<T>>> {
  try {
    const [profile, settings, preferences, clients, ratePresets, timesheets, invoices, businessLogo] = await Promise.all([
      getCurrentProfile(),
      getCurrentBusinessSettings({ ...localData.profile, businessLogoDataUrl: "" }),
      getCurrentUserPreferences({ onboardingDismissed: localData.onboardingDismissed, uiPreferences: {} }),
      listClients(),
      listRatePresets(),
      includeCloudTimesheets ? listTimesheetsWithEntries() : Promise.resolve(cloudOk<unknown[]>([])),
      includeCloudInvoices ? listInvoicesWithLinesAndPayments(localData.invoices as CrewInvoice[]) : Promise.resolve(cloudOk<unknown[]>([])),
      loadBusinessLogo(),
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
    if (invoices.error || !invoices.data) return {
      data: null,
      error: `Complete current backup stopped: ${invoices.error || "CrewQuote could not fetch cloud Invoices and Payments."} Browser recovery data was not labelled as current.`,
    };
    if (businessLogo.error) return {
      data: null,
      error: `Complete current backup stopped: ${businessLogo.error} The current private logo could not be included, so browser recovery data was not labelled as current.`,
    };

    const appData = {
      ...localData,
      profile: {
        ...settings.data.profile,
        businessLogoDataUrl: businessLogo.data?.dataUrl || localData.profile.businessLogoDataUrl || settings.data.profile.businessLogoDataUrl || "",
      },
      clients: clients.data,
      timesheets: includeCloudTimesheets ? timesheets.data : localData.timesheets,
      invoices: includeCloudInvoices ? invoices.data : localData.invoices,
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
        businessLogo: {
          cloudBacked: Boolean(businessLogo.data),
          mimeType: businessLogo.data?.mimeType || null,
          sizeBytes: businessLogo.data?.sizeBytes || 0,
          dataUrl: businessLogo.data?.dataUrl || "",
        },
        ...(includeCloudTimesheets ? { timesheets: timesheets.data } : {}),
        ...(includeCloudInvoices ? { invoices: invoices.data } : {}),
      },
    });
  } catch (error) {
    return cloudFail(error);
  }
}

export async function buildCloudAwareBackupData<T extends Phase3AppDataLike>(localData: T, includeCloudTimesheets = false, includeCloudInvoices = false): Promise<CloudResult<T>> {
  const complete = await buildPhase4CloudBackupData(localData, includeCloudTimesheets, includeCloudInvoices);
  return complete.error || !complete.data ? cloudFail(complete.error) : cloudOk(complete.data.appData);
}
