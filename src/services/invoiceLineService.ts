import { getCurrentUserId } from "../data/cloudDataProvider";
import type { CrewInvoiceLine } from "../data/crewquoteTypes";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import { invoiceLineModelToInsert, invoiceLineModelToUpdate, invoiceLineRowToModel, type InvoiceLineCollection } from "../data/mappers/invoiceLineMapper";
import { getSupabaseBrowserClient } from "../lib/supabase";

export interface InvoiceLineSetItem { line: CrewInvoiceLine; collection: InvoiceLineCollection; order: number }

async function sourceEntryMap(userId: string, items: InvoiceLineSetItem[]) {
  const legacyIds = [...new Set(items.map(item => item.line.sourceEntryId).filter((value): value is string => Boolean(value)))];
  if (!legacyIds.length) return new Map<string, string>();
  const { data, error } = await getSupabaseBrowserClient().from("timesheet_entries").select("id, legacy_id").eq("user_id", userId).in("legacy_id", legacyIds);
  if (error) throw error;
  return new Map((data || []).flatMap(row => row.legacy_id ? [[row.legacy_id, row.id] as const] : []));
}

export async function listInvoiceLines(invoiceUuid: string): Promise<CloudResult<InvoiceLineSetItem[]>> {
  try {
    const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error);
    const { data, error } = await getSupabaseBrowserClient().from("invoice_lines").select("*").eq("user_id", user.data).eq("invoice_id", invoiceUuid).order("line_order");
    if (error) return cloudFail(error);
    return cloudOk((data || []).map(row => ({ ...invoiceLineRowToModel(row), order: row.line_order })));
  } catch (error) { return cloudFail(error); }
}

export async function createInvoiceLine(item: InvoiceLineSetItem, invoiceUuid: string): Promise<CloudResult<CrewInvoiceLine>> {
  try {
    const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error);
    const sources = await sourceEntryMap(user.data, [item]);
    const { data, error } = await getSupabaseBrowserClient().from("invoice_lines")
      .insert(invoiceLineModelToInsert(item.line, item.collection, item.order, user.data, invoiceUuid, item.line.sourceEntryId ? sources.get(item.line.sourceEntryId) || null : null))
      .select("*").single();
    return error ? cloudFail(error) : cloudOk(invoiceLineRowToModel(data).line);
  } catch (error) { return cloudFail(error); }
}

export async function updateInvoiceLine(item: InvoiceLineSetItem, invoiceUuid: string): Promise<CloudResult<CrewInvoiceLine>> {
  try {
    const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error);
    const sources = await sourceEntryMap(user.data, [item]);
    const { data, error } = await getSupabaseBrowserClient().from("invoice_lines")
      .update(invoiceLineModelToUpdate(item.line, item.collection, item.order, invoiceUuid, item.line.sourceEntryId ? sources.get(item.line.sourceEntryId) || null : null))
      .eq("user_id", user.data).eq("legacy_id", item.line.id).select("*").maybeSingle();
    return error || !data ? cloudFail(error || "CrewQuote could not find the Invoice line in your account.") : cloudOk(invoiceLineRowToModel(data).line);
  } catch (error) { return cloudFail(error); }
}

export async function deleteInvoiceLine(legacyId: string): Promise<CloudResult<true>> {
  try {
    const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error);
    const { error } = await getSupabaseBrowserClient().from("invoice_lines").delete().eq("user_id", user.data).eq("legacy_id", legacyId);
    return error ? cloudFail(error) : cloudOk(true);
  } catch (error) { return cloudFail(error); }
}

export async function replaceInvoiceLines(invoiceUuid: string, items: InvoiceLineSetItem[]): Promise<CloudResult<InvoiceLineSetItem[]>> {
  try {
    const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error);
    const db = getSupabaseBrowserClient();
    const current = await db.from("invoice_lines").select("id, legacy_id").eq("user_id", user.data).eq("invoice_id", invoiceUuid).order("line_order");
    if (current.error) return cloudFail(current.error);
    for (let index = 0; index < (current.data || []).length; index += 1) {
      const moved = await db.from("invoice_lines").update({ line_order: 100000 + index }).eq("id", current.data![index].id).eq("user_id", user.data);
      if (moved.error) return cloudFail(moved.error);
    }
    const sources = await sourceEntryMap(user.data, items);
    const keep = new Set(items.map(item => item.line.id));
    for (const item of items) {
      const existing = await db.from("invoice_lines").select("id, invoice_id").eq("user_id", user.data).eq("legacy_id", item.line.id).maybeSingle();
      if (existing.error) return cloudFail(existing.error);
      if (existing.data && existing.data.invoice_id !== invoiceUuid) return cloudFail("CrewQuote found an Invoice-line ID attached to another Invoice.");
      const sourceUuid = item.line.sourceEntryId ? sources.get(item.line.sourceEntryId) || null : null;
      const saved = existing.data
        ? await db.from("invoice_lines").update(invoiceLineModelToUpdate(item.line, item.collection, item.order, invoiceUuid, sourceUuid)).eq("id", existing.data.id)
        : await db.from("invoice_lines").insert(invoiceLineModelToInsert(item.line, item.collection, item.order, user.data, invoiceUuid, sourceUuid));
      if (saved.error) return cloudFail(saved.error);
    }
    for (const row of current.data || []) {
      if (row.legacy_id && keep.has(row.legacy_id)) continue;
      const removed = await db.from("invoice_lines").delete().eq("id", row.id).eq("user_id", user.data);
      if (removed.error) return cloudFail(removed.error);
    }
    return listInvoiceLines(invoiceUuid);
  } catch (error) { return cloudFail(error); }
}
