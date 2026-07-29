import type { Database } from "../../types/database.types";
import type { CrewTimesheet } from "../crewquoteTypes";
import { assertFrozenSummaryPayload, type FrozenTimesheetDatabaseSummaryPayload } from "../../domain/calculations/timesheetCalculationSnapshots";

type Row = Database["public"]["Tables"]["timesheets"]["Row"];
type Insert = Database["public"]["Tables"]["timesheets"]["Insert"];
type Update = Database["public"]["Tables"]["timesheets"]["Update"];

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const nullable = (value?: number) => value === undefined ? null : value;

export function timesheetRowToModel(row: Row, clientId?: string): CrewTimesheet {
  return {
    id: row.legacy_id || row.id, timesheetNumber: row.timesheet_number, productionName: row.production_name,
    clientId, clientName: row.client_name || "", clientIncomplete: row.client_incomplete, crewName: row.crew_name,
    role: row.role, startDate: row.start_date || undefined, notes: row.notes || "", currency: row.currency,
    vat: n(row.vat), status: row.status, entries: [], paymentTerms: row.payment_terms || "",
    defaultDayRate: row.default_day_rate ?? undefined, defaultIncludedHours: row.default_included_hours ?? undefined,
    defaultEquipmentRental: row.default_equipment_rental ?? undefined, defaultPerDiem: row.default_per_diem ?? undefined,
    defaultOvertimeRule: row.default_overtime_rule ?? undefined, defaultOtBand1Hours: row.default_ot_band1_hours ?? undefined,
    defaultOtBand1Mult: row.default_ot_band1_mult ?? undefined, defaultOtBand2Mult: row.default_ot_band2_mult ?? undefined,
    defaultMinTurnaround: row.default_min_turnaround ?? undefined, defaultTurnaroundMode: row.default_turnaround_mode ?? undefined,
    defaultTurnaroundPenMult: row.default_turnaround_pen_mult ?? undefined, mealBreaksDeducted: row.meal_breaks_deducted ?? undefined,
    travelTimePaid: row.travel_time_paid ?? undefined, equipmentRentalDaily: row.equipment_rental_daily ?? undefined, summarySnapshot: row.summary_snapshot,
    invoiceId: row.invoice_id || undefined, createdAt: row.created_at,
  };
}

export function timesheetModelToInsert(
  value: CrewTimesheet,
  userId: string,
  clientUuid: string | null,
  summary: Partial<FrozenTimesheetDatabaseSummaryPayload> = {},
): Insert {
  return { user_id: userId, legacy_id: value.id, timesheet_number: value.timesheetNumber, production_name: value.productionName,
    client_id: clientUuid, client_name: value.clientName || "", client_incomplete: Boolean(value.clientIncomplete), crew_name: value.crewName,
    role: value.role, start_date: value.startDate || null, notes: value.notes || "", currency: value.currency as Insert["currency"], vat: value.vat,
    status: value.status, payment_terms: value.paymentTerms || "", default_day_rate: nullable(value.defaultDayRate),
    default_included_hours: nullable(value.defaultIncludedHours), default_equipment_rental: nullable(value.defaultEquipmentRental),
    default_per_diem: nullable(value.defaultPerDiem), default_overtime_rule: value.defaultOvertimeRule || null,
    default_ot_band1_hours: nullable(value.defaultOtBand1Hours), default_ot_band1_mult: nullable(value.defaultOtBand1Mult),
    default_ot_band2_mult: nullable(value.defaultOtBand2Mult), default_min_turnaround: nullable(value.defaultMinTurnaround),
    default_turnaround_mode: value.defaultTurnaroundMode || null, default_turnaround_pen_mult: nullable(value.defaultTurnaroundPenMult),
    meal_breaks_deducted: value.mealBreaksDeducted ?? null, travel_time_paid: value.travelTimePaid ?? null,
    equipment_rental_daily: value.equipmentRentalDaily ?? null, ...summary, summary_snapshot: summary.summary_snapshot ?? {} };
}

export function timesheetModelToUpdate(
  value: CrewTimesheet,
  clientUuid: string | null,
  summary: Partial<FrozenTimesheetDatabaseSummaryPayload> = {},
): Update {
  const { user_id, ...update } = timesheetModelToInsert(value, "00000000-0000-0000-0000-000000000000", clientUuid, summary);
  void user_id;
  return update;
}

export function timesheetImportToInsert(value: CrewTimesheet, userId: string, clientUuid: string | null, frozenSummaryPayload: FrozenTimesheetDatabaseSummaryPayload): Insert {
  assertFrozenSummaryPayload(frozenSummaryPayload);
  return timesheetModelToInsert(value, userId, clientUuid, frozenSummaryPayload);
}
