import { useEffect, useState } from "react";
import { BookPlus, Flame, Moon, Sun, SunMoon, Target } from "lucide-react";
import { saveNovelMeta } from "@/lib/novel/workbench-api";
import { todayKey } from "@/lib/novel/format";
import { EDITOR_FONTS, LEADING_RANGE, MODES, PALETTES, SIZE_RANGE, WIDTH_RANGE } from "@/lib/write/prefs";
import { formatCount, readingMinutes } from "@/lib/write/wordcount";
import { useDesk } from "@/components/desk";
import { setPrefs, usePrefs } from "@/components/use-prefs";
import { call } from "@/components/call";
import { CreateForm, EditForm } from "@/components/panes";
import { LibraryHint } from "@/components/guide";
import { Button, Field, PageHeader, Segmented, Switch, fieldClass } from "@/components/ui";
import { cn } from "@/lib/cn";

/** 书封：按书名生成稳定的色调。 */
function coverHue(title: string): number {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

export function Bookshelf() {
  const desk = useDesk();
  const novels = desk.account?.novels ?? [];
  const stats = new Map((desk.account?.stats ?? []).map((s) => [s.novelId, s]));
  const today = (desk.account?.usage ?? []).find((d) => d.day === todayKey());
  const total = (desk.account?.stats ?? []).reduce((sum, s) => sum + s.words, 0);
  const creating = desk.creating || novels.length === 0;

  if (creating) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        {novels.length ? (
          <button type="button" className="mb-6 text-[13px] text-faint hover:text-ink" onClick={() => desk.setCreating(false)}>
            ← 回到书架
          </button>
        ) : (
          <div className="mb-10">
            <p className="font-serif text-4xl font-semibold tracking-wider text-ink">蓝稿</p>
            <p className="mt-2 text-sm text-mist">免费的中文写作软件。作品都保存在这台电脑上。</p>
          </div>
        )}
        <CreateForm />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <LibraryHint />
      <PageHeader title="书架" body={`${novels.length} 部作品 · 共 ${formatCount(total)} 字`}>
        <Button onClick={() => desk.setCreating(true)}>
          <BookPlus className="size-4" /> 新作品
        </Button>
      </PageHeader>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat icon={<Flame className="size-4" />} label="今天写了" value={`${formatCount(today?.userChars ?? 0)} 字`} />
        <Stat icon={<Target className="size-4" />} label="蓝稿帮写" value={`${formatCount(today?.aiChars ?? 0)} 字`} />
        <Stat icon={<SunMoon className="size-4" />} label="全部作品读完约" value={`${readingMinutes(total)} 分钟`} />
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {novels.map((novel) => {
          const s = stats.get(novel.id);
          const hue = coverHue(novel.title);
          return (
            <li key={novel.id}>
              <button
                type="button"
                onClick={() => desk.openNovel(novel.id)}
                className={cn(
                  "group flex h-full w-full gap-4 rounded-2xl border bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-page)]",
                  novel.id === desk.novelId ? "border-accent/50" : "border-line",
                )}
              >
                <span
                  className="flex h-28 w-20 shrink-0 items-center justify-center rounded-lg font-serif text-3xl text-white/95 shadow-inner"
                  style={{ background: `linear-gradient(160deg, hsl(${hue} 38% 46%), hsl(${(hue + 40) % 360} 42% 30%))` }}
                  aria-hidden
                >
                  <span className="max-h-24 overflow-hidden text-[15px] leading-none tracking-[0.18em] [writing-mode:vertical-rl]">{novel.title.slice(0, 5)}</span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-serif text-base font-semibold text-ink">{novel.title}</span>
                  <span className="mt-0.5 text-[12px] text-faint">{novel.genre || "未定类型"}</span>
                  <span className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-mist">{novel.logline || "还没有一句话简介。"}</span>
                  <span className="mt-auto pt-2 text-[12px] text-faint tabular-nums">
                    {s?.chapters ?? 0} 章 · {formatCount(s?.words ?? 0)} 字 · {new Date(novel.updatedAt).toLocaleDateString("zh-CN")}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => desk.setCreating(true)}
            className="flex h-full min-h-36 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-[13px] text-faint hover:border-accent/50 hover:text-accent"
          >
            <BookPlus className="size-5" /> 开一部新书
          </button>
        </li>
      </ul>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
      <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">{icon}</span>
      <span>
        <span className="block text-[12px] text-faint">{label}</span>
        <span className="block text-base font-medium text-ink tabular-nums">{value}</span>
      </span>
    </div>
  );
}

/** 作品信息：署名、每日目标 + 原有的故事核表单。 */
export function StoryPane() {
  const desk = useDesk();
  const novel = desk.detail?.novel;
  const [author, setAuthor] = useState(novel?.author ?? "");
  const [goal, setGoal] = useState(String(novel?.dailyGoal ?? 0));
  useEffect(() => {
    setAuthor(novel?.author ?? "");
    setGoal(String(novel?.dailyGoal ?? 0));
  }, [novel?.id, novel?.author, novel?.dailyGoal]);
  if (!novel) return null;
  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <PageHeader title="作品信息" body="书名、类型、故事核和手里的线。AI 工具和代理写作时都会参考这里。" />
      <section className="mb-8 rounded-2xl border border-line bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="署名" hint="导出 Word / EPUB 时使用">
            <input className={fieldClass} maxLength={60} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="笔名" />
          </Field>
          <Field label="每日目标" hint="字，0 表示不设">
            <input className={fieldClass} inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </Field>
        </div>
        <Button
          className="mt-4"
          size="sm"
          variant="secondary"
          onClick={async () => {
            const dailyGoal = Number(goal) || 0;
            const res = await call(desk, saveNovelMeta({ data: { novelId: novel.id, author: author.trim(), dailyGoal } }), { refresh: false });
            if (!res) return;
            desk.patchDetail((d) => ({ ...d, novel: { ...d.novel, author: author.trim(), dailyGoal } }));
            desk.patchAccount((a) => ({ ...a, novels: a.novels.map((n) => (n.id === novel.id ? { ...n, author: author.trim(), dailyGoal } : n)) }));
            desk.note("已保存");
          }}
        >
          保存署名与目标
        </Button>
      </section>
      <EditForm />
    </div>
  );
}

/** 外观设置。 */
export function SettingsPane() {
  const prefs = usePrefs();
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader title="外观" body="明暗、配色和正文排版。只保存在这台电脑上，立即生效。" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-6">
          <section>
            <p className="mb-2 text-[13px] font-medium text-mist">明暗</p>
            <Segmented
              label="明暗"
              value={prefs.mode}
              onChange={(mode) => setPrefs({ mode })}
              options={MODES.map((m) => ({
                id: m.id,
                label: (
                  <span className="flex items-center gap-1">
                    {m.id === "light" ? <Sun className="size-3.5" /> : m.id === "dark" ? <Moon className="size-3.5" /> : <SunMoon className="size-3.5" />}
                    {m.label}
                  </span>
                ),
              }))}
            />
          </section>
          <section>
            <p className="mb-2 text-[13px] font-medium text-mist">配色</p>
            <div className="flex flex-wrap gap-2">
              {PALETTES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPrefs({ palette: p.id })}
                  className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px]", prefs.palette === p.id ? "border-accent bg-accent-soft text-ink" : "border-line text-mist hover:bg-hover")}
                >
                  <span className="flex overflow-hidden rounded-full border border-black/10">
                    <span className="size-4" style={{ background: p.swatch[0] }} />
                    <span className="size-4" style={{ background: p.swatch[1] }} />
                  </span>
                  {p.label}
                </button>
              ))}
            </div>
          </section>
          <section>
            <p className="mb-2 text-[13px] font-medium text-mist">正文字体</p>
            <div className="grid grid-cols-4 gap-2">
              {EDITOR_FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setPrefs({ font: f.id })}
                  className={cn("rounded-xl border py-2 text-base", prefs.font === f.id ? "border-accent bg-accent-soft text-ink" : "border-line text-mist hover:bg-hover")}
                  style={{ fontFamily: f.stack }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] text-faint">宋体随软件附带；黑体、楷体、仿宋使用系统里已有的字体。</p>
          </section>
          <Slider label="字号" value={prefs.size} unit="px" range={SIZE_RANGE} onChange={(size) => setPrefs({ size })} />
          <Slider label="行距" value={prefs.leading} unit="倍" range={LEADING_RANGE} onChange={(leading) => setPrefs({ leading })} />
          <Slider label="版心宽度" value={prefs.width} unit="字" range={WIDTH_RANGE} onChange={(width) => setPrefs({ width })} />
          <section className="space-y-3">
            <label className="flex items-center justify-between gap-4 text-[13px] text-ink">
              <span>
                段首空两格
                <span className="block text-[12px] text-faint">回车时自动插入两个全角空格</span>
              </span>
              <Switch on={prefs.indent} label="段首空两格" onToggle={() => setPrefs({ indent: !prefs.indent })} />
            </label>
            <label className="flex items-center justify-between gap-4 text-[13px] text-ink">
              <span>
                打字机模式
                <span className="block text-[12px] text-faint">正在写的那一行保持在屏幕中部</span>
              </span>
              <Switch on={prefs.typewriter} label="打字机模式" onToggle={() => setPrefs({ typewriter: !prefs.typewriter })} />
            </label>
          </section>
        </div>
        <section className="h-fit rounded-2xl border border-line bg-page p-6 shadow-[var(--shadow-page)]">
          <p className="mb-4 text-[12px] text-faint">预览</p>
          <div className="manuscript manuscript-preview manuscript-col">
            <p style={{ textIndent: 0 }} className="mb-3 text-center font-semibold" >第一章{"\u3000"}雾镇</p>
            <p>林照回到雾镇的那天，雨下得很细。站台上只有一盏灯，灯罩里积着去年的飞蛾。</p>
            <p>“你还是回来了。”周叔把伞往她那边偏了偏，自己的半边肩膀很快湿透。</p>
            <p>她没有接话，只是看着远处的灯塔——那座据说已经废弃了二十年的灯塔，此刻正亮着。</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function Slider({ label, value, unit, range, onChange }: { label: string; value: number; unit: string; range: { min: number; max: number; step: number }; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-[13px] font-medium text-mist">
        {label}
        <span className="font-normal text-ink tabular-nums">
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-accent)]"
      />
    </label>
  );
}
