import { TRANSCRIPT_LIMIT } from "./catalog";

export type PlanId = "free" | "cup" | "night";

export const PLANS: {
  id: PlanId;
  name: string;
  priceLine: string;
  line: string;
  keeps: string;
}[] = [
  {
    id: "free",
    name: "习作",
    priceLine: "免费",
    line: "先写一句。这一句不收费。",
    keeps: "一本书。诗与手记各三则。评书听一回。",
  },
  {
    id: "cup",
    name: "一杯",
    priceLine: "¥19 / 月",
    line: "大约一杯美式。够坐一个月。",
    keeps: "书、诗、手记都不限。评书、分享，和你的笔触，都留在桌上。",
  },
  {
    id: "night",
    name: "长夜",
    priceLine: "¥39 / 月",
    line: "大约一杯手冲。灯可以点久一点。",
    keeps: "一杯里的全部。再把你写过的交给蓝稿，把整本书带走，需要时可以联网。",
  },
];

export function transcriptCap(plan: PlanId): number {
  if (plan === "night") return TRANSCRIPT_LIMIT;
  if (plan === "cup") return 240_000;
  return 80_000;
}
