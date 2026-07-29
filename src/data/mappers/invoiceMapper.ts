import type { Database, Json } from "../../types/database.types";
import type { CrewInvoice, CrewInvoiceSellerSnapshot } from "../crewquoteTypes";

type Row = Database["public"]["Tables"]["invoices"]["Row"];
type Insert = Database["public"]["Tables"]["invoices"]["Insert"];
type Update = Database["public"]["Tables"]["invoices"]["Update"];

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const json = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;

function sellerSnapshotWithoutLogo(value?: CrewInvoiceSellerSnapshot): CrewInvoiceSellerSnapshot | undefined {
  return value ? { ...value, businessLogoDataUrl: "" } : undefined;
}

export function invoiceSnapshotForCloud(invoice: CrewInvoice): Json {
  return json({
    ...invoice,
    sellerLogoDataUrl: "",
    sellerSnapshot: sellerSnapshotWithoutLogo(invoice.sellerSnapshot),
  });
}

export function invoiceRowToModel(row: Row, clientLegacyId?: string, sourceTimesheetLegacyId?: string, localRecovery?: CrewInvoice): CrewInvoice {
  const snapshot = object(row.invoice_snapshot) as Partial<CrewInvoice>;
  const snapshotSeller = snapshot.sellerSnapshot as CrewInvoiceSellerSnapshot | undefined;
  const recoverySeller = localRecovery?.sellerSnapshot;
  return {
    ...snapshot,
    id: row.legacy_id || row.id,
    invoiceNumber: row.invoice_number,
    poNumber: row.po_number || "",
    issueDate: row.issue_date,
    dueDate: row.due_date,
    clientId: clientLegacyId || snapshot.clientId,
    clientName: row.client_name,
    client: snapshot.client,
    crewName: row.crew_name,
    role: row.role,
    companyName: row.company_name,
    sellerLogoDataUrl: localRecovery?.sellerLogoDataUrl || "",
    sellerSnapshot: snapshotSeller || row.seller_snapshot
      ? {
          ...((snapshotSeller || object(row.seller_snapshot)) as unknown as CrewInvoiceSellerSnapshot),
          businessLogoDataUrl: recoverySeller?.businessLogoDataUrl || "",
        }
      : undefined,
    productionName: row.production_name || "",
    timesheetNumber: row.timesheet_number,
    timesheetDates: row.timesheet_dates || "",
    detailMode: row.detail_mode,
    lineItems: [],
    timesheetBreakdown: [],
    subtotal: n(row.subtotal),
    vat: n(row.vat),
    vatAmount: n(row.vat_amount),
    total: n(row.total),
    paidAmount: n(row.paid_amount),
    paidDate: row.paid_date || "",
    balanceDue: n(row.balance_due),
    currency: row.currency,
    status: row.status,
    banking: object(row.banking) as Record<string, string>,
    paymentTerms: row.payment_terms || "",
    paymentNotes: row.payment_notes,
    notes: row.notes || "",
    fromTimesheetId: row.source_timesheet_legacy_id || snapshot.fromTimesheetId || sourceTimesheetLegacyId || "",
    payments: [],
    createdAt: row.created_at,
  };
}

export function invoiceModelToInsert(invoice: CrewInvoice, userId: string, clientUuid: string | null, timesheetUuid: string | null): Insert {
  return {
    user_id: userId,
    legacy_id: invoice.id,
    source_timesheet_legacy_id: invoice.fromTimesheetId || null,
    from_timesheet_id: timesheetUuid,
    client_id: clientUuid,
    invoice_number: invoice.invoiceNumber,
    po_number: invoice.poNumber || null,
    issue_date: invoice.issueDate,
    due_date: invoice.dueDate,
    client_name: invoice.clientName || "",
    crew_name: invoice.crewName || "",
    role: invoice.role || "",
    company_name: invoice.companyName || "",
    seller_logo_path: null,
    seller_snapshot: invoice.sellerSnapshot ? json(sellerSnapshotWithoutLogo(invoice.sellerSnapshot)) : null,
    production_name: invoice.productionName || null,
    timesheet_number: invoice.timesheetNumber || "",
    timesheet_dates: invoice.timesheetDates || null,
    detail_mode: invoice.detailMode || "detailed",
    subtotal: n(invoice.subtotal),
    vat: n(invoice.vat),
    vat_amount: n(invoice.vatAmount),
    total: n(invoice.total),
    paid_amount: n(invoice.paidAmount),
    paid_date: invoice.paidDate || null,
    balance_due: n(invoice.balanceDue ?? Math.max(n(invoice.total) - n(invoice.paidAmount), 0)),
    currency: invoice.currency as Insert["currency"],
    status: invoice.status,
    banking: json(invoice.banking || {}),
    payment_terms: invoice.paymentTerms || null,
    payment_notes: invoice.paymentNotes || "",
    notes: invoice.notes || null,
    invoice_snapshot: invoiceSnapshotForCloud(invoice),
    created_at: invoice.createdAt || new Date().toISOString(),
  };
}

export function invoiceModelToUpdate(invoice: CrewInvoice, clientUuid: string | null, timesheetUuid: string | null): Update {
  const { user_id, created_at, ...update } = invoiceModelToInsert(invoice, "00000000-0000-0000-0000-000000000000", clientUuid, timesheetUuid);
  void user_id; void created_at;
  return update;
}
