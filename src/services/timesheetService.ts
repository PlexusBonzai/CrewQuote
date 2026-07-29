import { getSupabaseBrowserClient } from "../lib/supabase";
import { getCurrentUserId } from "../data/cloudDataProvider";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import type { CrewTimesheet } from "../data/crewquoteTypes";
import { timesheetModelToInsert, timesheetModelToUpdate, timesheetRowToModel } from "../data/mappers/timesheetMapper";
import { getClient } from "./clientService";
import { entryRowToModel } from "../data/mappers/timesheetEntryMapper";

async function resolveClientUuid(timesheet: CrewTimesheet): Promise<CloudResult<string | null>> {
  if (!timesheet.clientId) return cloudOk(null);
  const client = await getClient(timesheet.clientId);
  if (client.error) return cloudFail(client.error);
  if (!client.data) return cloudFail(`CrewQuote could not find the selected client for ${timesheet.timesheetNumber}. Save the client first, then retry.`);
  const db = getSupabaseBrowserClient();
  const user = await getCurrentUserId();
  if (user.error || !user.data) return cloudFail(user.error);
  const { data, error } = await db.from("clients").select("id").eq("user_id", user.data).eq("legacy_id", client.data.id).maybeSingle();
  if (error || !data) return cloudFail(error || "CrewQuote could not resolve the selected cloud client.");
  return cloudOk(data.id);
}

export async function listTimesheetHeaders(): Promise<CloudResult<CrewTimesheet[]>> {
  try {
    const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error);
    const db = getSupabaseBrowserClient();
    const [{ data, error }, { data: clients, error: clientError }] = await Promise.all([
      db.from("timesheets").select("*").eq("user_id", user.data).order("created_at", { ascending: false }),
      db.from("clients").select("id, legacy_id").eq("user_id", user.data),
    ]);
    if (error || clientError) return cloudFail(error || clientError);
    const ids = new Map((clients || []).map(client => [client.id, client.legacy_id || client.id]));
    return cloudOk((data || []).map(row => timesheetRowToModel(row, row.client_id ? ids.get(row.client_id) : undefined)));
  } catch (error) { return cloudFail(error); }
}

export async function listTimesheetsWithEntries(): Promise<CloudResult<CrewTimesheet[]>> {
  try {
    const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error);
    const db = getSupabaseBrowserClient();
    const [headers, clients, entries] = await Promise.all([
      db.from("timesheets").select("*").eq("user_id", user.data).order("created_at", { ascending: false }),
      db.from("clients").select("id, legacy_id").eq("user_id", user.data),
      db.from("timesheet_entries").select("*").eq("user_id", user.data).order("entry_order"),
    ]);
    if (headers.error || clients.error || entries.error) return cloudFail(headers.error || clients.error || entries.error);
    const entryIds = (entries.data || []).map(entry => entry.id);
    const expenses = entryIds.length
      ? await db.from("day_expenses").select("timesheet_entry_id, total_amount, description").eq("user_id", user.data).in("timesheet_entry_id", entryIds)
      : { data: [], error: null };
    if (expenses.error) return cloudFail(expenses.error);
    const clientIds = new Map((clients.data || []).map(client => [client.id, client.legacy_id || client.id]));
    const expenseByEntry = new Map((expenses.data || []).map(expense => [expense.timesheet_entry_id, expense]));
    const entriesByTimesheet = new Map<string, CrewTimesheet["entries"]>();
    for (const row of entries.data || []) {
      const entry = entryRowToModel(row); const expense = expenseByEntry.get(row.id);
      if (expense) { entry.expenses = Number(expense.total_amount) || 0; entry.expenseDescription = expense.description || ""; }
      const list = entriesByTimesheet.get(row.timesheet_id) || []; list.push(entry); entriesByTimesheet.set(row.timesheet_id, list);
    }
    return cloudOk((headers.data || []).map(row => ({ ...timesheetRowToModel(row, row.client_id ? clientIds.get(row.client_id) : undefined), entries: entriesByTimesheet.get(row.id) || [] })));
  } catch (error) { return cloudFail(error); }
}

export async function createTimesheet(value: CrewTimesheet): Promise<CloudResult<CrewTimesheet>> {
  try {
    const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error);
    const client = await resolveClientUuid(value); if (client.error) return cloudFail(client.error);
    const db = getSupabaseBrowserClient();
    const { data, error } = await db.from("timesheets").insert(timesheetModelToInsert(value, user.data, client.data)).select("*").single();
    return error ? cloudFail(error) : cloudOk(timesheetRowToModel(data, value.clientId));
  } catch (error) { return cloudFail(error); }
}

export async function updateTimesheet(value: CrewTimesheet): Promise<CloudResult<CrewTimesheet>> {
  try {
    const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error);
    const client = await resolveClientUuid(value); if (client.error) return cloudFail(client.error);
    const db = getSupabaseBrowserClient();
    const { data, error } = await db.from("timesheets").update(timesheetModelToUpdate(value, client.data)).eq("user_id", user.data).eq("legacy_id", value.id).select("*").maybeSingle();
    if (error) return cloudFail(error);
    if (!data) return createTimesheet(value);
    return cloudOk(timesheetRowToModel(data, value.clientId));
  } catch (error) { return cloudFail(error); }
}

export async function deleteTimesheet(appId: string): Promise<CloudResult<true>> {
  try {
    const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error);
    const { error } = await getSupabaseBrowserClient().from("timesheets").delete().eq("user_id", user.data).eq("legacy_id", appId);
    return error ? cloudFail(error) : cloudOk(true);
  } catch (error) { return cloudFail(error); }
}

export async function getTimesheetCloudId(appId: string): Promise<CloudResult<string>> {
  try {
    const user = await getCurrentUserId(); if (user.error || !user.data) return cloudFail(user.error);
    const { data, error } = await getSupabaseBrowserClient().from("timesheets").select("id").eq("user_id", user.data).eq("legacy_id", appId).maybeSingle();
    return error || !data ? cloudFail(error || "CrewQuote could not resolve the imported timesheet.") : cloudOk(data.id);
  } catch (error) { return cloudFail(error); }
}
