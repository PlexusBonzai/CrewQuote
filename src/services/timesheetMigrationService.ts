import type { CrewTimesheet } from "../data/crewquoteTypes";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import { getCurrentUserId } from "../data/cloudDataProvider";
import {
  markPhase4MigrationCompletedForUser,
  readLocalDataOwnerId,
  writePhase4TimesheetMirror,
} from "../data/localCompatibilityStore";
import {
  assertFrozenSummaryPayload,
  prepareTimesheetMigrationRecords,
  type MigrationReadyTimesheet,
} from "../domain/calculations/timesheetCalculationSnapshots";
import { entryExpenseImportToInsert, expenseLegacyId } from "../data/mappers/dayExpenseMapper";
import { entryImportToInsert } from "../data/mappers/timesheetEntryMapper";
import { timesheetImportToInsert } from "../data/mappers/timesheetMapper";
import {
  completeImportBatch,
  failImportBatch,
  findCompletedImportBatch,
  startImportBatch,
} from "./importBatchService";
import { listTimesheetsWithEntries } from "./timesheetService";
import { getSupabaseBrowserClient } from "../lib/supabase";

const SOURCE = "localstorage-phase-4-timesheets";

export type Phase4MigrationStage =
  | "preparing"
  | "validating"
  | "checking-previous"
  | "resolving-clients"
  | "importing-timesheets"
  | "importing-work-days"
  | "importing-expenses"
  | "verifying"
  | "updating-compatibility"
  | "complete"
  | "already-migrated";

export interface Phase4MigrationSummary {
  timesheetCount: number;
  entryCount: number;
  expenseCount: number;
  invoiceCount: number;
}

export interface Phase4MigrationPreflight {
  records: MigrationReadyTimesheet[];
  fingerprint: string;
  summary: Phase4MigrationSummary;
}

export interface Phase4MigrationResult {
  fingerprint: string;
  alreadyCompleted: boolean;
  counts: { timesheets: number; timesheet_entries: number; day_expenses: number };
}

export type Phase4Progress = (stage: Phase4MigrationStage, counts: Phase4MigrationResult["counts"]) => void;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((out, key) => {
        out[key] = canonicalize((value as Record<string, unknown>)[key]);
        return out;
      }, {});
  }
  return value;
}

function equalJson(left: unknown, right: unknown) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function equalDecimal(left: unknown, right: unknown) {
  return Math.abs(Number(left) - Number(right)) < 0.000001;
}

async function fingerprint(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeTimesheetLabel(timesheet: CrewTimesheet) {
  return timesheet.timesheetNumber || timesheet.id || "an unnamed timesheet";
}

function assertMigrationReady(records: MigrationReadyTimesheet[], ownerUserId: string) {
  const timesheetIds = new Set<string>();
  const workDayIds = new Set<string>();
  for (const record of records) {
    if (!record.timesheet.id || timesheetIds.has(record.timesheet.id)) {
      throw new Error("CrewQuote cannot import duplicate or missing timesheet legacy IDs.");
    }
    timesheetIds.add(record.timesheet.id);
    if (record.snapshot.ownerUserId !== ownerUserId || record.snapshot.timesheetLegacyId !== record.timesheet.id) {
      throw new Error("CrewQuote cannot import a timesheet using another account's calculation snapshot.");
    }
    if (record.snapshot.source === "persisted-historical-context" && record.snapshot.status !== "ready") {
      throw new Error("CrewQuote cannot import an invalid historical calculation snapshot.");
    }
    if (record.snapshot.source === "user-confirmed-current-baseline" && record.snapshot.status !== "confirmed") {
      throw new Error("CrewQuote cannot import an unconfirmed baseline calculation.");
    }
    if (record.snapshot.source !== "persisted-historical-context" && record.snapshot.source !== "user-confirmed-current-baseline") {
      throw new Error("CrewQuote cannot import an unsupported calculation snapshot source.");
    }
    if (record.sourceFingerprint !== record.snapshot.sourceFingerprint) {
      throw new Error("CrewQuote cannot import a calculation record with a mismatched source fingerprint.");
    }
    assertFrozenSummaryPayload(record.frozenSummaryPayload);
    if (record.entries.length !== record.frozenEntries.length) {
      throw new Error("CrewQuote cannot import a timesheet without every frozen work-day calculation.");
    }
    const frozenById = new Map(record.frozenEntries.map(frozen => [frozen.entryLegacyId, frozen]));
    if (frozenById.size !== record.entries.length) {
      throw new Error("CrewQuote cannot import duplicate frozen work-day calculations.");
    }
    for (const entry of record.entries) {
      if (!entry.id || workDayIds.has(entry.id) || !frozenById.has(entry.id)) {
        throw new Error("CrewQuote cannot import a work day without its matching frozen calculation.");
      }
      workDayIds.add(entry.id);
    }
  }
}

async function resolveClientUuids(records: MigrationReadyTimesheet[], userId: string) {
  const clientIds = [...new Set(records.map(record => record.timesheet.clientId).filter((value): value is string => Boolean(value)))];
  if (!clientIds.length) return new Map<string, string>();
  const { data, error } = await getSupabaseBrowserClient()
    .from("clients")
    .select("id, legacy_id")
    .eq("user_id", userId)
    .in("legacy_id", clientIds);
  if (error) throw new Error("CrewQuote could not verify the cloud clients required by these timesheets.");
  const result = new Map((data || []).flatMap(client => client.legacy_id ? [[client.legacy_id, client.id] as const] : []));
  for (const record of records) {
    const clientId = record.timesheet.clientId;
    if (clientId && !result.has(clientId)) {
      throw new Error(`CrewQuote cannot migrate ${safeTimesheetLabel(record.timesheet)} because its selected client is not available in this account.`);
    }
  }
  return result;
}

async function readTimesheetUuidMap(userId: string, records: MigrationReadyTimesheet[]) {
  const legacyIds = records.map(record => record.timesheet.id);
  if (!legacyIds.length) return new Map<string, string>();
  const { data, error } = await getSupabaseBrowserClient()
    .from("timesheets")
    .select("id, legacy_id")
    .eq("user_id", userId)
    .in("legacy_id", legacyIds);
  if (error) throw new Error("CrewQuote could not re-read imported timesheet headers.");
  const result = new Map((data || []).flatMap(row => row.legacy_id ? [[row.legacy_id, row.id] as const] : []));
  if (result.size !== legacyIds.length) throw new Error("CrewQuote could not resolve every imported timesheet header.");
  return result;
}

async function readEntryUuidMap(userId: string, records: MigrationReadyTimesheet[]) {
  const legacyIds = records.flatMap(record => record.entries.map(entry => entry.id));
  if (!legacyIds.length) return new Map<string, string>();
  const { data, error } = await getSupabaseBrowserClient()
    .from("timesheet_entries")
    .select("id, legacy_id")
    .eq("user_id", userId)
    .in("legacy_id", legacyIds);
  if (error) throw new Error("CrewQuote could not re-read imported work days.");
  const result = new Map((data || []).flatMap(row => row.legacy_id ? [[row.legacy_id, row.id] as const] : []));
  if (result.size !== legacyIds.length) throw new Error("CrewQuote could not resolve every imported work day.");
  return result;
}

async function verifyCloudRecords(records: MigrationReadyTimesheet[], userId: string, clientUuids: Map<string, string>) {
  const db = getSupabaseBrowserClient();
  const timesheetIds = records.map(record => record.timesheet.id);
  const entryIds = records.flatMap(record => record.entries.map(entry => entry.id));
  const expenseIds = records.flatMap(record => record.frozenEntries.filter(entry => entry.calculation.expenses > 0).map(entry => expenseLegacyId(entry.entryLegacyId)));
  const [headers, entries, expenses] = await Promise.all([
    timesheetIds.length ? db.from("timesheets").select("*").eq("user_id", userId).in("legacy_id", timesheetIds) : Promise.resolve({ data: [], error: null }),
    entryIds.length ? db.from("timesheet_entries").select("*").eq("user_id", userId).in("legacy_id", entryIds) : Promise.resolve({ data: [], error: null }),
    expenseIds.length ? db.from("day_expenses").select("*").eq("user_id", userId).in("legacy_id", expenseIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (headers.error || entries.error || expenses.error) throw new Error("CrewQuote could not verify the imported cloud records.");
  if ((headers.data || []).length !== records.length || (entries.data || []).length !== entryIds.length || (expenses.data || []).length !== expenseIds.length) {
    throw new Error("CrewQuote verification found an incomplete set of imported records.");
  }
  const headerByLegacy = new Map((headers.data || []).flatMap(row => row.legacy_id ? [[row.legacy_id, row] as const] : []));
  const entryByLegacy = new Map((entries.data || []).flatMap(row => row.legacy_id ? [[row.legacy_id, row] as const] : []));
  const expenseByLegacy = new Map((expenses.data || []).flatMap(row => row.legacy_id ? [[row.legacy_id, row] as const] : []));

  for (const record of records) {
    const header = headerByLegacy.get(record.timesheet.id);
    if (!header) throw new Error("CrewQuote verification could not find an imported timesheet.");
    const expectedClientUuid = record.timesheet.clientId ? clientUuids.get(record.timesheet.clientId) || null : null;
    if (header.client_id !== expectedClientUuid
      || header.timesheet_number !== record.timesheet.timesheetNumber
      || header.production_name !== record.timesheet.productionName
      || header.crew_name !== record.timesheet.crewName
      || header.role !== record.timesheet.role
      || header.start_date !== (record.timesheet.startDate || null)
      || header.notes !== (record.timesheet.notes || "")
      || header.status !== record.timesheet.status
      || header.payment_terms !== (record.timesheet.paymentTerms || "")) {
      throw new Error(`CrewQuote verification found a mismatched header for ${safeTimesheetLabel(record.timesheet)}.`);
    }
    const summary = record.frozenSummaryPayload;
    if (!equalDecimal(header.summary_day_count, summary.summary_day_count)
      || !equalDecimal(header.summary_paid_hours, summary.summary_paid_hours)
      || !equalDecimal(header.summary_overtime_hours, summary.summary_overtime_hours)
      || !equalDecimal(header.summary_travel_hours, summary.summary_travel_hours)
      || !equalDecimal(header.summary_day_rate_total, summary.summary_day_rate_total)
      || !equalDecimal(header.summary_overtime_total, summary.summary_overtime_total)
      || !equalDecimal(header.summary_equipment_total, summary.summary_equipment_total)
      || !equalDecimal(header.summary_per_diem_total, summary.summary_per_diem_total)
      || !equalDecimal(header.summary_expense_total, summary.summary_expense_total)
      || !equalDecimal(header.summary_turnaround_penalty_total, summary.summary_turnaround_penalty_total)
      || !equalDecimal(header.summary_subtotal, summary.summary_subtotal)
      || !equalDecimal(header.summary_vat_rate, summary.summary_vat_rate)
      || header.summary_mixed_vat !== summary.summary_mixed_vat
      || !equalDecimal(header.summary_vat_amount, summary.summary_vat_amount)
      || !equalDecimal(header.summary_grand_total, summary.summary_grand_total)
      || !equalJson(header.summary_snapshot, summary.summary_snapshot)) {
      throw new Error(`CrewQuote verification found mismatched frozen summary values for ${safeTimesheetLabel(record.timesheet)}.`);
    }
    for (const entry of record.entries) {
      const frozen = record.frozenEntries.find(value => value.entryLegacyId === entry.id);
      const cloudEntry = entryByLegacy.get(entry.id);
      if (!frozen || !cloudEntry || cloudEntry.timesheet_id !== header.id || cloudEntry.date !== entry.date || cloudEntry.call_time !== entry.callTime || cloudEntry.wrap_time !== entry.wrapTime
        || !equalDecimal(cloudEntry.paid_hours, frozen.calculation.paidH)
        || !equalDecimal(cloudEntry.overtime_hours, frozen.calculation.totalOtH)
        || !equalDecimal(cloudEntry.turnaround_penalty, frozen.calculation.turnaroundPenalty)
        || !equalDecimal(cloudEntry.vat_rate, frozen.calculation.vatRate)
        || !equalDecimal(cloudEntry.day_total, frozen.calculation.totalWithPenalty)
        || !equalJson(cloudEntry.calc_snapshot, frozen.calculation)) {
        throw new Error(`CrewQuote verification found mismatched frozen values for a work day in ${safeTimesheetLabel(record.timesheet)}.`);
      }
      if (frozen.calculation.expenses > 0) {
        const expense = expenseByLegacy.get(expenseLegacyId(entry.id));
        if (!expense || expense.timesheet_entry_id !== cloudEntry.id || !equalDecimal(expense.total_amount, frozen.calculation.expenses) || expense.description !== entry.expenseDescription) {
          throw new Error(`CrewQuote verification found a mismatched day expense in ${safeTimesheetLabel(record.timesheet)}.`);
        }
      }
    }
  }
}

async function upsertHeaders(records: MigrationReadyTimesheet[], userId: string, clientUuids: Map<string, string>, counts: Phase4MigrationResult["counts"], onProgress?: Phase4Progress) {
  const db = getSupabaseBrowserClient();
  for (const record of records) {
    const clientUuid = record.timesheet.clientId ? clientUuids.get(record.timesheet.clientId) || null : null;
    const insert = timesheetImportToInsert(record.timesheet, userId, clientUuid, record.frozenSummaryPayload);
    const existing = await db.from("timesheets").select("id").eq("user_id", userId).eq("legacy_id", record.timesheet.id).maybeSingle();
    if (existing.error) throw new Error("CrewQuote could not check an existing timesheet header.");
    const { user_id, ...update } = insert;
    void user_id;
    const saved = existing.data
      ? await db.from("timesheets").update(update).eq("id", existing.data.id)
      : await db.from("timesheets").insert(insert);
    if (saved.error) throw new Error("CrewQuote could not import a timesheet header.");
    counts.timesheets++;
    onProgress?.("importing-timesheets", counts);
  }
}

async function upsertEntries(records: MigrationReadyTimesheet[], userId: string, timesheetUuids: Map<string, string>, counts: Phase4MigrationResult["counts"], onProgress?: Phase4Progress) {
  const db = getSupabaseBrowserClient();
  for (const record of records) {
    const timesheetUuid = timesheetUuids.get(record.timesheet.id);
    if (!timesheetUuid) throw new Error("CrewQuote could not resolve an imported timesheet header.");
    for (let index = 0; index < record.entries.length; index++) {
      const entry = record.entries[index];
      const frozen = record.frozenEntries.find(value => value.entryLegacyId === entry.id);
      if (!frozen) throw new Error("CrewQuote cannot resolve a frozen work-day calculation.");
      const insert = entryImportToInsert(entry, userId, timesheetUuid, index, frozen, record.snapshot.effectiveCalculationProfile);
      const existing = await db.from("timesheet_entries").select("id").eq("user_id", userId).eq("legacy_id", entry.id).maybeSingle();
      if (existing.error) throw new Error("CrewQuote could not check an existing work day.");
      const { user_id, ...update } = insert;
      void user_id;
      const saved = existing.data
        ? await db.from("timesheet_entries").update(update).eq("id", existing.data.id)
        : await db.from("timesheet_entries").insert(insert);
      if (saved.error) throw new Error("CrewQuote could not import a work day.");
      counts.timesheet_entries++;
      onProgress?.("importing-work-days", counts);
    }
  }
}

async function upsertExpenses(records: MigrationReadyTimesheet[], userId: string, entryUuids: Map<string, string>, counts: Phase4MigrationResult["counts"], onProgress?: Phase4Progress) {
  const db = getSupabaseBrowserClient();
  for (const record of records) {
    for (const entry of record.entries) {
      const frozen = record.frozenEntries.find(value => value.entryLegacyId === entry.id);
      if (!frozen || frozen.calculation.expenses <= 0) continue;
      const entryUuid = entryUuids.get(entry.id);
      if (!entryUuid) throw new Error("CrewQuote could not resolve an imported work day.");
      const insert = entryExpenseImportToInsert(entry, userId, entryUuid, frozen);
      const existing = await db.from("day_expenses").select("id").eq("user_id", userId).eq("legacy_id", expenseLegacyId(entry.id)).maybeSingle();
      if (existing.error) throw new Error("CrewQuote could not check an existing day expense.");
      const { user_id, ...update } = insert;
      void user_id;
      const saved = existing.data
        ? await db.from("day_expenses").update(update).eq("id", existing.data.id)
        : await db.from("day_expenses").insert(insert);
      if (saved.error) throw new Error("CrewQuote could not import a day expense.");
      counts.day_expenses++;
      onProgress?.("importing-expenses", counts);
    }
  }
}

export function summarizePhase4Source(timesheets: CrewTimesheet[], invoiceCount: number): Phase4MigrationSummary {
  return {
    timesheetCount: timesheets.length,
    entryCount: timesheets.reduce((count, sheet) => count + sheet.entries.length, 0),
    expenseCount: timesheets.reduce((count, sheet) => count + sheet.entries.filter(entry => entry.expenses > 0).length, 0),
    invoiceCount,
  };
}

export async function createPhase4MigrationFingerprint(records: MigrationReadyTimesheet[]) {
  return fingerprint(records.map(record => ({
    timesheet: {
      id: record.timesheet.id,
      timesheetNumber: record.timesheet.timesheetNumber,
      clientId: record.timesheet.clientId,
      productionName: record.timesheet.productionName,
      crewName: record.timesheet.crewName,
      role: record.timesheet.role,
      startDate: record.timesheet.startDate,
      notes: record.timesheet.notes,
      currency: record.timesheet.currency,
      vat: record.timesheet.vat,
      status: record.timesheet.status,
      paymentTerms: record.timesheet.paymentTerms,
    },
    entries: record.entries.map(entry => ({ ...entry, calcOnSetHours: undefined, calcMealHours: undefined, calcTravelHours: undefined, calcPaidHours: undefined, calcOvertimeHours: undefined, calcOvertimeCost: undefined, calcDayTotal: undefined })).sort((left, right) => left.id.localeCompare(right.id)),
    frozenEntries: record.frozenEntries,
    frozenSummaryPayload: record.frozenSummaryPayload,
    snapshot: {
      source: record.snapshot.source,
      sourceFingerprint: record.snapshot.sourceFingerprint,
      missingHistoricalFields: record.snapshot.missingHistoricalFields,
      fallbackFieldsUsed: record.snapshot.fallbackFieldsUsed,
      effectiveCalculationProfile: record.snapshot.effectiveCalculationProfile,
    },
  })).sort((left, right) => left.timesheet.id.localeCompare(right.timesheet.id)));
}

export async function preflightPhase4TimesheetMigration(input: {
  ownerUserId: string;
  authenticatedUserId: string;
  localTimesheets: CrewTimesheet[];
  storedSnapshots: Record<string, unknown>;
  invoiceCount: number;
}): Promise<CloudResult<Phase4MigrationPreflight>> {
  try {
    const user = await getCurrentUserId();
    if (user.error || !user.data || user.data !== input.authenticatedUserId || user.data !== input.ownerUserId || readLocalDataOwnerId() !== user.data) {
      return cloudFail("This browser's local data belongs to a different account. Sign in with the owning account before migrating timesheets.");
    }
    if (!input.localTimesheets.length) {
      return cloudFail("There are no browser-local timesheets available for Phase 4A migration.");
    }
    const prepared = await prepareTimesheetMigrationRecords(user.data, input.localTimesheets, input.storedSnapshots);
    if (prepared.errors.length) {
      return cloudFail(`Timesheet migration is blocked: ${prepared.errors.map(error => `${error.timesheetLegacyId}: ${error.code}`).join("; ")}`);
    }
    assertMigrationReady(prepared.records, user.data);
    await resolveClientUuids(prepared.records, user.data);
    const summary = summarizePhase4Source(input.localTimesheets, input.invoiceCount);
    return cloudOk({ records: prepared.records, fingerprint: await createPhase4MigrationFingerprint(prepared.records), summary });
  } catch (error) {
    return cloudFail(error);
  }
}

export async function migratePreparedTimesheets(
  records: MigrationReadyTimesheet[],
  appVersion: string,
  dataVersion: number,
  onProgress?: Phase4Progress,
): Promise<CloudResult<Phase4MigrationResult>> {
  let batchId = "";
  const counts = { timesheets: 0, timesheet_entries: 0, day_expenses: 0 };
  try {
    onProgress?.("validating", counts);
    const user = await getCurrentUserId();
    if (user.error || !user.data) return cloudFail(user.error);
    if (readLocalDataOwnerId() !== user.data) return cloudFail("This browser's local data belongs to a different account. Sign in with the owning account before migrating timesheets.");
    assertMigrationReady(records, user.data);
    const sourceFingerprint = await createPhase4MigrationFingerprint(records);
    onProgress?.("checking-previous", counts);
    const completed = await findCompletedImportBatch(sourceFingerprint, SOURCE);
    if (completed.error) return cloudFail(completed.error);
    onProgress?.("resolving-clients", counts);
    const clientUuids = await resolveClientUuids(records, user.data);
    if (completed.data) {
      onProgress?.("verifying", counts);
      await verifyCloudRecords(records, user.data, clientUuids);
      const cloud = await listTimesheetsWithEntries();
      if (cloud.error || !cloud.data) return cloudFail(cloud.error);
      onProgress?.("updating-compatibility", counts);
      writePhase4TimesheetMirror(user.data, cloud.data);
      markPhase4MigrationCompletedForUser(user.data, sourceFingerprint);
      onProgress?.("already-migrated", counts);
      return cloudOk({ fingerprint: sourceFingerprint, alreadyCompleted: true, counts });
    }

    const started = await startImportBatch(sourceFingerprint, appVersion, dataVersion, SOURCE);
    if (started.error || !started.data) return cloudFail(started.error || "CrewQuote could not start the timesheet import.");
    batchId = started.data;
    await upsertHeaders(records, user.data, clientUuids, counts, onProgress);
    const timesheetUuids = await readTimesheetUuidMap(user.data, records);
    await upsertEntries(records, user.data, timesheetUuids, counts, onProgress);
    const entryUuids = await readEntryUuidMap(user.data, records);
    await upsertExpenses(records, user.data, entryUuids, counts, onProgress);
    onProgress?.("verifying", counts);
    await verifyCloudRecords(records, user.data, clientUuids);
    const cloud = await listTimesheetsWithEntries();
    if (cloud.error || !cloud.data) throw new Error(cloud.error || "CrewQuote could not read the verified timesheets.");
    onProgress?.("updating-compatibility", counts);
    writePhase4TimesheetMirror(user.data, cloud.data);
    const done = await completeImportBatch(batchId, counts);
    if (done.error) throw new Error(done.error);
    markPhase4MigrationCompletedForUser(user.data, sourceFingerprint);
    onProgress?.("complete", counts);
    return cloudOk({ fingerprint: sourceFingerprint, alreadyCompleted: false, counts });
  } catch (error) {
    if (batchId) await failImportBatch(batchId, counts);
    return cloudFail(error);
  }
}
