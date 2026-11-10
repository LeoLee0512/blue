import { TRANSCRIPT_LIMIT } from "./catalog";

export type PlanId = "free" | "cup" | "night";

export function transcriptCap(plan: PlanId): number {
  if (plan === "night") return TRANSCRIPT_LIMIT;
  if (plan === "cup") return 240_000;
  return 80_000;
}
