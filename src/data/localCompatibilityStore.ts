export const PHASE3_LOCAL_DATA_OWNER_KEY = "cqp-local-data-owner-user-id";
const PHASE3_MIGRATION_COMPLETE_PREFIX = "cqp-phase3-migration-completed-";
const PHASE4_MIGRATION_COMPLETE_PREFIX = "cqp-phase4-timesheets-migration-completed-";
const PHASE4_TIMESHEET_MIRROR_PREFIX = "cqp-phase4-timesheet-mirror-";
const PHASE5_MIGRATION_COMPLETE_PREFIX = "cqp-phase5-invoices-migration-completed-";
const PHASE5_INVOICE_MIRROR_PREFIX = "cqp-phase5-invoice-mirror-";
const CALCULATION_SNAPSHOTS_PREFIX = "cqp-timesheet-calculation-snapshots-v1-";
const BUSINESS_LOGO_RECOVERY_PREFIX = "cqp-business-logo-recovery-v1-";
const BUSINESS_LOGO_BROWSER_ONLY_PREFIX = "cqp-business-logo-browser-only-";

function readString(key: string) {
  try {
    return window.localStorage?.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeString(key: string, value: string) {
  window.localStorage?.setItem(key, value);
}

export function readLocalDataOwnerId() {
  return readString(PHASE3_LOCAL_DATA_OWNER_KEY);
}

export function claimLocalDataOwner(userId: string) {
  writeString(PHASE3_LOCAL_DATA_OWNER_KEY, userId);
}

export function migrationCompletedForUser(userId: string) {
  return readString(`${PHASE3_MIGRATION_COMPLETE_PREFIX}${userId}`) === "true";
}

export function markMigrationCompletedForUser(userId: string, fingerprint: string) {
  writeString(`${PHASE3_MIGRATION_COMPLETE_PREFIX}${userId}`, "true");
  writeString(`${PHASE3_MIGRATION_COMPLETE_PREFIX}${userId}-fingerprint`, fingerprint);
}

export function phase4MigrationCompletedForUser(userId: string) {
  return readString(`${PHASE4_MIGRATION_COMPLETE_PREFIX}${userId}`) === "true";
}

export function markPhase4MigrationCompletedForUser(userId: string, fingerprint: string) {
  writeString(`${PHASE4_MIGRATION_COMPLETE_PREFIX}${userId}`, "true");
  writeString(`${PHASE4_MIGRATION_COMPLETE_PREFIX}${userId}-fingerprint`, fingerprint);
}

export function phase4MigrationFingerprintForUser(userId: string) {
  return readString(`${PHASE4_MIGRATION_COMPLETE_PREFIX}${userId}-fingerprint`);
}

export function writePhase4TimesheetMirror(userId: string, timesheets: unknown[]) {
  window.localStorage?.setItem(`${PHASE4_TIMESHEET_MIRROR_PREFIX}${userId}`, JSON.stringify({ version: 1, timesheets }));
}

export function readPhase4TimesheetMirror(userId: string): unknown[] {
  try {
    const value = JSON.parse(readString(`${PHASE4_TIMESHEET_MIRROR_PREFIX}${userId}`));
    return Array.isArray(value?.timesheets) ? value.timesheets : [];
  } catch { return []; }
}

export function phase5MigrationCompletedForUser(userId: string) {
  return readString(`${PHASE5_MIGRATION_COMPLETE_PREFIX}${userId}`) === "true";
}

export function markPhase5MigrationCompletedForUser(userId: string, fingerprint: string) {
  writeString(`${PHASE5_MIGRATION_COMPLETE_PREFIX}${userId}`, "true");
  writeString(`${PHASE5_MIGRATION_COMPLETE_PREFIX}${userId}-fingerprint`, fingerprint);
}

export function phase5MigrationFingerprintForUser(userId: string) {
  return readString(`${PHASE5_MIGRATION_COMPLETE_PREFIX}${userId}-fingerprint`);
}

export function writePhase5InvoiceMirror(userId: string, invoices: unknown[]) {
  window.localStorage?.setItem(`${PHASE5_INVOICE_MIRROR_PREFIX}${userId}`, JSON.stringify({ version: 1, invoices }));
}

export function readPhase5InvoiceMirror(userId: string): unknown[] {
  try {
    const value = JSON.parse(readString(`${PHASE5_INVOICE_MIRROR_PREFIX}${userId}`));
    return Array.isArray(value?.invoices) ? value.invoices : [];
  } catch { return []; }
}

export function readCalculationSnapshots(ownerUserId: string) {
  try { const value = JSON.parse(readString(`${CALCULATION_SNAPSHOTS_PREFIX}${ownerUserId}`)); return value && typeof value === "object" ? value as Record<string, unknown> : {}; } catch { return {}; }
}
export function getCalculationSnapshot(ownerUserId: string, timesheetLegacyId: string) { return readCalculationSnapshots(ownerUserId)[timesheetLegacyId]; }
export function saveCalculationSnapshot(ownerUserId: string, snapshot: { ownerUserId: string; timesheetLegacyId: string }) { if (snapshot.ownerUserId !== ownerUserId) throw new Error("CrewQuote cannot save a calculation snapshot for another account."); const snapshots = readCalculationSnapshots(ownerUserId); snapshots[snapshot.timesheetLegacyId] = snapshot; writeString(`${CALCULATION_SNAPSHOTS_PREFIX}${ownerUserId}`, JSON.stringify(snapshots)); }
export function removeCalculationSnapshot(ownerUserId: string, timesheetLegacyId: string) { const snapshots = readCalculationSnapshots(ownerUserId); delete snapshots[timesheetLegacyId]; writeString(`${CALCULATION_SNAPSHOTS_PREFIX}${ownerUserId}`, JSON.stringify(snapshots)); }
export function clearCalculationSnapshotsForOwner(ownerUserId: string) { window.localStorage?.removeItem(`${CALCULATION_SNAPSHOTS_PREFIX}${ownerUserId}`); }
export function validateCalculationSnapshotOwner(snapshot: unknown, ownerUserId: string) { return Boolean(snapshot && typeof snapshot === "object" && (snapshot as { ownerUserId?: string }).ownerUserId === ownerUserId); }

export function readBrowserLogoRecovery(ownerUserId: string) {
  return readString(`${BUSINESS_LOGO_RECOVERY_PREFIX}${ownerUserId}`);
}

export function preserveBrowserLogoRecovery(ownerUserId: string, dataUrl: string) {
  if (!ownerUserId || !dataUrl || readBrowserLogoRecovery(ownerUserId)) return;
  writeString(`${BUSINESS_LOGO_RECOVERY_PREFIX}${ownerUserId}`, dataUrl);
}

export function logoKeptBrowserOnlyForUser(ownerUserId: string) {
  return readString(`${BUSINESS_LOGO_BROWSER_ONLY_PREFIX}${ownerUserId}`) === "true";
}

export function markLogoKeptBrowserOnlyForUser(ownerUserId: string) {
  writeString(`${BUSINESS_LOGO_BROWSER_ONLY_PREFIX}${ownerUserId}`, "true");
}
