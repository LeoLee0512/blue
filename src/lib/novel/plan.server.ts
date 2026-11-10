import type { Sql } from "@/lib/db";
import type { PlanId } from "./plan";

export type Seat = { id: PlanId; until: string };

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

