import type { ImportCounts, Phase3AppDataLike } from "../data/crewquoteTypes";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import { getCurrentUserId } from "../data/cloudDataProvider";
import { saveCurrentBusinessSettings } from "./businessSettingsService";
import { saveCurrentUserPreferences } from "./userPreferencesService";
import { listClients, upsertClientByLegacyId } from "./clientService";
import { completeImportBatch, failImportBatch, findCompletedImportBatch, startImportBatch } from "./importBatchService";
import { markMigrationCompletedForUser, claimLocalDataOwner } from "../data/localCompatibilityStore";

export interface Phase3MigrationSummary {
  businessSettingsFound: boolean;
  clientCount: number;
  rateMemoryCount: number;
  timesheetCount: number;
  invoiceCount: number;
}

export interface Phase3MigrationResult {
  fingerprint: string;
  alreadyCompleted: boolean;
  counts: ImportCounts;
}

function isMeaningfulProfile(profile: Phase3AppDataLike["profile"]) {
  return Boolean(
    profile.fullName ||
    profile.companyName ||
    profile.email ||
    profile.phone ||
    profile.address ||
    profile.businessLogoDataUrl ||
    profile.bankAccountNumber ||
    profile.defaultDayRate,
  );
}

export function summarizePhase3MigrationSource(data: Phase3AppDataLike): Phase3MigrationSummary {
  return {
    businessSettingsFound: isMeaningfulProfile(data.profile),
    clientCount: data.clients.length,
    rateMemoryCount: data.clients.filter(client => Boolean(client.rateMemory)).length,
    timesheetCount: data.timesheets.length,
    invoiceCount: data.invoices.length,
  };
}

export function hasPhase3MigrationSource(data: Phase3AppDataLike) {
  const summary = summarizePhase3MigrationSource(data);
  return summary.businessSettingsFound || summary.clientCount > 0 || summary.rateMemoryCount > 0 || data.onboardingDismissed;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function createPhase3MigrationFingerprint(data: Phase3AppDataLike) {
  const profileForCloud = { ...data.profile, businessLogoDataUrl: "" };
  const source = {
    profile: profileForCloud,
    clients: data.clients.map(client => ({ ...client })),
    onboardingDismissed: data.onboardingDismissed,
    dataVersion: data.dataVersion,
  };
  return sha256Hex(JSON.stringify(canonicalize(source)));
}

export async function migrateBrowserDataToCloud(data: Phase3AppDataLike, appVersion: string): Promise<CloudResult<Phase3MigrationResult>> {
  let batchId = "";
  const counts: ImportCounts = { business_settings: 0, user_preferences: 0, clients: 0, rate_presets: 0 };
  try {
    const userIdResult = await getCurrentUserId();
    if (userIdResult.error || !userIdResult.data) return cloudFail(userIdResult.error);
    const fingerprint = await createPhase3MigrationFingerprint(data);
    const already = await findCompletedImportBatch(fingerprint);
    if (already.error) return cloudFail(already.error);
    if (already.data) {
      markMigrationCompletedForUser(userIdResult.data, fingerprint);
      claimLocalDataOwner(userIdResult.data);
      return cloudOk({ fingerprint, alreadyCompleted: true, counts });
    }

    const started = await startImportBatch(fingerprint, appVersion, data.dataVersion);
    if (started.error || !started.data) return cloudFail(started.error || "CrewQuote could not start the cloud import.");
    batchId = started.data;

    const settings = await saveCurrentBusinessSettings(data.profile, data.profile);
    if (settings.error) throw new Error(settings.error);
    counts.business_settings = 1;

    const preferences = await saveCurrentUserPreferences({ onboardingDismissed: data.onboardingDismissed, uiPreferences: {} });
    if (preferences.error) throw new Error(preferences.error);
    counts.user_preferences = 1;

    for (const client of data.clients) {
      const result = await upsertClientByLegacyId(client);
      if (result.error) throw new Error(result.error);
      counts.clients += 1;
    }

    const cloudClients = await listClients();
    if (cloudClients.error || !cloudClients.data) throw new Error(cloudClients.error || "CrewQuote could not verify imported clients.");
    const missingClient = data.clients.find(local => !cloudClients.data?.some(cloud => cloud.id === local.id));
    if (missingClient) throw new Error("CrewQuote could not verify every imported client. Please retry the migration.");

    const completed = await completeImportBatch(batchId, counts);
    if (completed.error) throw new Error(completed.error);

    markMigrationCompletedForUser(userIdResult.data, fingerprint);
    claimLocalDataOwner(userIdResult.data);
    return cloudOk({ fingerprint, alreadyCompleted: false, counts });
  } catch (error) {
    if (batchId) void failImportBatch(batchId, counts);
    return cloudFail(error);
  }
}
