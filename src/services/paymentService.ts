import { getCurrentUserId } from "../data/cloudDataProvider";
import type { CrewPayment } from "../data/crewquoteTypes";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import { paymentModelToInsert, paymentModelToUpdate, paymentRowToModel } from "../data/mappers/paymentMapper";
import { getSupabaseBrowserClient } from "../lib/supabase";

export async function listPayments(invoiceUuid: string): Promise<CloudResult<CrewPayment[]>> {
  try { const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error);
    const { data, error } = await getSupabaseBrowserClient().from("payments").select("*").eq("user_id", user.data).eq("invoice_id", invoiceUuid).order("payment_date");
    return error ? cloudFail(error) : cloudOk((data || []).map(paymentRowToModel));
  } catch (error) { return cloudFail(error); }
}

export async function addPayment(payment: CrewPayment, invoiceUuid: string): Promise<CloudResult<CrewPayment>> {
  try { const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error); const db = getSupabaseBrowserClient();
    const existing = await db.from("payments").select("id, invoice_id").eq("user_id", user.data).eq("legacy_id", payment.id).maybeSingle();
    if (existing.error) return cloudFail(existing.error);
    if (existing.data && existing.data.invoice_id !== invoiceUuid) return cloudFail("CrewQuote found a Payment ID attached to another Invoice.");
    const query = existing.data ? db.from("payments").update(paymentModelToUpdate(payment, invoiceUuid)).eq("id", existing.data.id) : db.from("payments").insert(paymentModelToInsert(payment, user.data, invoiceUuid));
    const { data, error } = await query.select("*").single();
    return error ? cloudFail(error) : cloudOk(paymentRowToModel(data));
  } catch (error) { return cloudFail(error); }
}

export async function updatePayment(payment: CrewPayment, invoiceUuid: string) { return addPayment(payment, invoiceUuid); }

export async function deletePayment(legacyId: string): Promise<CloudResult<true>> {
  try { const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error);
    const { error } = await getSupabaseBrowserClient().from("payments").delete().eq("user_id", user.data).eq("legacy_id", legacyId);
    return error ? cloudFail(error) : cloudOk(true);
  } catch (error) { return cloudFail(error); }
}

export async function replacePayments(invoiceUuid: string, payments: CrewPayment[]): Promise<CloudResult<CrewPayment[]>> {
  try {
    const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error); const db = getSupabaseBrowserClient();
    const current = await db.from("payments").select("id, legacy_id").eq("user_id", user.data).eq("invoice_id", invoiceUuid);
    if (current.error) return cloudFail(current.error);
    const keep = new Set(payments.map(payment => payment.id));
    for (const payment of payments) { const saved = await addPayment(payment, invoiceUuid); if (saved.error) return cloudFail(saved.error); }
    for (const row of current.data || []) {
      if (row.legacy_id && keep.has(row.legacy_id)) continue;
      const removed = await db.from("payments").delete().eq("id", row.id).eq("user_id", user.data); if (removed.error) return cloudFail(removed.error);
    }
    return listPayments(invoiceUuid);
  } catch (error) { return cloudFail(error); }
}
