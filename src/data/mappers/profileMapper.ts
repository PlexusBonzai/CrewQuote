import type { Database } from "../../types/database.types";

export type AccountProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "email" | "created_at" | "updated_at"
>;
