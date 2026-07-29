import type { Json, TablesInsert } from "../../types/database.types";
import type { CrewTimesheet, CrewTimesheetEntry } from "../../data/crewquoteTypes";
import {
  calcSummary,
  profileForTimesheet,
  type CalculationProfile,
} from "./timesheetCalculations";
import {
  saveCalculationSnapshot,
  validateCalculationSnapshotOwner,
} from "../../data/localCompatibilityStore";

export type SnapshotSource =
  | "persisted-historical-context"
  | "user-confirmed-current-baseline";
export type SnapshotStatus =
  | "ready"
  | "needs-review"
  | "confirmed"
  | "invalidated"
  | "invalid";

type Summary = ReturnType<typeof calcSummary>;
export type FrozenWorkDayCalculation = {
  entryLegacyId: string;
  calculation: Summary["calcs"][number]["c"];
};

export type FrozenTimesheetDatabaseSummaryPayload = Required<
  Pick<
    TablesInsert<"timesheets">,
    | "summary_day_count"
    | "summary_paid_hours"
    | "summary_overtime_hours"
    | "summary_travel_hours"
    | "summary_day_rate_total"
    | "summary_overtime_total"
    | "summary_equipment_total"
    | "summary_per_diem_total"
    | "summary_expense_total"
    | "summary_turnaround_penalty_total"
    | "summary_subtotal"
    | "summary_vat_rate"
    | "summary_mixed_vat"
    | "summary_vat_amount"
    | "summary_grand_total"
    | "summary_snapshot"
  >
>;

export interface LegacyTimesheetCalculationSnapshotV1 {
  snapshotVersion: 1;
  ownerUserId: string;
  timesheetLegacyId: string;
  source: SnapshotSource;
  status: SnapshotStatus;
  sourceFingerprint: string;
  createdAt: string;
  confirmedAt?: string;
  missingHistoricalFields: string[];
  fallbackFieldsUsed: string[];
  effectiveCalculationProfile: CalculationProfile;
  frozenEntryResults: FrozenWorkDayCalculation[];
  frozenSummary: Summary;
  databaseSummaryPayload: FrozenTimesheetDatabaseSummaryPayload;
}

export interface TimesheetCalculationAudit {
  status: "complete" | "needs-review" | "invalid";
  missingHistoricalFields: string[];
  fallbackFieldsRequired: string[];
  validationErrors: string[];
  affectedEntryIds: string[];
  canReconstructExactHistoricalSummary: boolean;
}

export interface MigrationReadyTimesheet {
  timesheet: CrewTimesheet;
  entries: CrewTimesheetEntry[];
  snapshot: LegacyTimesheetCalculationSnapshotV1;
  frozenEntries: FrozenWorkDayCalculation[];
  frozenSummaryPayload: FrozenTimesheetDatabaseSummaryPayload;
  sourceFingerprint: string;
}

export interface MigrationPreflightResult {
  records: MigrationReadyTimesheet[];
  errors: { timesheetLegacyId: string; code: string }[];
}

const requiredSheet: (keyof CrewTimesheet)[] = [
  "defaultDayRate",
  "defaultIncludedHours",
  "defaultEquipmentRental",
  "defaultPerDiem",
  "defaultOvertimeRule",
  "defaultOtBand1Hours",
  "defaultOtBand1Mult",
  "defaultOtBand2Mult",
  "defaultMinTurnaround",
  "defaultTurnaroundMode",
  "defaultTurnaroundPenMult",
  "mealBreaksDeducted",
  "travelTimePaid",
  "equipmentRentalDaily",
];

const summaryNumberKeys = [
  "summary_day_count",
  "summary_paid_hours",
  "summary_overtime_hours",
  "summary_travel_hours",
  "summary_day_rate_total",
  "summary_overtime_total",
  "summary_equipment_total",
  "summary_per_diem_total",
  "summary_expense_total",
  "summary_turnaround_penalty_total",
  "summary_subtotal",
  "summary_vat_rate",
  "summary_vat_amount",
  "summary_grand_total",
] as const;

const missing = (value: unknown) => value === undefined || value === null;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

function frozenEntriesMatch(
  entries: Array<{ id?: string }>,
  frozenEntries: unknown,
): frozenEntries is FrozenWorkDayCalculation[] {
  if (!Array.isArray(frozenEntries) || frozenEntries.length !== entries.length) return false;
  const localIds = new Set(entries.map(entry => entry.id).filter((id): id is string => Boolean(id)));
  if (localIds.size !== entries.length) return false;
  const frozenIds = new Set<string>();

  for (const frozen of frozenEntries) {
    if (!isRecord(frozen) || typeof frozen.entryLegacyId !== "string" || !frozen.entryLegacyId || !isRecord(frozen.calculation)) return false;
    if (!localIds.has(frozen.entryLegacyId) || frozenIds.has(frozen.entryLegacyId)) return false;
    frozenIds.add(frozen.entryLegacyId);
  }

  return frozenIds.size === localIds.size;
}

export function auditTimesheetCalculationContext(
  timesheet: CrewTimesheet,
  entries = timesheet.entries,
): TimesheetCalculationAudit {
  const missingHistoricalFields = requiredSheet
    .filter(key => missing(timesheet[key]))
    .map(String);
  const validationErrors: string[] = [];
  const affectedEntryIds: string[] = [];

  // CrewQuote does not persist whether VAT was registered on a historical sheet.
  // That flag controls VAT calculation, so an exact reconstruction needs review.
  missingHistoricalFields.push("vatRegistered");

  if (!timesheet.id) validationErrors.push("Missing timesheet legacy ID.");
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry.id || ids.has(entry.id)) {
      validationErrors.push("Missing or duplicate work-day legacy ID.");
      affectedEntryIds.push(entry.id || "unknown");
    }
    ids.add(entry.id);
    if (!entry.date || !entry.callTime || !entry.wrapTime) {
      validationErrors.push("Missing required work-day date or time.");
      affectedEntryIds.push(entry.id);
    }
  }

  if (validationErrors.length) {
    return {
      status: "invalid",
      missingHistoricalFields,
      fallbackFieldsRequired: missingHistoricalFields,
      validationErrors,
      affectedEntryIds,
      canReconstructExactHistoricalSummary: false,
    };
  }

  return {
    status: missingHistoricalFields.length ? "needs-review" : "complete",
    missingHistoricalFields,
    fallbackFieldsRequired: missingHistoricalFields,
    validationErrors,
    affectedEntryIds,
    canReconstructExactHistoricalSummary: missingHistoricalFields.length === 0,
  };
}

export async function calculationSourceFingerprint(timesheet: CrewTimesheet) {
  const source = {
    id: timesheet.id,
    vat: timesheet.vat,
    defaultDayRate: timesheet.defaultDayRate,
    defaultIncludedHours: timesheet.defaultIncludedHours,
    defaultEquipmentRental: timesheet.defaultEquipmentRental,
    defaultPerDiem: timesheet.defaultPerDiem,
    defaultOvertimeRule: timesheet.defaultOvertimeRule,
    defaultOtBand1Hours: timesheet.defaultOtBand1Hours,
    defaultOtBand1Mult: timesheet.defaultOtBand1Mult,
    defaultOtBand2Mult: timesheet.defaultOtBand2Mult,
    defaultMinTurnaround: timesheet.defaultMinTurnaround,
    defaultTurnaroundMode: timesheet.defaultTurnaroundMode,
    defaultTurnaroundPenMult: timesheet.defaultTurnaroundPenMult,
    mealBreaksDeducted: timesheet.mealBreaksDeducted,
    travelTimePaid: timesheet.travelTimePaid,
    equipmentRentalDaily: timesheet.equipmentRentalDaily,
    entries: [...timesheet.entries]
      .map(entry => ({
        id: entry.id,
        date: entry.date,
        callTime: entry.callTime,
        wrapTime: entry.wrapTime,
        mealBreakMinutes: entry.mealBreakMinutes,
        mealDeducted: entry.mealDeducted,
        travelStartTime: entry.travelStartTime,
        travelEndTime: entry.travelEndTime,
        travelPaid: entry.travelPaid,
        dayRate: entry.dayRate,
        includedHours: entry.includedHours,
        overtimeRule: entry.overtimeRule,
        otBand1Hours: entry.otBand1Hours,
        otBand1Mult: entry.otBand1Mult,
        otBand2Mult: entry.otBand2Mult,
        equipmentRental: entry.equipmentRental,
        perDiem: entry.perDiem,
        expenses: entry.expenses,
        dayRateUsed: entry.dayRateUsed,
        includedHoursUsed: entry.includedHoursUsed,
        overtimeRuleUsed: entry.overtimeRuleUsed,
        otBand1HoursUsed: entry.otBand1HoursUsed,
        otBand1MultUsed: entry.otBand1MultUsed,
        otBand2MultUsed: entry.otBand2MultUsed,
        equipmentRentalUsed: entry.equipmentRentalUsed,
        perDiemUsed: entry.perDiemUsed,
        vatRateUsed: entry.vatRateUsed,
        travelPaidUsed: entry.travelPaidUsed,
        mealDeductedUsed: entry.mealDeductedUsed,
        turnaroundRuleUsed: entry.turnaroundRuleUsed,
        turnaroundMinimumHoursUsed: entry.turnaroundMinimumHoursUsed,
        turnaroundPenaltyMultUsed: entry.turnaroundPenaltyMultUsed,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(source)),
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function summaryToDatabasePayload(summary: Summary): FrozenTimesheetDatabaseSummaryPayload {
  return {
    summary_day_count: summary.totalDays,
    summary_paid_hours: summary.totalPaidH,
    summary_overtime_hours: summary.totalOtH,
    summary_travel_hours: summary.totalTravH,
    summary_day_rate_total: summary.totalDayRates,
    summary_overtime_total: summary.totalOtCost,
    summary_equipment_total: summary.totalEquip,
    summary_per_diem_total: summary.totalPerDiem,
    summary_expense_total: summary.totalExp,
    summary_turnaround_penalty_total: summary.totalTurnaroundPenalty,
    summary_subtotal: summary.subtotal,
    summary_vat_rate: summary.vatPct,
    summary_mixed_vat: summary.mixedVat,
    summary_vat_amount: summary.vatAmt,
    summary_grand_total: summary.grandTotal,
    summary_snapshot: summary as unknown as Json,
  };
}

export function assertFrozenSummaryPayload(
  value: unknown,
): asserts value is FrozenTimesheetDatabaseSummaryPayload {
  if (!isRecord(value)) {
    throw new Error("CrewQuote cannot migrate a timesheet without frozen summary values.");
  }
  if (summaryNumberKeys.some(key => !Number.isFinite(value[key]))) {
    throw new Error("CrewQuote cannot migrate a timesheet with invalid frozen summary numbers.");
  }
  if (typeof value.summary_mixed_vat !== "boolean" || !isRecord(value.summary_snapshot)) {
    throw new Error("CrewQuote cannot migrate an incomplete frozen summary.");
  }
}

export async function evaluateCalculationSnapshot(
  ownerUserId: string,
  timesheet: CrewTimesheet,
  snapshot: unknown,
): Promise<
  | "valid"
  | "missing"
  | "changed-since-confirmation"
  | "wrong-owner"
  | "unsupported-version"
  | "incomplete"
  | "requires-confirmation"
  | "invalid"
> {
  if (!snapshot) return "missing";
  if (!validateCalculationSnapshotOwner(snapshot, ownerUserId)) return "wrong-owner";
  const value = snapshot as Partial<LegacyTimesheetCalculationSnapshotV1>;
  if (value.snapshotVersion !== 1) return "unsupported-version";
  if (!value.frozenSummary || !value.databaseSummaryPayload || !frozenEntriesMatch(timesheet.entries, value.frozenEntryResults)) return "incomplete";
  try {
    assertFrozenSummaryPayload(value.databaseSummaryPayload);
  } catch {
    return "incomplete";
  }
  if (value.status === "invalid" || value.status === "invalidated") return "invalid";
  if (value.sourceFingerprint !== await calculationSourceFingerprint(timesheet)) return "changed-since-confirmation";
  if (value.source === "user-confirmed-current-baseline" && value.status !== "confirmed") return "requires-confirmation";
  if (value.source === "persisted-historical-context" && value.status !== "ready") return "invalid";
  return value.status === "ready" || value.status === "confirmed" ? "valid" : "invalid";
}

export async function prepareTimesheetMigrationRecords(
  ownerUserId: string,
  timesheets: CrewTimesheet[],
  storedSnapshots: Record<string, unknown>,
): Promise<MigrationPreflightResult> {
  const records: MigrationReadyTimesheet[] = [];
  const errors: { timesheetLegacyId: string; code: string }[] = [];
  const ids = new Set<string>();

  for (const timesheet of timesheets) {
    if (!timesheet.id || ids.has(timesheet.id)) {
      errors.push({ timesheetLegacyId: timesheet.id || "unknown", code: "duplicate-timesheet-id" });
      continue;
    }
    ids.add(timesheet.id);
    if (auditTimesheetCalculationContext(timesheet).status === "invalid") {
      errors.push({ timesheetLegacyId: timesheet.id, code: "invalid-local-source" });
      continue;
    }
    const snapshot = storedSnapshots[timesheet.id];
    const state = await evaluateCalculationSnapshot(ownerUserId, timesheet, snapshot);
    if (state !== "valid") {
      errors.push({ timesheetLegacyId: timesheet.id, code: state });
      continue;
    }
    const valid = snapshot as LegacyTimesheetCalculationSnapshotV1;
    try {
      assertFrozenSummaryPayload(valid.databaseSummaryPayload);
    } catch {
      errors.push({ timesheetLegacyId: timesheet.id, code: "incomplete-frozen-summary" });
      continue;
    }
    records.push({
      timesheet,
      entries: timesheet.entries,
      snapshot: valid,
      frozenEntries: valid.frozenEntryResults,
      frozenSummaryPayload: valid.databaseSummaryPayload,
      sourceFingerprint: valid.sourceFingerprint,
    });
  }

  return { records, errors };
}

export async function prepareCurrentBaselineSnapshot(
  ownerUserId: string,
  timesheet: CrewTimesheet,
  currentProfile: CalculationProfile,
): Promise<LegacyTimesheetCalculationSnapshotV1> {
  const audit = auditTimesheetCalculationContext(timesheet);
  const effective = profileForTimesheet(currentProfile, timesheet);
  const summary = calcSummary(timesheet.entries, effective);
  return {
    snapshotVersion: 1,
    ownerUserId,
    timesheetLegacyId: timesheet.id,
    source: "user-confirmed-current-baseline",
    status: "needs-review",
    sourceFingerprint: await calculationSourceFingerprint(timesheet),
    createdAt: new Date().toISOString(),
    missingHistoricalFields: audit.missingHistoricalFields,
    fallbackFieldsUsed: audit.fallbackFieldsRequired,
    effectiveCalculationProfile: effective,
    frozenEntryResults: summary.calcs.map(({ entry, c }) => ({
      entryLegacyId: entry.id,
      calculation: c,
    })),
    frozenSummary: summary,
    databaseSummaryPayload: summaryToDatabasePayload(summary),
  };
}

export function confirmCurrentBaselineSnapshot(
  ownerUserId: string,
  snapshot: LegacyTimesheetCalculationSnapshotV1,
  currentSourceFingerprint: string,
) {
  if (!validateCalculationSnapshotOwner(snapshot, ownerUserId)) {
    throw new Error("CrewQuote cannot confirm another account's calculation snapshot.");
  }
  if (snapshot.sourceFingerprint !== currentSourceFingerprint) {
    throw new Error("This timesheet changed after its baseline was prepared. Review it again before confirming.");
  }
  if (!frozenEntriesMatch(snapshot.frozenSummary.calcs.map(({ entry }) => entry), snapshot.frozenEntryResults)) {
    throw new Error("CrewQuote cannot confirm a baseline with missing frozen work-day results.");
  }
  assertFrozenSummaryPayload(snapshot.databaseSummaryPayload);
  const confirmed = {
    ...snapshot,
    source: "user-confirmed-current-baseline" as const,
    status: "confirmed" as const,
    confirmedAt: new Date().toISOString(),
  };
  saveCalculationSnapshot(ownerUserId, confirmed);
  return confirmed;
}
