import { getSupabaseBrowserClient } from "../lib/supabase";
import { getCurrentUserId } from "../data/cloudDataProvider";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import type { CrewTimesheetEntry } from "../data/crewquoteTypes";
import { entryModelToInsert, entryModelToUpdate, entryRowToModel } from "../data/mappers/timesheetEntryMapper";

export async function listEntriesForTimesheet(timesheetUuid: string): Promise<CloudResult<CrewTimesheetEntry[]>> {
  try { const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error);
    const { data, error } = await getSupabaseBrowserClient().from("timesheet_entries").select("*").eq("user_id", user.data).eq("timesheet_id", timesheetUuid).order("entry_order");
    return error ? cloudFail(error) : cloudOk((data || []).map(entryRowToModel));
  } catch (error) { return cloudFail(error); }
}

export async function saveEntry(value: CrewTimesheetEntry, timesheetUuid: string, order: number): Promise<CloudResult<CrewTimesheetEntry>> {
  try { const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error); const db = getSupabaseBrowserClient();
    const existing = await db.from("timesheet_entries").select("id").eq("user_id", user.data).eq("legacy_id", value.id).maybeSingle();
    if (existing.error) return cloudFail(existing.error);
    const query = existing.data
      ? db.from("timesheet_entries").update(entryModelToUpdate(value, timesheetUuid, order)).eq("id", existing.data.id)
      : db.from("timesheet_entries").insert(entryModelToInsert(value, user.data, timesheetUuid, order));
    const { data, error } = await query.select("*").single();
    return error ? cloudFail(error) : cloudOk(entryRowToModel(data));
  } catch (error) { return cloudFail(error); }
}

export async function deleteEntry(appId: string): Promise<CloudResult<true>> {
  try { const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error);
    const { error } = await getSupabaseBrowserClient().from("timesheet_entries").delete().eq("user_id", user.data).eq("legacy_id", appId);
    return error ? cloudFail(error) : cloudOk(true);
  } catch (error) { return cloudFail(error); }
}
