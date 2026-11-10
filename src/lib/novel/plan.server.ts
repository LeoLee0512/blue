import type { Sql } from "@/lib/db";
import type { PlanId } from "./plan";

export type Seat = { id: PlanId; until: string };

function stamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : "";
}

function asPlan(value: string | undefined): PlanId {
  if (value === "cup" || value === "night") return value;
  return "free";
}

// 2026-11-01 队长决定：软件全免费，不再有套餐。所有人统一按全功能档处理，
// 原按套餐读库的逻辑见 plan.server.ts.bak_20261101_sam_b1。
// 2026-11-02：联网检索单独关闭，等 IMP-24（出境提示 + 日志不记检索词）做完再改成 true。
export const WEB_SEARCH_ENABLED = false as boolean;
export const SHELF_OFF = "社区功能暂未开放。";

export const FREE_FOR_ALL: Seat = { id: "night", until: "" };

export async function readPlan(sql: Sql, userId: string): Promise<Seat> {
  void sql;
  void userId;
  return FREE_FOR_ALL;
}

export async function readPlanLegacy(sql: Sql, userId: string): Promise<Seat> {
  const rows = await sql<{ plan: string; plan_until: unknown }>`
    select plan, plan_until from profiles where user_id = ${userId}
  `;
  const until = stamp(rows[0]?.plan_until);
  const id = asPlan(rows[0]?.plan);
  if (id !== "free" && until && Date.parse(until) < Date.now()) return { id: "free", until: "" };
  return { id, until: id === "free" ? "" : until };
}

/** @deprecated 2026-11-01 全免费后不再订阅；保留仅供参考，不被调用。 */
export async function subscribePlan(sql: Sql, userId: string, plan: string): Promise<Seat> {
  const id = asPlan(plan);
  if (plan !== "free" && plan !== "cup" && plan !== "night") return readPlan(sql, userId);
  if (id === "free") {
    await sql`update profiles set plan = 'free', plan_until = null where user_id = ${userId}`;
    return { id: "free", until: "" };
  }
  const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await sql`update profiles set plan = ${id}, plan_until = ${until} where user_id = ${userId}`;
  return { id, until };
}
