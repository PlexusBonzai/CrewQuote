import type { CrewTimesheet } from "../../data/crewquoteTypes";
import type { CalculationProfile } from "./timesheetCalculations";
import {
  assertFrozenSummaryPayload,
  auditTimesheetCalculationContext,
  calculationSourceFingerprint,
  evaluateCalculationSnapshot,
  prepareTimesheetMigrationRecords,
  prepareCurrentBaselineSnapshot,
} from "./timesheetCalculationSnapshots";

const profile: CalculationProfile = {
  defaultCurrency: "ZAR",
  defaultDayRate: 1000,
  defaultIncludedHours: 8,
  defaultEquipmentRental: 0,
  defaultPerDiem: 0,
  defaultVat: 15,
  defaultOvertimeRule: "sa-film",
  defaultOtBand1Hours: 4,
  defaultOtBand1Mult: 1.5,
  defaultOtBand2Mult: 2,
  defaultMinTurnaround: 10,
  defaultTurnaroundMode: "warning",
  defaultTurnaroundPenMult: 1.5,
  mealBreaksDeducted: false,
  travelTimePaid: false,
  equipmentRentalDaily: false,
  vatRegistered: true,
};

function fixture(): CrewTimesheet {
  return {
    id: "ts-regression-1",
    timesheetNumber: "T-2026-0001",
    productionName: "Regression Production",
    crewName: "Crew Member",
    role: "Sound",
    startDate: "2026-07-01",
    notes: "",
    currency: "ZAR",
    vat: 15,
    status: "open",
    paymentTerms: "",
    defaultDayRate: 1000,
    defaultIncludedHours: 8,
    defaultEquipmentRental: 0,
    defaultPerDiem: 0,
    defaultOvertimeRule: "sa-film",
    defaultOtBand1Hours: 4,
    defaultOtBand1Mult: 1.5,
    defaultOtBand2Mult: 2,
    defaultMinTurnaround: 10,
    defaultTurnaroundMode: "warning",
    defaultTurnaroundPenMult: 1.5,
    mealBreaksDeducted: false,
    travelTimePaid: false,
    equipmentRentalDaily: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    entries: [{
      id: "day-regression-1",
      date: "2026-07-01",
      productionName: "Regression Production",
      location: "Studio",
      notes: "",
      callTime: "08:00",
      wrapTime: "16:00",
      mealBreakMinutes: 0,
      mealDeducted: false,
      travelStartTime: "",
      travelEndTime: "",
      travelDistance: "",
      travelPaid: false,
      dayRate: 1000,
      includedHours: 8,
      overtimeRule: "sa-film",
      otBand1Hours: 4,
      otBand1Mult: 1.5,
      otBand2Mult: 2,
      equipmentRental: 0,
      perDiem: 0,
      expenses: 0,
      expenseDescription: "",
      vatRateUsed: 15,
      isSunday: false,
      isPublicHoliday: false,
    }],
  };
}

// This is intentionally framework-free so it remains compile-checked until a
// project test runner is introduced. A future test can call this async function.
export async function runTimesheetCalculationSnapshotRegressionHarness() {
  const sheet = fixture();
  const audit = auditTimesheetCalculationContext(sheet);
  if (audit.status !== "needs-review" || !audit.missingHistoricalFields.includes("vatRegistered")) {
    throw new Error("Expected historical VAT registration to require calculation review.");
  }

  const snapshot = await prepareCurrentBaselineSnapshot("user-regression-1", sheet, profile);
  assertFrozenSummaryPayload(snapshot.databaseSummaryPayload);
  if (snapshot.frozenEntryResults.length !== 1 || snapshot.frozenEntryResults[0].entryLegacyId !== sheet.entries[0].id) {
    throw new Error("Expected the frozen work-day calculation to retain the app-facing entry ID.");
  }
  if (snapshot.databaseSummaryPayload.summary_grand_total !== 1150) {
    throw new Error("Expected the regression fixture to preserve its ZAR 1,150.00 total.");
  }
  if (await evaluateCalculationSnapshot("user-regression-1", sheet, snapshot) !== "requires-confirmation") {
    throw new Error("Expected a current baseline to require explicit confirmation.");
  }
  if (await evaluateCalculationSnapshot("another-user", sheet, snapshot) !== "wrong-owner") {
    throw new Error("Expected another account to be blocked from this snapshot.");
  }
  if (await evaluateCalculationSnapshot("user-regression-1", sheet, { ...snapshot, frozenEntryResults: [] }) !== "incomplete") {
    throw new Error("Expected a missing frozen work-day result to be rejected.");
  }
  try {
    assertFrozenSummaryPayload({});
    throw new Error("Expected a missing frozen summary to be rejected.");
  } catch (error) {
    if (error instanceof Error && error.message === "Expected a missing frozen summary to be rejected.") throw error;
  }

  const originalFingerprint = await calculationSourceFingerprint(sheet);
  const changedFingerprint = await calculationSourceFingerprint({
    ...sheet,
    entries: [{ ...sheet.entries[0], dayRate: 1001 }],
  });
  if (originalFingerprint === changedFingerprint) {
    throw new Error("Expected a calculation-relevant source change to invalidate its fingerprint.");
  }
  const duplicate = await prepareTimesheetMigrationRecords("user-regression-1", [sheet, { ...sheet }], {});
  if (!duplicate.errors.some(error => error.code === "duplicate-timesheet-id")) {
    throw new Error("Expected duplicate timesheet legacy IDs to be rejected before migration.");
  }
}
