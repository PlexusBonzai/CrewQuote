export interface CloudResult<T> {
  data: T | null;
  error: string | null;
}

export function cloudOk<T>(data: T): CloudResult<T> {
  return { data, error: null };
}

export function cloudFail<T>(error: unknown): CloudResult<T> {
  return { data: null, error: normalizeCloudError(error) };
}

export function normalizeCloudError(error: unknown) {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const message = raw.trim();
  const lower = message.toLowerCase();

  if (!message) return "CrewQuote could not complete the cloud request. Please try again.";
  if (lower.includes("jwt") || lower.includes("session") || lower.includes("auth")) return "Your CrewQuote session has expired. Please sign in again.";
  if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("connection")) return "CrewQuote could not reach Supabase. Check your connection and try again.";
  if (lower.includes("row-level security") || lower.includes("permission denied")) return "CrewQuote could not access that cloud record for this account.";
  if (lower.includes("duplicate") || lower.includes("unique")) return "CrewQuote found a duplicate cloud record. Refresh and try again.";
  if (lower.includes("invalid input") || lower.includes("violates check")) return "CrewQuote could not save because one of the values is outside the supported range.";

  return message;
}
