import { getSupabaseBrowserClient } from "../lib/supabase";
import { getCurrentUserId } from "../data/cloudDataProvider";
import { cloudFail, cloudOk, type CloudResult } from "../data/dataErrors";
import type { ImportCounts } from "../data/crewquoteTypes";
import type { Json } from "../types/database.types";

const SOURCE = "localstorage-phase-3";

export async function findCompletedImportBatch(fingerprint: string): Promise<CloudResult<boolean>> {
  try {
    const userIdResult = await getCurrentUserId();
    if (userIdResult.error || !userIdResult.data) return cloudFail(userIdResult.error);
    const client = getSupabaseBrowserClient();
    const { data, error } = await client
      .from("import_batches")
      .select("id")
      .eq("user_id", userIdResult.data)
      .eq("source", SOURCE)
      .eq("source_fingerprint", fingerprint)
      .eq("status", "completed")
      .maybeSingle();
    if (error) return cloudFail(error);
    return cloudOk(Boolean(data));
  } catch (error) {
    return cloudFail(error);
  }
}

export async function startImportBatch(fingerprint: string, appVersion: string, dataVersion: number): Promise<CloudResult<string>> {
  try {
    const userIdResult = await getCurrentUserId();
    if (userIdResult.error || !userIdResult.data) return cloudFail(userIdResult.error);
    const client = getSupabaseBrowserClient();
    const existing = await client
      .from("import_batches")
      .select("id")
      .eq("user_id", userIdResult.data)
      .eq("source_fingerprint", fingerprint)
      .maybeSingle();
    if (existing.error) return cloudFail(existing.error);
    if (existing.data) {
      const { data, error } = await client
        .from("import_batches")
        .update({ status: "started", started_at: new Date().toISOString(), completed_at: null, imported_counts: {} })
        .eq("id", existing.data.id)
        .select("id")
        .single();
      if (error) return cloudFail(error);
      return cloudOk(data.id);
    }

    const { data, error } = await client
      .from("import_batches")
      .insert({
        user_id: userIdResult.data,
        source: SOURCE,
        source_fingerprint: fingerprint,
        source_app_version: appVersion,
        source_data_version: dataVersion,
        status: "started",
        imported_counts: {},
      })
      .select("id")
      .single();
    if (error) return cloudFail(error);
    return cloudOk(data.id);
  } catch (error) {
    return cloudFail(error);
  }
}

export async function completeImportBatch(id: string, counts: ImportCounts): Promise<CloudResult<true>> {
  try {
    const client = getSupabaseBrowserClient();
    const { error } = await client
      .from("import_batches")
      .update({ status: "completed", completed_at: new Date().toISOString(), imported_counts: counts as unknown as Json })
      .eq("id", id);
    if (error) return cloudFail(error);
    return cloudOk(true);
  } catch (error) {
    return cloudFail(error);
  }
}

export async function failImportBatch(id: string, counts: Partial<ImportCounts> = {}): Promise<CloudResult<true>> {
  try {
    const client = getSupabaseBrowserClient();
    const { error } = await client
      .from("import_batches")
      .update({ status: "failed", imported_counts: counts as unknown as Json })
      .eq("id", id);
    if (error) return cloudFail(error);
    return cloudOk(true);
  } catch (error) {
    return cloudFail(error);
  }
}
