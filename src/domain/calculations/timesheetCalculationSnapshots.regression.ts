import type { CrewTimesheet } from "../../data/crewquoteTypes";
import { calcDay, calcSummary, type CalculationProfile } from "./timesheetCalculations";
import {
  assertFrozenSummaryPayload,
  auditTimesheetCalculationContext,
  calculationSourceFingerprint,
  evaluateCalculationSnapshot,
  prepareTimesheetMigrationRecords,
  prepareCurrentBaselineSnapshot,
  summaryToDatabasePayload,
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
  const phase4Profile: CalculationProfile = {
    ...profile,
    defaultDayRate: 4000,
    defaultIncludedHours: 10,
    defaultEquipmentRental: 1500,
    defaultVat: 0,
    mealBreaksDeducted: true,
    equipmentRentalDaily: true,
    vatRegistered: false,
  };
  const phase4Entry = {
    ...fixture().entries[0],
    id: "day-phase4b-regression",
    callTime: "07:00",
    wrapTime: "20:00",
    mealBreakMinutes: 60,
    mealDeducted: true,
    dayRate: 4000,
    includedHours: 10,
    equipmentRental: 1500,
    expenses: 150,
    expenseDescription: "Parking",
    vatRateUsed: 0,
  };
  const phase4Day = calcDay(phase4Entry, phase4Profile);
  const phase4Summary = calcSummary([phase4Entry], phase4Profile);
  const phase4Payload = summaryToDatabasePayload(phase4Summary);
  if (phase4Day.paidH !== 12 || phase4Day.totalOtH !== 2 || phase4Day.totalOtCost !== 1200 || phase4Day.total !== 6850) {
    throw new Error("Expected the Phase 4B day regression to remain 12 paid hours, 2 overtime hours, ZAR 1,200 overtime, and ZAR 6,850 total.");
  }
  if (phase4Payload.summary_paid_hours !== 12 || phase4Payload.summary_overtime_hours !== 2 || phase4Payload.summary_grand_total !== 6850) {
    throw new Error("Expected the Phase 4B persisted summary regression to retain the saved day values.");
  }
  if (phase4Payload.summary_travel_hours !== phase4Summary.totalTravH || "summary_travel_total" in phase4Payload) {
    throw new Error("Expected totalTravH to map only to summary_travel_hours.");
  }

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
