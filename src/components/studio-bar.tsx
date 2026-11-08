import { CONTEXT_LIMIT } from "@/lib/novel/catalog";
import { bookMark, countChars, todayKey } from "@/lib/novel/format";
import { useDesk } from "@/components/desk";

export function StudioBar() {
  const desk = useDesk();
  const settings = desk.account?.settings;
  const today = (desk.account?.usage ?? []).find((day) => day.day === todayKey());
  const total = (desk.detail?.chapters ?? []).reduce((sum, chapter) => sum + countChars(chapter.body), 0);
  const mark = bookMark(desk.detail?.chapters.length ?? 0, desk.detail?.outline.length ?? 0, desk.detail?.novel.ledger ?? "");
  const used = settings?.contextUsed ?? 0;
  const ratio = used / CONTEXT_LIMIT;
  const state = ratio >= 0.97 ? "满了" : ratio >= 0.85 ? "快满了" : "还宽";
  if (!settings) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2 text-sm text-faint">
      <button type="button" className={settings.wild ? "text-ink" : "hover:text-mist"} onClick={() => void desk.setStudio({ wild: !settings.wild })}>
        天马行空
      </button>
      {/* 2026-11-02 联网检索暂未开放（IMP-24 前隐藏入口）：
      <button type="button" className={settings.web ? "text-ink" : "hover:text-mist"} onClick={() => void desk.setStudio({ web: !settings.web })}>
        联网
      </button>
      */}
      <span className="inline-flex items-center gap-2">
        思考
        {(
          [
            ["low", "弱"],
            ["mid", "中"],
            ["high", "强"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={settings.thinking === id ? "text-ink underline underline-offset-4" : "hover:text-mist"}
            onClick={() => void desk.setStudio({ thinking: id })}
          >
            {label}
          </button>
        ))}
      </span>
      <span>
        上下文 {used ? `${Math.min(100, Math.round(ratio * 100))}%` : "还没开口"} · {used ? state : "还宽"}
      </span>
      <span className="tabular-nums">今日 {today?.tokens ?? 0} Token</span>
      <span className="tabular-nums">全书 {total} 字</span>
      <span>{mark}</span>
      <button type="button" className="hover:text-mist" onClick={() => desk.setPane("stats")}>
        日历
      </button>
    </div>
  );
}
