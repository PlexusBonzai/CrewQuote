import { getSupabaseBrowserClient } from "../lib/supabase";
import { getCurrentUserId } from "../data/cloudDataProvider";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import type { CrewClient } from "../data/crewquoteTypes";
import { clientModelToInsert, clientModelToUpdate, clientRowToModel, looksLikeUuid } from "../data/mappers/clientMapper";

const CLIENT_COLUMNS = "*";

export async function listClients(): Promise<CloudResult<CrewClient[]>> {
  try {
    const userIdResult = await getCurrentUserId();
    if (userIdResult.error || !userIdResult.data) return cloudFail(userIdResult.error);
    const client = getSupabaseBrowserClient();
    const { data, error } = await client
      .from("clients")
      .select(CLIENT_COLUMNS)
      .eq("user_id", userIdResult.data)
      .order("company_name", { ascending: true });
    if (error) return cloudFail(error);
    return cloudOk((data || []).map(clientRowToModel));
  } catch (error) {
    return cloudFail(error);
  }
}

export async function getClient(appClientId: string): Promise<CloudResult<CrewClient | null>> {
  try {
    const userIdResult = await getCurrentUserId();
    if (userIdResult.error || !userIdResult.data) return cloudFail(userIdResult.error);
    const client = getSupabaseBrowserClient();
    let query = client.from("clients").select(CLIENT_COLUMNS).eq("user_id", userIdResult.data);
    query = looksLikeUuid(appClientId) ? query.eq("id", appClientId) : query.eq("legacy_id", appClientId);
    const { data, error } = await query.maybeSingle();
    if (error) return cloudFail(error);
    return cloudOk(data ? clientRowToModel(data) : null);
  } catch (error) {
    return cloudFail(error);
  }
}

export async function createClient(input: CrewClient): Promise<CloudResult<CrewClient>> {
  try {
    const userIdResult = await getCurrentUserId();
    if (userIdResult.error || !userIdResult.data) return cloudFail(userIdResult.error);
    const client = getSupabaseBrowserClient();
    const { data, error } = await client
      .from("clients")
      .insert(clientModelToInsert(input, userIdResult.data))
      .select(CLIENT_COLUMNS)
      .single();
    if (error) return cloudFail(error);
    return cloudOk(clientRowToModel(data));
  } catch (error) {
    return cloudFail(error);
  }
}

export async function updateClient(input: CrewClient): Promise<CloudResult<CrewClient>> {
  try {
    const userIdResult = await getCurrentUserId();
    if (userIdResult.error || !userIdResult.data) return cloudFail(userIdResult.error);
    const client = getSupabaseBrowserClient();
    let query = client.from("clients").update(clientModelToUpdate(input)).eq("user_id", userIdResult.data);
    query = looksLikeUuid(input.id) ? query.eq("id", input.id) : query.eq("legacy_id", input.id);
    const { data, error } = await query.select(CLIENT_COLUMNS).maybeSingle();
    if (error) return cloudFail(error);
    if (data) return cloudOk(clientRowToModel(data));
    return createClient(input);
  } catch (error) {
    return cloudFail(error);
  }
}

export async function deleteClient(appClientId: string): Promise<CloudResult<true>> {
  try {
    const userIdResult = await getCurrentUserId();
    if (userIdResult.error || !userIdResult.data) return cloudFail(userIdResult.error);
    const client = getSupabaseBrowserClient();
    let query = client.from("clients").delete().eq("user_id", userIdResult.data);
    query = looksLikeUuid(appClientId) ? query.eq("id", appClientId) : query.eq("legacy_id", appClientId);
    const { error } = await query;
    if (error) return cloudFail(error);
    return cloudOk(true);
  } catch (error) {
    return cloudFail(error);
  }
}

export async function upsertClientByLegacyId(input: CrewClient): Promise<CloudResult<CrewClient>> {
  const existing = await getClient(input.id);
  if (existing.error) return cloudFail(existing.error);
  return existing.data ? updateClient(input) : createClient(input);
}
