import { getCurrentUserId } from "../data/cloudDataProvider";
import type { CrewInvoice } from "../data/crewquoteTypes";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import { invoiceModelToInsert, invoiceModelToUpdate, invoiceRowToModel } from "../data/mappers/invoiceMapper";
import { invoiceLineRowToModel } from "../data/mappers/invoiceLineMapper";
import { paymentRowToModel } from "../data/mappers/paymentMapper";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { replaceInvoiceLines, type InvoiceLineSetItem } from "./invoiceLineService";
import { replacePayments } from "./paymentService";

async function resolveRelationships(userId: string, invoice: CrewInvoice) {
  const db = getSupabaseBrowserClient();
  const [client, timesheet] = await Promise.all([
    invoice.clientId ? db.from("clients").select("id").eq("user_id", userId).eq("legacy_id", invoice.clientId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    invoice.fromTimesheetId ? db.from("timesheets").select("id").eq("user_id", userId).eq("legacy_id", invoice.fromTimesheetId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (client.error || timesheet.error) throw client.error || timesheet.error;
  return { clientUuid: client.data?.id || null, timesheetUuid: timesheet.data?.id || null };
}

function lineSet(invoice: CrewInvoice): InvoiceLineSetItem[] {
  return [
    ...(invoice.lineItems || []).map((line, order) => ({ line, collection: "lineItems" as const, order })),
    ...(invoice.timesheetBreakdown || []).map((line, index) => ({ line, collection: "timesheetBreakdown" as const, order: (invoice.lineItems || []).length + index })),
  ];
}

export async function listInvoicesWithLinesAndPayments(localRecovery: CrewInvoice[] = []): Promise<CloudResult<CrewInvoice[]>> {
  try {
    const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error); const db = getSupabaseBrowserClient();
    const [headers, clients, timesheets, lines, payments] = await Promise.all([
      db.from("invoices").select("*").eq("user_id", user.data).order("created_at", { ascending: false }),
      db.from("clients").select("id, legacy_id").eq("user_id", user.data),
      db.from("timesheets").select("id, legacy_id").eq("user_id", user.data),
      db.from("invoice_lines").select("*").eq("user_id", user.data).order("line_order"),
      db.from("payments").select("*").eq("user_id", user.data).order("payment_date"),
    ]);
    if (headers.error || clients.error || timesheets.error || lines.error || payments.error) return cloudFail(headers.error || clients.error || timesheets.error || lines.error || payments.error);
    const clientIds = new Map((clients.data || []).map(row => [row.id, row.legacy_id || row.id]));
    const timesheetIds = new Map((timesheets.data || []).map(row => [row.id, row.legacy_id || row.id]));
    const recovery = new Map(localRecovery.map(invoice => [invoice.id, invoice]));
    const models = (headers.data || []).map(row => invoiceRowToModel(row, row.client_id ? clientIds.get(row.client_id) : undefined, row.from_timesheet_id ? timesheetIds.get(row.from_timesheet_id) : undefined, row.legacy_id ? recovery.get(row.legacy_id) : undefined));
    const byUuid = new Map((headers.data || []).map((row, index) => [row.id, models[index]]));
    for (const row of lines.data || []) {
      const target = byUuid.get(row.invoice_id); if (!target) continue;
      const mapped = invoiceLineRowToModel(row);
      if (mapped.collection === "timesheetBreakdown") (target.timesheetBreakdown ||= []).push(mapped.line); else target.lineItems.push(mapped.line);
    }
    for (const row of payments.data || []) { const target = byUuid.get(row.invoice_id); if (target) (target.payments ||= []).push(paymentRowToModel(row)); }
    return cloudOk(models);
  } catch (error) { return cloudFail(error); }
}

export async function getInvoice(legacyId: string, localRecovery?: CrewInvoice): Promise<CloudResult<CrewInvoice | null>> {
  const listed = await listInvoicesWithLinesAndPayments(localRecovery ? [localRecovery] : []);
  return listed.error || !listed.data ? cloudFail(listed.error) : cloudOk(listed.data.find(invoice => invoice.id === legacyId) || null);
}

async function saveInvoice(invoice: CrewInvoice): Promise<CloudResult<CrewInvoice>> {
  try {
    const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error); const db = getSupabaseBrowserClient();
    const relation = await resolveRelationships(user.data, invoice);
    const existing = await db.from("invoices").select("id").eq("user_id", user.data).eq("legacy_id", invoice.id).maybeSingle();
    if (existing.error) return cloudFail(existing.error);
    const header = existing.data
      ? await db.from("invoices").update(invoiceModelToUpdate(invoice, relation.clientUuid, relation.timesheetUuid)).eq("id", existing.data.id).eq("user_id", user.data).select("id").single()
      : await db.from("invoices").insert(invoiceModelToInsert(invoice, user.data, relation.clientUuid, relation.timesheetUuid)).select("id").single();
    if (header.error) return cloudFail(header.error);
    const lines = await replaceInvoiceLines(header.data.id, lineSet(invoice)); if (lines.error) return cloudFail(lines.error);
    const payments = await replacePayments(header.data.id, invoice.payments || []); if (payments.error) return cloudFail(payments.error);
    const reread = await getInvoice(invoice.id, invoice); return reread.error || !reread.data ? cloudFail(reread.error || "CrewQuote could not verify the saved Invoice.") : cloudOk(reread.data);
  } catch (error) { return cloudFail(error); }
}

export async function createInvoice(invoice: CrewInvoice) { return saveInvoice(invoice); }
export async function updateInvoice(invoice: CrewInvoice) { return saveInvoice(invoice); }

export async function updateInvoiceStatus(legacyId: string, status: CrewInvoice["status"]): Promise<CloudResult<CrewInvoice>> {
  const existing = await getInvoice(legacyId); if (existing.error || !existing.data) return cloudFail(existing.error || "CrewQuote could not find the Invoice.");
  return saveInvoice({ ...existing.data, status });
}

export async function deleteInvoice(legacyId: string): Promise<CloudResult<true>> {
  try {
    const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error); const db = getSupabaseBrowserClient();
    const existing = await db.from("invoices").select("id").eq("user_id", user.data).eq("legacy_id", legacyId).maybeSingle();
    if (existing.error) return cloudFail(existing.error); if (!existing.data) return cloudOk(true);
    const payments = await db.from("payments").delete().eq("user_id", user.data).eq("invoice_id", existing.data.id); if (payments.error) return cloudFail(payments.error);
    const lines = await db.from("invoice_lines").delete().eq("user_id", user.data).eq("invoice_id", existing.data.id); if (lines.error) return cloudFail(lines.error);
    const invoice = await db.from("invoices").delete().eq("user_id", user.data).eq("id", existing.data.id); return invoice.error ? cloudFail(invoice.error) : cloudOk(true);
  } catch (error) { return cloudFail(error); }
}
