import type { Database, Json } from "../../types/database.types";
import type { CrewTimesheetEntry } from "../crewquoteTypes";
import type { CalculationProfile } from "../../domain/calculations/timesheetCalculations";
import type { FrozenWorkDayCalculation } from "../../domain/calculations/timesheetCalculationSnapshots";

type Row = Database["public"]["Tables"]["timesheet_entries"]["Row"];
type Insert = Database["public"]["Tables"]["timesheet_entries"]["Insert"];
type Update = Database["public"]["Tables"]["timesheet_entries"]["Update"];
const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function entryRowToModel(row: Row): CrewTimesheetEntry {
  const rate = (row.rate_snapshot || {}) as Record<string, unknown>;
  return { id: row.legacy_id || row.id, date: row.date, productionName: row.production_name, location: row.location, notes: row.notes,
    callTime: row.call_time || "", wrapTime: row.wrap_time || "", mealBreakMinutes: n(row.meal_break_minutes), mealDeducted: row.meal_deducted,
    travelStartTime: row.travel_start_time || "", travelEndTime: row.travel_end_time || "", travelDistance: row.travel_distance,
    travelPaid: row.travel_paid, dayRate: n(row.day_rate), includedHours: n(row.included_hours), overtimeRule: row.overtime_rule,
    otBand1Hours: n(row.ot_band1_hours), otBand1Mult: n(row.ot_band1_mult), otBand2Mult: n(row.ot_band2_mult),
    equipmentRental: n(row.equipment_rental), perDiem: n(row.per_diem), expenses: n(row.expenses), expenseDescription: row.expense_description,
    dayRateUsed: n(rate.dayRateUsed ?? row.day_rate), includedHoursUsed: n(rate.includedHoursUsed ?? row.included_hours),
    overtimeRuleUsed: (rate.overtimeRuleUsed as CrewTimesheetEntry["overtimeRuleUsed"]) || row.overtime_rule,
    otBand1HoursUsed: n(rate.otBand1HoursUsed ?? row.ot_band1_hours), otBand1MultUsed: n(rate.otBand1MultUsed ?? row.ot_band1_mult),
    otBand2MultUsed: n(rate.otBand2MultUsed ?? row.ot_band2_mult), equipmentRentalUsed: n(rate.equipmentRentalUsed ?? row.equipment_rental),
    perDiemUsed: n(rate.perDiemUsed ?? row.per_diem), vatRateUsed: n(rate.vatRateUsed ?? row.vat_rate), travelPaidUsed: row.travel_paid,
    mealDeductedUsed: row.meal_deducted, turnaroundRuleUsed: row.turnaround_mode, turnaroundMinimumHoursUsed: n(row.min_turnaround),
    turnaroundPenaltyMultUsed: n(row.turnaround_pen_mult), calcOnSetHours: n(row.on_set_hours), calcMealHours: n(row.meal_hours),
    calcTravelHours: n(row.travel_hours), calcPaidHours: n(row.paid_hours), calcOvertimeHours: n(row.overtime_hours),
    calcOvertimeCost: n(row.ot_band1_amount) + n(row.ot_band2_amount), calcDayTotal: n(row.day_total), calcSnapshot: row.calc_snapshot, isSunday: row.is_sunday,
    isPublicHoliday: row.is_public_holiday };
}

export function entryModelToInsert(entry: CrewTimesheetEntry, userId: string, timesheetUuid: string, order: number): Insert {
  const rateSnapshot: Json = { dayRateUsed: entry.dayRateUsed ?? entry.dayRate, includedHoursUsed: entry.includedHoursUsed ?? entry.includedHours,
    overtimeRuleUsed: entry.overtimeRuleUsed ?? entry.overtimeRule, otBand1HoursUsed: entry.otBand1HoursUsed ?? entry.otBand1Hours,
    otBand1MultUsed: entry.otBand1MultUsed ?? entry.otBand1Mult, otBand2MultUsed: entry.otBand2MultUsed ?? entry.otBand2Mult,
    equipmentRentalUsed: entry.equipmentRentalUsed ?? entry.equipmentRental, perDiemUsed: entry.perDiemUsed ?? entry.perDiem, vatRateUsed: entry.vatRateUsed ?? 0 };
  return { user_id: userId, legacy_id: entry.id, timesheet_id: timesheetUuid, entry_order: order, date: entry.date,
    production_name: entry.productionName, location: entry.location, notes: entry.notes, call_time: entry.callTime || null, wrap_time: entry.wrapTime || null,
    meal_break_minutes: entry.mealBreakMinutes, meal_deducted: entry.mealDeducted, travel_start_time: entry.travelStartTime || null,
    travel_end_time: entry.travelEndTime || null, travel_distance: entry.travelDistance, travel_paid: entry.travelPaid, day_rate: entry.dayRate,
    included_hours: entry.includedHours, overtime_rule: entry.overtimeRule, ot_band1_hours: entry.otBand1Hours, ot_band1_mult: entry.otBand1Mult,
    ot_band2_mult: entry.otBand2Mult, equipment_rental: entry.equipmentRental, per_diem: entry.perDiem, expenses: entry.expenses,
    expense_description: entry.expenseDescription, vat_rate: entry.vatRateUsed ?? 0, min_turnaround: entry.turnaroundMinimumHoursUsed ?? 0,
    turnaround_mode: entry.turnaroundRuleUsed ?? "warning", turnaround_pen_mult: entry.turnaroundPenaltyMultUsed ?? 0,
    on_set_hours: entry.calcOnSetHours ?? 0, meal_hours: entry.calcMealHours ?? 0, travel_hours: entry.calcTravelHours ?? 0,
    paid_hours: entry.calcPaidHours ?? 0, overtime_hours: entry.calcOvertimeHours ?? 0, day_subtotal: entry.calcDayTotal ?? 0,
    day_total: entry.calcDayTotal ?? 0, rate_snapshot: rateSnapshot, calc_snapshot: {} };
}

export function entryModelToUpdate(entry: CrewTimesheetEntry, timesheetUuid: string, order: number): Update {
  const { user_id, ...update } = entryModelToInsert(entry, "00000000-0000-0000-0000-000000000000", timesheetUuid, order);
  void user_id;
  return update;
}

function requiredBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") throw new Error(`CrewQuote cannot import a work day without ${field}.`);
  return value;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string") throw new Error(`CrewQuote cannot import a work day without ${field}.`);
  return value;
}

export function entryImportToInsert(
  entry: CrewTimesheetEntry,
  userId: string,
  timesheetUuid: string,
  order: number,
  frozen: FrozenWorkDayCalculation,
  profile: CalculationProfile,
): Insert {
  if (frozen.entryLegacyId !== entry.id) {
    throw new Error("CrewQuote cannot import a work day with a mismatched frozen calculation.");
  }
  const calculation = frozen.calculation;
  const numbers = [
    calculation.onSetH, calculation.mealH, calculation.travH, calculation.paidH,
    calculation.totalOtH, calculation.b1H, calculation.b1Cost, calculation.b2H,
    calculation.b2Cost, calculation.total, calculation.totalWithPenalty,
    calculation.turnaroundPenalty, calculation.turnaround ?? 0, calculation.vatRate,
  ];
  if (numbers.some(value => !Number.isFinite(value))) {
    throw new Error("CrewQuote cannot import a work day with invalid frozen calculation values.");
  }

  const mealDeducted = entry.mealDeductedUsed ?? entry.mealDeducted ?? profile.mealBreaksDeducted;
  const travelPaid = entry.travelPaidUsed ?? entry.travelPaid ?? profile.travelTimePaid;
  const minTurnaround = entry.turnaroundMinimumHoursUsed ?? profile.defaultMinTurnaround;
  const turnaroundMode = entry.turnaroundRuleUsed ?? profile.defaultTurnaroundMode;
  const turnaroundPenaltyMult = entry.turnaroundPenaltyMultUsed ?? profile.defaultTurnaroundPenMult;
  const rateSnapshot: Json = {
    dayRateUsed: calculation.dayRate,
    includedHoursUsed: calculation.incH,
    overtimeRuleUsed: calculation.ruleId,
    otBand1HoursUsed: calculation.bands.band1Hours,
    otBand1MultUsed: calculation.bands.band1Mult,
    otBand2MultUsed: calculation.bands.band2Mult,
    equipmentRentalUsed: calculation.equip,
    perDiemUsed: calculation.perDiem,
    vatRateUsed: calculation.vatRate,
    mealDeductedUsed: requiredBoolean(mealDeducted, "a frozen meal deduction rule"),
    travelPaidUsed: requiredBoolean(travelPaid, "a frozen travel rule"),
    turnaroundMinimumHoursUsed: minTurnaround,
    turnaroundRuleUsed: turnaroundMode,
    turnaroundPenaltyMultUsed: turnaroundPenaltyMult,
  };

  return {
    user_id: userId,
    legacy_id: entry.id,
    timesheet_id: timesheetUuid,
    entry_order: order,
    date: requiredString(entry.date, "a work-day date"),
    production_name: requiredString(entry.productionName, "a production name"),
    location: requiredString(entry.location, "a location"),
    notes: requiredString(entry.notes, "notes"),
    call_time: requiredString(entry.callTime, "a call time"),
    wrap_time: requiredString(entry.wrapTime, "a wrap time"),
    meal_break_minutes: entry.mealBreakMinutes,
    meal_deducted: requiredBoolean(mealDeducted, "a frozen meal deduction rule"),
    travel_start_time: entry.travelStartTime || null,
    travel_end_time: entry.travelEndTime || null,
    travel_distance: requiredString(entry.travelDistance, "travel distance"),
    travel_paid: requiredBoolean(travelPaid, "a frozen travel rule"),
    day_rate: calculation.dayRate,
    included_hours: calculation.incH,
    overtime_rule: calculation.ruleId,
    ot_band1_hours: calculation.bands.band1Hours,
    ot_band1_mult: calculation.bands.band1Mult,
    ot_band2_mult: calculation.bands.band2Mult,
    equipment_rental: calculation.equip,
    per_diem: calculation.perDiem,
    expenses: calculation.expenses,
    expense_description: requiredString(entry.expenseDescription, "an expense description"),
    vat_rate: calculation.vatRate,
    min_turnaround: minTurnaround,
    turnaround_mode: turnaroundMode,
    turnaround_pen_mult: turnaroundPenaltyMult,
    on_set_hours: calculation.onSetH,
    meal_hours: calculation.mealH,
    travel_hours: calculation.travH,
    paid_hours: calculation.paidH,
    overtime_hours: calculation.totalOtH,
    ot_band1_worked_hours: calculation.b1H,
    ot_band1_amount: calculation.b1Cost,
    ot_band2_worked_hours: calculation.b2H,
    ot_band2_amount: calculation.b2Cost,
    turnaround_hours: calculation.turnaround ?? 0,
    turnaround_penalty: calculation.turnaroundPenalty,
    overnight: calculation.overnight,
    day_subtotal: calculation.total,
    day_total: calculation.totalWithPenalty,
    rate_snapshot: rateSnapshot,
    calc_snapshot: calculation as unknown as Json,
  };
}
