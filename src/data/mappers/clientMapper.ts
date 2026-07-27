import type { Database, Json } from "../../types/database.types";
import type { CrewClient, InvoiceDetailMode, RateMemory } from "../crewquoteTypes";

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"];
type ClientUpdate = Database["public"]["Tables"]["clients"]["Update"];

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function invoiceDetailMode(value: string): InvoiceDetailMode {
  return value === "detailed" || value === "summary_timesheet" ? value : "summary";
}

function rateMemoryFromJson(value: Json | null): RateMemory | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  return {
    productionName: stringValue(row.productionName),
    dayRate: numberValue(row.dayRate),
    includedHours: numberValue(row.includedHours, 10),
    overtimeRule: row.overtimeRule === "sa-bcea" || row.overtimeRule === "custom" ? row.overtimeRule : "sa-film",
    otBand1Hours: numberValue(row.otBand1Hours, 4),
    otBand1Mult: numberValue(row.otBand1Mult, 1.5),
    otBand2Mult: numberValue(row.otBand2Mult, 2),
    equipmentRental: numberValue(row.equipmentRental),
    perDiem: numberValue(row.perDiem),
    vat: numberValue(row.vat),
    minTurnaround: numberValue(row.minTurnaround, 10),
    turnaroundMode: row.turnaroundMode === "penalty" || row.turnaroundMode === "manual" ? row.turnaroundMode : "warning",
    turnaroundPenMult: numberValue(row.turnaroundPenMult, 1.5),
    travelPaid: typeof row.travelPaid === "boolean" ? row.travelPaid : true,
    mealDeducted: typeof row.mealDeducted === "boolean" ? row.mealDeducted : true,
    updatedAt: stringValue(row.updatedAt) || new Date().toISOString(),
  };
}

function rateMemoryToJson(value?: RateMemory): Json | null {
  return value ? { ...value } : null;
}

export function clientRowToModel(row: ClientRow): CrewClient {
  return {
    id: row.legacy_id || row.id,
    companyName: row.company_name || "",
    contactPerson: row.contact_person || "",
    email: row.email || "",
    phone: row.phone || "",
    billingAddress: row.billing_address || "",
    vatNumber: row.vat_number || "",
    poRequired: Boolean(row.po_required),
    vendorNumber: row.vendor_number || "",
    accountsEmail: row.accounts_email || "",
    paymentTerms: row.payment_terms || row.default_payment_terms || "",
    preferredInvoiceDetailMode: invoiceDetailMode(row.preferred_invoice_detail_mode),
    defaultPaymentTerms: row.default_payment_terms || row.payment_terms || "",
    rateMemory: rateMemoryFromJson(row.rate_memory),
    notes: row.notes || "",
  };
}

export function clientModelToInsert(client: CrewClient, userId: string): ClientInsert {
  return {
    user_id: userId,
    legacy_id: client.id || null,
    company_name: client.companyName || "",
    contact_person: client.contactPerson || "",
    email: client.email || "",
    phone: client.phone || "",
    billing_address: client.billingAddress || "",
    vat_number: client.vatNumber || "",
    po_required: Boolean(client.poRequired),
    vendor_number: client.vendorNumber || "",
    accounts_email: client.accountsEmail || "",
    payment_terms: client.paymentTerms || client.defaultPaymentTerms || "",
    default_payment_terms: client.defaultPaymentTerms || client.paymentTerms || "",
    preferred_invoice_detail_mode: client.preferredInvoiceDetailMode || "summary",
    rate_memory: rateMemoryToJson(client.rateMemory),
    notes: client.notes || "",
  };
}

export function clientModelToUpdate(client: CrewClient): ClientUpdate {
  const insert = clientModelToInsert(client, "00000000-0000-0000-0000-000000000000");
  const { user_id, ...update } = insert;
  void user_id;
  return update;
}

export function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
