import { useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Toaster } from "sonner";
import {
  BookOpen,
  Bot,
  Cable,
  CalendarDays,
  DatabaseBackup,
  History,
  Info,
  Layers,
  Library,
  ListTree,
  MapPinned,
  Moon,
  NotebookPen,
  PanelLeft,
  PanelRight,
  Palette,
  PenLine,
  Puzzle,
  Quote,
  ScrollText,
  Sparkles,
  Sun,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ExportScope, PaneId, SideTab } from "@/components/desk";
import { useDesk } from "@/components/desk";
import { BookSide, Center as LegacyCenter } from "@/components/panes";
import { AgentPane } from "@/components/agent-pane";
import { Binder } from "@/components/binder";
import { WritePane } from "@/components/write-pane";
import { AssistPanel } from "@/components/assist";
import { CardsPanel, LorePanel, VersionsPanel } from "@/components/side-panels";
import { DataPane, ExportDialog } from "@/components/export-data";
import { Bookshelf, SettingsPane, StoryPane } from "@/components/home";
import { setPrefs, usePrefs } from "@/components/use-prefs";
import { useWriteState } from "@/components/write-store";
import { IconButton, Empty, Button } from "@/components/ui";
import { todayKey } from "@/lib/novel/format";
import { formatCount, readingMinutes } from "@/lib/write/wordcount";
import { resolveDark } from "@/lib/write/prefs";
import { cn } from "@/lib/cn";
import { useState } from "react";

const WRITE_PANES: PaneId[] = ["manuscript", "studio", "review", "net", "people"];

const RAIL: { id: PaneId; label: string; icon: LucideIcon }[][] = [
  [
    { id: "library", label: "书架", icon: Library },
    { id: "manuscript", label: "写作", icon: PenLine },
    { id: "outline", label: "大纲", icon: ListTree },
    { id: "story", label: "作品信息", icon: BookOpen },
  ],
  [
    { id: "poetry", label: "诗歌", icon: Quote },
    { id: "notes", label: "手记", icon: NotebookPen },
    { id: "stats", label: "日历", icon: CalendarDays },
  ],
  [
    { id: "skills", label: "技能", icon: Layers },
    { id: "plugins", label: "插件", icon: Puzzle },
    { id: "connect", label: "模型连接", icon: Cable },
    { id: "data", label: "数据与备份", icon: DatabaseBackup },
    { id: "settings", label: "外观", icon: Palette },
  ],
];

const SIDE_TABS: { id: SideTab; label: string; icon: LucideIcon }[] = [
  { id: "cards", label: "人物", icon: Users },
  { id: "lore", label: "设定", icon: MapPinned },
  { id: "assist", label: "AI", icon: Sparkles },
  { id: "versions", label: "版本", icon: History },
  { id: "threads", label: "线索", icon: ScrollText },
  { id: "agent", label: "代理", icon: Bot },
];

const NEEDS_BOOK: PaneId[] = [...WRITE_PANES, "outline", "story"];

export function Shell({ exportReq, closeExport }: { exportReq: ExportScope | null; closeExport: () => void }) {
  const desk = useDesk();
  const prefs = usePrefs();
  const [binderOpen, setBinderOpen] = useState(true);
  const writing = WRITE_PANES.includes(desk.pane);
  const hasBook = Boolean(desk.detail);
  const showBinder = hasBook && binderOpen && NEEDS_BOOK.includes(desk.pane) && !desk.focus;
  const showSide = hasBook && (writing || desk.pane === "outline") && desk.side !== null && !desk.focus;
  const dark = typeof window === "undefined" ? false : resolveDark(prefs.mode, window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);

  useEffect(() => {
    if (!desk.focus) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") desk.setFocus(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desk]);

  useEffect(() => {
    if (desk.focus && !writing) desk.setFocus(false);
  }, [desk, writing]);

  return (
    <div className="flex h-dvh flex-col bg-paper text-ink">
      <div className="relative flex min-h-0 flex-1">
        {!desk.focus ? (
          <nav aria-label="主导航" className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-line bg-sunk py-3">
            <button
              type="button"
              className="mb-2 flex size-9 items-center justify-center rounded-xl bg-accent font-serif text-base font-semibold text-accent-fg shadow-sm"
              title="蓝稿"
              onClick={() => desk.setPane("library")}
            >
              蓝
            </button>
            {RAIL.map((group, gi) => (
              <div key={gi} className={cn("flex flex-col items-center gap-1", gi > 0 && "mt-2 border-t border-line pt-3")}>
                {group.map((item) => {
                  const active = item.id === "manuscript" ? writing : desk.pane === item.id;
                  return (
                    <IconButton
                      key={item.id}
                      label={item.label}
                      active={active}
                      onClick={() => {
                        if (item.id === "library") desk.setCreating(false);
                        desk.setPane(item.id);
                      }}
                    >
                      <item.icon className="size-[18px]" strokeWidth={1.75} />
                    </IconButton>
                  );
                })}
              </div>
            ))}
            <div className="mt-auto flex flex-col items-center gap-1">
              <IconButton label={dark ? "切换到浅色" : "切换到深色"} onClick={() => setPrefs({ mode: dark ? "light" : "dark" })}>
                {dark ? <Sun className="size-[18px]" strokeWidth={1.75} /> : <Moon className="size-[18px]" strokeWidth={1.75} />}
              </IconButton>
              <Link to="/about" aria-label="关于" title="关于" className="inline-flex size-9 items-center justify-center rounded-lg text-mist hover:bg-hover hover:text-ink">
                <Info className="size-[18px]" strokeWidth={1.75} />
              </Link>
            </div>
          </nav>
        ) : null}

        {showBinder ? (
          <aside className="hidden w-60 shrink-0 border-r border-line bg-sunk/60 lg:block xl:w-72">
            <Binder />
          </aside>
        ) : null}

        <main className={cn("relative flex min-w-0 flex-1 flex-col", writing ? "bg-page" : "bg-paper")}>
          {hasBook && NEEDS_BOOK.includes(desk.pane) && !desk.focus ? (
            <div className="absolute top-1.5 left-2 z-10">
              <IconButton label={binderOpen ? "收起目录" : "展开目录"} size="sm" onClick={() => setBinderOpen((v) => !v)}>
                <PanelLeft className="size-4" />
              </IconButton>
            </div>
          ) : null}
          {(writing || desk.pane === "outline") && hasBook && !desk.focus ? (
            <div className="absolute top-1.5 right-2 z-10">
              <IconButton label={desk.side ? "收起右侧面板" : "展开右侧面板"} size="sm" active={Boolean(desk.side)} onClick={() => desk.setSide(desk.side ? null : "cards")}>
                <PanelRight className="size-4" />
              </IconButton>
            </div>
          ) : null}
          <div className={cn("min-h-0 flex-1", writing ? "pl-8" : "overflow-y-auto", (writing || desk.pane === "outline") && hasBook && !desk.focus && "pr-8")}>
            <CenterView />
          </div>
        </main>

        {showSide ? (
          <aside className="flex w-[22rem] shrink-0 flex-col border-l border-line bg-surface max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-20 max-xl:shadow-[var(--shadow-pop)] xl:w-96">
            <div className="flex h-11 shrink-0 items-center gap-0.5 border-b border-line px-2">
              {SIDE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => desk.setSide(tab.id)}
                  className={cn(
                    "flex h-8 items-center gap-1 rounded-lg px-1.5 text-[13px] whitespace-nowrap transition-colors",
                    desk.side === tab.id ? "bg-accent-soft font-medium text-accent-ink" : "text-mist hover:bg-hover hover:text-ink",
                  )}
                >
                  <tab.icon className="size-3.5" strokeWidth={1.9} />
                  {tab.label}
                </button>
              ))}
              <IconButton label="关闭面板" size="sm" className="ml-auto" onClick={() => desk.setSide(null)}>
                <X className="size-4" />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1">
              {desk.side === "cards" ? <CardsPanel /> : null}
              {desk.side === "lore" ? <LorePanel /> : null}
              {desk.side === "assist" ? <AssistPanel /> : null}
              {desk.side === "versions" ? <VersionsPanel /> : null}
              {desk.side === "threads" ? <BookSide inPanel /> : null}
              {desk.side === "agent" ? (
                <AgentPane />
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
      <StatusBar />
      <ExportDialog scope={exportReq} onClose={closeExport} />
      <Toaster position="bottom-center" theme={dark ? "dark" : "light"} offset={40} toastOptions={{ className: "!font-sans !text-[13px]" }} />
    </div>
  );
}

function CenterView() {
  const desk = useDesk();
  const pane = desk.pane;
  if (pane === "library" || pane === "billing" || pane === "plan" || pane === "share") return <Bookshelf />;
  if (pane === "data") return <DataPane />;
  if (pane === "settings") return <SettingsPane />;
  if (NEEDS_BOOK.includes(pane) && !desk.detail) {
    return (
      <Empty icon={<BookOpen className="size-5" />} title="还没有打开的作品" body="先在书架上选一部，或者开一部新书。">
        <Button onClick={() => desk.setPane("library")}>去书架</Button>
      </Empty>
    );
  }
  if (WRITE_PANES.includes(pane)) return <WritePane />;
  if (pane === "story") return <StoryPane />;
  return <LegacyCenter />;
}

function StatusBar() {
  const desk = useDesk();
  const { chapterWords, selectionWords, storedWords } = useWriteState();
  const writing = WRITE_PANES.includes(desk.pane);
  const detail = desk.detail;
  const total = useMemo(() => (detail ? detail.chapters.reduce((sum, c) => sum + (c.words || 0), 0) : 0), [detail]);
  const liveTotal = writing ? total - storedWords + chapterWords : total;
  const todayWork = detail?.days.find((d) => d.day === todayKey())?.words ?? 0;
  const goal = detail?.novel.dailyGoal ?? 0;
  const pct = goal > 0 ? Math.min(100, Math.round((todayWork / goal) * 100)) : 0;
  const model = desk.account?.settings.model;
  if (desk.focus) {
    return (
      <div className="pointer-events-none fixed right-4 bottom-3 z-20 rounded-lg bg-surface/80 px-2.5 py-1 text-[12px] text-faint tabular-nums opacity-70 backdrop-blur">
        {formatCount(chapterWords)} 字{selectionWords ? ` · 选中 ${selectionWords}` : ""} · Esc 退出专注
      </div>
    );
  }
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-line bg-sunk px-3 text-[12px] text-faint tabular-nums">
      {detail && NEEDS_BOOK.includes(desk.pane) ? (
        <>
          {writing ? <span>本章 {formatCount(chapterWords)} 字</span> : null}
          {writing && selectionWords ? <span className="text-accent">选中 {formatCount(selectionWords)} 字</span> : null}
          <span>全书 {formatCount(liveTotal)} 字</span>
          <span className="flex items-center gap-1.5">
            今日 {formatCount(todayWork)} 字
            {goal > 0 ? (
              <>
                <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-line" title={`每日目标 ${goal} 字`}>
                  <span className={cn("absolute inset-y-0 left-0 rounded-full", pct >= 100 ? "bg-ok" : "bg-accent")} style={{ width: `${pct}%` }} />
                </span>
                <span>{pct}%</span>
              </>
            ) : (
              <button type="button" className="hover:text-ink" onClick={() => desk.setPane("story")}>
                设目标
              </button>
            )}
          </span>
          {writing ? <span className="hidden md:inline">读完约 {readingMinutes(chapterWords)} 分钟</span> : null}
        </>
      ) : (
        <span>蓝稿 · 保存在这台电脑上</span>
      )}
      <span className="ml-auto flex items-center gap-1.5">
        <span className={cn("size-1.5 rounded-full", model && desk.account?.settings.hasKey ? "bg-ok" : "bg-line")} />
        <button type="button" className="hover:text-ink" onClick={() => desk.setPane("connect")}>
          {model && desk.account?.settings.hasKey ? model : "未连接模型"}
        </button>
      </span>
    </footer>
  );
}
