import type { Database } from "../../types/database.types";
import type { RateMemory } from "../crewquoteTypes";

export type RatePresetRow = Database["public"]["Tables"]["rate_presets"]["Row"];

export function rateMemoryToPresetName(memory: RateMemory) {
  return memory.productionName ? `Last used: ${memory.productionName}` : "Client rate memory";
}
