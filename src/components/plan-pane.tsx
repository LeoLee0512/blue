import { useState } from "react";
import { takeSeat } from "@/lib/novel/api";
import { PLANS, type PlanId } from "@/lib/novel/plan";
import { useDesk } from "@/components/desk";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

function untilLabel(iso: string): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric" }).format(date);
}

export function PlanPane() {
  const desk = useDesk();
  // 2026-11-01 全免费：本页已不挂载，bootstrap 不再下发 plan。
  const seat = { id: "free" as "free" | "cup" | "night", until: "" };
  const [busy, setBusy] = useState(false);
  const [mark, setMark] = useState("");
  const [error, setError] = useState("");

  async function take(plan: PlanId) {
    setBusy(true);
    setError("");
    try {
      const res = await takeSeat({ data: { plan } });
      if (!res.ok) return setError(res.error);
      await desk.refreshAll();
      setMark(plan === "free" ? "回到习作了。" : "这一月已记在你的名下。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-10">
      <h2 className="font-serif text-4xl">坐下来</h2>
      <p className="mt-5 max-w-md font-serif text-lg leading-relaxed text-ink">先白写一句。若留下了，再决定要不要月月坐在这张桌上。</p>
      <p className="mt-3 text-sm leading-relaxed text-mist">写小说的，写诗的，也给还在交作业的人。模型另计，记在你的密钥上。订阅只是这张桌子。</p>
      {error ? <p className="mt-4 text-sm text-ink">{error}</p> : null}
      {mark ? <p className="mt-4 text-sm text-mist">{mark}</p> : null}
      <ul className="mt-12 divide-y divide-line border-y border-line">
        {PLANS.map((plan) => {
          const here = seat.id === plan.id;
          return (
            <li key={plan.id} className="py-8">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="font-serif text-2xl">{plan.name}</h3>
                <p className={cn("font-serif text-lg", plan.id === "cup" ? "text-ink" : "text-mist")}>{plan.priceLine}</p>
              </div>
              <p className="mt-3 font-serif leading-relaxed text-ink">{plan.line}</p>
              <p className="mt-2 text-sm leading-relaxed text-mist">{plan.keeps}</p>
              {here ? (
                <p className="mt-4 text-sm text-faint">{plan.id === "free" ? "眼下是习作。" : `坐到${untilLabel(seat.until)}。`}</p>
              ) : plan.id === "free" ? (
                <button type="button" className="mt-4 min-h-11 text-sm text-faint hover:text-ink" disabled={busy} onClick={() => void take("free")}>
                  回到习作
                </button>
              ) : (
                <Button className="mt-5" variant={plan.id === "cup" ? "primary" : "quiet"} disabled={busy} onClick={() => void take(plan.id)}>
                  {plan.id === "cup" ? "就这一杯" : "点一盏长夜"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
