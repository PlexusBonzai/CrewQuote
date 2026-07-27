export const PHASE3_LOCAL_DATA_OWNER_KEY = "cqp-local-data-owner-user-id";
const PHASE3_MIGRATION_COMPLETE_PREFIX = "cqp-phase3-migration-completed-";

function readString(key: string) {
  try {
    return window.localStorage?.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeString(key: string, value: string) {
  window.localStorage?.setItem(key, value);
}

export function readLocalDataOwnerId() {
  return readString(PHASE3_LOCAL_DATA_OWNER_KEY);
}

export function claimLocalDataOwner(userId: string) {
  writeString(PHASE3_LOCAL_DATA_OWNER_KEY, userId);
}

export function migrationCompletedForUser(userId: string) {
  return readString(`${PHASE3_MIGRATION_COMPLETE_PREFIX}${userId}`) === "true";
}

export function markMigrationCompletedForUser(userId: string, fingerprint: string) {
  writeString(`${PHASE3_MIGRATION_COMPLETE_PREFIX}${userId}`, "true");
  writeString(`${PHASE3_MIGRATION_COMPLETE_PREFIX}${userId}-fingerprint`, fingerprint);
}
