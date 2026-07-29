import type { Database, Json } from "../../types/database.types";
import type { CrewInvoiceLine } from "../crewquoteTypes";

type Row = Database["public"]["Tables"]["invoice_lines"]["Row"];
type Insert = Database["public"]["Tables"]["invoice_lines"]["Insert"];
type Update = Database["public"]["Tables"]["invoice_lines"]["Update"];
export type InvoiceLineCollection = "lineItems" | "timesheetBreakdown";

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function invoiceLineRowToModel(row: Row): { line: CrewInvoiceLine; collection: InvoiceLineCollection } {
  const metadata = object(row.metadata);
  return {
    collection: metadata.collection === "timesheetBreakdown" ? "timesheetBreakdown" : "lineItems",
    line: {
      id: row.legacy_id || row.id,
      description: row.description,
      quantity: n(row.quantity),
      unitPrice: n(row.unit_price),
      amount: n(row.amount),
      isExtra: row.is_extra,
      taxable: row.taxable,
      category: row.category,
      sourceEntryId: typeof metadata.sourceEntryId === "string" ? metadata.sourceEntryId : undefined,
    },
  };
}

export function invoiceLineModelToInsert(
  line: CrewInvoiceLine,
  collection: InvoiceLineCollection,
  order: number,
  userId: string,
  invoiceUuid: string,
  sourceEntryUuid: string | null,
): Insert {
  return {
    user_id: userId,
    invoice_id: invoiceUuid,
    legacy_id: line.id,
    line_order: order,
    description: line.description || "",
    quantity: n(line.quantity),
    unit_price: n(line.unitPrice),
    amount: n(line.amount),
    is_extra: Boolean(line.isExtra),
    taxable: line.taxable !== false,
    category: line.category || "additional",
    source_type: line.isExtra ? "manual" : line.sourceEntryId ? "timesheet_entry" : "timesheet",
    source_timesheet_entry_id: sourceEntryUuid,
    source_day_expense_id: null,
    unit_label: "",
    is_manual: Boolean(line.isExtra || line.category === "additional"),
    metadata: { collection, sourceEntryId: line.sourceEntryId || null } as Json,
  };
}

export function invoiceLineModelToUpdate(
  line: CrewInvoiceLine,
  collection: InvoiceLineCollection,
  order: number,
  invoiceUuid: string,
  sourceEntryUuid: string | null,
): Update {
  const { user_id, ...update } = invoiceLineModelToInsert(line, collection, order, "00000000-0000-0000-0000-000000000000", invoiceUuid, sourceEntryUuid);
  void user_id;
  return update;
}
