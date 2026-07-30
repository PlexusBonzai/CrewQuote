import { getSupabaseBrowserClient } from "../lib/supabase";
import { getCurrentUserId } from "../data/cloudDataProvider";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import { entryExpenseToInsert, expenseLegacyId } from "../data/mappers/dayExpenseMapper";

export async function saveEntryExpense(entry: { id: string; expenses: number; expenseDescription: string }, entryUuid: string): Promise<CloudResult<true>> {
  try {
    const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error);
    const db = getSupabaseBrowserClient(); const legacyId = expenseLegacyId(entry.id);
    const existing = await db.from("day_expenses").select("id").eq("user_id", user.data).eq("legacy_id", legacyId).maybeSingle();
    if (existing.error) return cloudFail(existing.error);
    if (entry.expenses <= 0 && existing.data) {
      const { error } = await db.from("day_expenses").delete().eq("id", existing.data.id);
      return error ? cloudFail(error) : cloudOk(true);
    }
    if (entry.expenses <= 0) return cloudOk(true);
    const value = entryExpenseToInsert(entry, user.data, entryUuid);
    const { error } = existing.data
      ? await db.from("day_expenses").update(value).eq("id", existing.data.id)
      : await db.from("day_expenses").insert(value);
    return error ? cloudFail(error) : cloudOk(true);
  } catch (error) { return cloudFail(error); }
}
