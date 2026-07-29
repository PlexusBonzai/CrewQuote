import type { Database } from "../../types/database.types";
import type { FrozenWorkDayCalculation } from "../../domain/calculations/timesheetCalculationSnapshots";

type Insert = Database["public"]["Tables"]["day_expenses"]["Insert"];

export function expenseLegacyId(entryId: string) { return `${entryId}:expense`; }

export function entryExpenseToInsert(entry: { id: string; expenses: number; expenseDescription: string }, userId: string, entryUuid: string): Insert {
  const amount = Number.isFinite(entry.expenses) ? Math.max(entry.expenses, 0) : 0;
  return { user_id: userId, legacy_id: expenseLegacyId(entry.id), timesheet_entry_id: entryUuid,
    category: "expense", description: entry.expenseDescription || "Expense", quantity: 1, unit_amount: amount, total_amount: amount, vat_applicable: true, notes: "" };
}

export function entryExpenseImportToInsert(
  entry: { id: string; expenseDescription: string },
  userId: string,
  entryUuid: string,
  frozen: FrozenWorkDayCalculation,
): Insert {
  if (frozen.entryLegacyId !== entry.id || !Number.isFinite(frozen.calculation.expenses)) {
    throw new Error("CrewQuote cannot import a day expense without its frozen work-day calculation.");
  }
  return {
    user_id: userId,
    legacy_id: expenseLegacyId(entry.id),
    timesheet_entry_id: entryUuid,
    category: "expense",
    description: entry.expenseDescription,
    quantity: 1,
    unit_amount: frozen.calculation.expenses,
    total_amount: frozen.calculation.expenses,
    vat_applicable: true,
    notes: "",
  };
}
