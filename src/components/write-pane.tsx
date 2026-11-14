import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { BookmarkPlus, Check, CloudOff, Download, FilePlus2, Loader2, Maximize2, Minimize2, PenLine } from "lucide-react";
import { addChapter, keepVersion, writeChapter } from "@/lib/novel/workbench-api";
import type { Chapter } from "@/lib/novel/types";
import { readingOrder } from "@/lib/write/tree";
import { countWords, formatCount } from "@/lib/write/wordcount";
import type { AssistTool } from "@/lib/write/assist-prompts";
import { useDesk } from "@/components/desk";
import { usePrefs } from "@/components/use-prefs";
import { useWriteState } from "@/components/write-store";
import { caretRect } from "@/components/caret";
import { SelectionToolbar } from "@/components/assist";
import { runAssist, useAssist } from "@/components/assist-run";
import { call } from "@/components/call";
import { Button, Empty, IconButton, Modal, fieldClass } from "@/components/ui";
import { cn } from "@/lib/cn";

const AUTOSAVE_MS = 1200;

export function WritePane() {
  const desk = useDesk();
  const detail = desk.detail;
  const ordered = useMemo(() => (detail ? readingOrder(detail.volumes, detail.chapters) : []), [detail]);
  const chapter = ordered.find((c) => c.id === desk.selectedChapterId) ?? ordered[0] ?? null;

  useEffect(() => {
    if (chapter && chapter.id !== desk.selectedChapterId) desk.setSelectedChapterId(chapter.id);
  }, [chapter, desk]);

  if (!detail) return null;
  if (!chapter) {
    return (
      <Empty icon={<PenLine className="size-5" />} title="还没有章节" body="从第一章写起。左侧可以新建卷，把章节拖进卷里整理。">
        <Button
          onClick={async () => {
            const res = await call(desk, addChapter({ data: { novelId: detail.novel.id, volumeId: detail.volumes[0]?.id ?? null } }));
            if (!res) return;
            desk.patchDetail((d) => ({ ...d, chapters: [...d.chapters, res.chapter] }));
            desk.setSelectedChapterId(res.chapter.id);
          }}
        >
          <FilePlus2 className="size-4" /> 新建第一章
        </Button>
      </Empty>
    );
  }
  return <ChapterEditor key={chapter.id} chapter={chapter} />;
}

type Mention = { at: number; query: string; top: number; left: number; index: number };

function ChapterEditor({ chapter }: { chapter: Chapter }) {
  const desk = useDesk();
  const prefs = usePrefs();
  const detail = desk.detail;
  const novelId = desk.novelId;
  const [title, setTitle] = useState(chapter.title);
  const [body, setBody] = useState(chapter.body);
  const [toolbar, setToolbar] = useState<{ top: number; left: number } | null>(null);
  const [mention, setMention] = useState<Mention | null>(null);
  const [versionOpen, setVersionOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const latest = useRef({ title: chapter.title, body: chapter.body });
  const dirty = useRef(false);
  const inflight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const save = useWriteState((s) => s.save);
  const savedAt = useWriteState((s) => s.savedAt);
  const setWrite = useWriteState((s) => s.set);
  const reloadTick = useWriteState((s) => s.reloadTick);
  const deferredBody = useDeferredValue(body);
  const words = useMemo(() => countWords(deferredBody), [deferredBody]);
  const volume = detail?.volumes.find((v) => v.id === chapter.volumeId);
  const streaming = useAssist((s) => s.job?.status === "streaming");

  /* ---------- 保存 ---------- */

  const persist = useCallback(async (): Promise<boolean> => {
    if (inflight.current) await inflight.current;
    if (!dirty.current) return true;
    dirty.current = false;
    const payload = { ...latest.current };
    setWrite({ save: "saving" });
    const run = (async () => {
      try {
        const res = await writeChapter({ data: { novelId, chapterId: chapter.id, title: payload.title.trim() || chapter.title || "未命名章节", body: payload.body } });
        if (!res.ok) {
          dirty.current = true;
          setWrite({ save: "error" });
          desk.fail(res.error);
          return false;
        }
        const saved = res.chapter;
        desk.patchDetail((d) => ({ ...d, chapters: d.chapters.map((c) => (c.id === saved.id ? saved : c)), days: res.days }));
        desk.noteToday(res.today);
        setWrite({ save: dirty.current ? "dirty" : "saved", savedAt: Date.now(), storedWords: saved.words });
        useWriteState.getState().bumpVersions();
        return true;
      } catch {
        dirty.current = true;
        setWrite({ save: "error" });
        return false;
      }
    })();
    inflight.current = run;
    const ok = await run;
    inflight.current = null;
    return ok;
  }, [chapter.id, chapter.title, desk, novelId, setWrite]);

  const schedule = useCallback(() => {
    dirty.current = true;
    setWrite({ save: "dirty" });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void persist(), AUTOSAVE_MS);
  }, [persist, setWrite]);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    return persist();
  }, [persist]);

  // 进入章节：重置状态栏
  useEffect(() => {
    setWrite({ save: "idle", storedWords: chapter.words, selectionWords: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在换章时
  }, [chapter.id]);

  // 离开章节 / 关闭窗口前保存
  useEffect(() => {
    const onHide = () => {
      if (dirty.current) void flush();
    };
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      document.removeEventListener("visibilitychange", onHide);
      window.clearTimeout(timer.current);
      if (dirty.current) void persist();
    };
  }, [flush, persist]);

  // 外部改了正文（恢复版本、代理落稿）且本地没有未保存的修改时，载入新内容
  useEffect(() => {
    if (dirty.current) return;
    if (chapter.body !== latest.current.body || chapter.title !== latest.current.title) {
      latest.current = { title: chapter.title, body: chapter.body };
      setTitle(chapter.title);
      setBody(chapter.body);
    }
  }, [chapter.body, chapter.title, reloadTick]);

  useEffect(() => {
    setWrite({ chapterWords: words });
  }, [words, setWrite]);

  /* ---------- 自适应高度与打字机滚动 ---------- */

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 4}px`;
  }, [body, prefs.size, prefs.leading, prefs.width, prefs.font]);

  const typewriter = useCallback(() => {
    const el = area.current;
    const box = scroller.current;
    if (!prefs.typewriter || !el || !box) return;
    const rect = caretRect(el, el.selectionEnd);
    const view = box.getBoundingClientRect();
    const target = view.top + view.height * 0.45;
    box.scrollTop += rect.top - target;
  }, [prefs.typewriter]);

  /* ---------- 对外能力 ---------- */

  useEffect(() => {
    desk.editor.current = {
      chapterId: chapter.id,
      selection: () => {
        const el = area.current;
        const value = latest.current.body;
        const start = el?.selectionStart ?? value.length;
        const end = el?.selectionEnd ?? value.length;
        return { start, end, text: value.slice(start, end), before: value.slice(0, start), after: value.slice(end) };
      },
      replace: (start, end, text) => {
        const el = area.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(start, end);
        // execCommand 保留撤销记录（Ctrl+Z 能撤回 AI 替换）
        const ok = typeof document.execCommand === "function" && document.execCommand("insertText", false, text);
        if (!ok) {
          el.setRangeText(text, start, end, "end");
          const next = el.value;
          latest.current.body = next;
          setBody(next);
          schedule();
        }
      },
      focus: () => area.current?.focus(),
      flush,
      text: () => latest.current.body,
    };
    return () => {
      if (desk.editor.current?.chapterId === chapter.id) desk.editor.current = null;
    };
  }, [chapter.id, desk.editor, flush, schedule]);

  /* ---------- 选区工具条 / @ 提及 ---------- */

  const updateSelection = useCallback(() => {
    const el = area.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const text = el.value.slice(s, e);
    setWrite({ selectionWords: text ? countWords(text) : 0 });
    if (e > s && text.trim().length >= 2) {
      const rect = caretRect(el, s);
      const top = Math.max(56, rect.top - 46);
      const left = Math.min(window.innerWidth - 360, Math.max(8, rect.left - 20));
      setToolbar({ top, left });
    } else {
      setToolbar(null);
    }
  }, [setWrite]);

  const mentionItems = useMemo(() => {
    if (!mention || !detail) return [];
    const q = mention.query.trim();
    const people = detail.characters
      .filter((c) => !q || c.name.includes(q) || c.aliases.includes(q))
      .map((c) => ({ key: `c:${c.id}`, name: c.name, hint: c.role || "人物", kind: "人物" }));
    const lore = detail.lore.filter((l) => !q || l.name.includes(q)).map((l) => ({ key: `l:${l.id}`, name: l.name, hint: l.summary.slice(0, 18), kind: "设定" }));
    return [...people, ...lore].slice(0, 8);
  }, [mention, detail]);

  const findMention = useCallback(() => {
    const el = area.current;
    if (!el || el.selectionStart !== el.selectionEnd) return setMention(null);
    const caret = el.selectionStart;
    const head = el.value.slice(Math.max(0, caret - 13), caret);
    const match = /[@＠]([^\s@＠，。！？、；：“”‘’（）《》,.!?;:()]{0,12})$/.exec(head);
    if (!match) return setMention(null);
    const at = caret - match[0].length;
    const rect = caretRect(el, at);
    setMention((prev) => ({ at, query: match[1], top: rect.top + rect.height, left: rect.left, index: prev?.at === at ? prev.index : 0 }));
  }, []);

  const pickMention = (name: string) => {
    const el = area.current;
    if (!el || !mention) return;
    const end = el.selectionStart;
    setMention(null);
    desk.editor.current?.replace(mention.at, end, name);
  };

  /* ---------- 键盘 ---------- */

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && mentionItems.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setMention({ ...mention, index: (mention.index + delta + mentionItems.length) % mentionItems.length });
        return;
      }
      if ((event.key === "Enter" || event.key === "Tab") && !event.nativeEvent.isComposing) {
        event.preventDefault();
        pickMention(mentionItems[mention.index]?.name ?? "");
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMention(null);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && !event.nativeEvent.isComposing && prefs.indent) {
      event.preventDefault();
      const el = event.currentTarget;
      desk.editor.current?.replace(el.selectionStart, el.selectionEnd, "\n\u3000\u3000");
      requestAnimationFrame(typewriter);
    }
  };

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void flush().then((ok) => {
          if (ok) setWrite({ save: "saved", savedAt: Date.now() });
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flush, setWrite]);

  const pickTool = (tool: AssistTool, style?: string) => {
    setToolbar(null);
    if (tool === "custom" && !useAssist.getState().options.instruction.trim()) {
      desk.setSide("assist");
      return;
    }
    void runAssist(desk, tool, style ? { style } : undefined);
  };

  const focus = desk.focus;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("flex h-11 shrink-0 items-center gap-2 border-b border-line px-3 transition-opacity", focus && "border-transparent opacity-0 hover:opacity-100 focus-within:opacity-100")}>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-faint">
          <span className="truncate">{detail?.novel.title}</span>
          <span>/</span>
          {volume ? (
            <>
              <span className="truncate">{volume.title}</span>
              <span>/</span>
            </>
          ) : null}
          <span className="truncate text-ink">{title || "未命名章节"}</span>
        </div>
        <SavePill state={save} savedAt={savedAt} onRetry={() => void flush()} />
        <IconButton label="保存为版本" size="sm" onClick={() => setVersionOpen(true)}>
          <BookmarkPlus className="size-4" />
        </IconButton>
        <IconButton label="导出本章" size="sm" onClick={() => void flush().then(() => desk.openExport({ kind: "chapter", id: chapter.id }))}>
          <Download className="size-4" />
        </IconButton>
        <IconButton label={focus ? "退出专注（Esc）" : "专注模式"} size="sm" active={focus} onClick={() => desk.setFocus(!focus)}>
          {focus ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </IconButton>
      </div>
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={() => {
          if (toolbar) setToolbar(null);
          if (mention) setMention(null);
        }}
      >
        <div className={cn("mx-auto px-6 pb-[40vh]", focus ? "pt-[12vh]" : "pt-10")}>
          <div className="manuscript-col">
            <input
              aria-label="章节标题"
              className="w-full border-0 bg-transparent font-serif text-[1.65em] font-semibold tracking-wide text-ink outline-none placeholder:text-faint"
              style={{ fontFamily: "var(--editor-font)", fontSize: `calc(var(--editor-size) * 1.6)` }}
              value={title}
              maxLength={80}
              placeholder="章节标题"
              onChange={(event) => {
                setTitle(event.target.value);
                latest.current.title = event.target.value;
                schedule();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  area.current?.focus();
                }
              }}
            />
            <div className="mt-2 mb-6 flex items-center gap-3 text-[12px] text-faint">
              <span className="tabular-nums">{formatCount(words)} 字</span>
              {chapter.status === "done" ? (
                <span className="flex items-center gap-1 text-ok">
                  <Check className="size-3" /> 已完成
                </span>
              ) : (
                <span>草稿</span>
              )}
              <span className="hidden sm:inline">输入 @ 可插入人物或设定</span>
            </div>
            <textarea
              ref={area}
              aria-label="正文"
              spellCheck={false}
              className={cn("manuscript block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:text-faint", streaming && "caret-accent")}
              placeholder={prefs.indent ? "\u3000\u3000从这里开始写。回车会自动空两格。" : "从这里开始写。"}
              value={body}
              onChange={(event) => {
                const next = event.target.value;
                latest.current.body = next;
                setBody(next);
                schedule();
                setToolbar(null);
                findMention();
                if (prefs.typewriter) requestAnimationFrame(typewriter);
              }}
              onFocus={(event) => {
                if (!event.currentTarget.value && prefs.indent) {
                  desk.editor.current?.replace(0, 0, "\u3000\u3000");
                }
              }}
              onKeyDown={onKeyDown}
              onKeyUp={(event) => {
                if (event.key.startsWith("Arrow") || event.key === "Shift" || event.key === "Home" || event.key === "End") {
                  updateSelection();
                  findMention();
                }
              }}
              onMouseUp={() => window.setTimeout(updateSelection, 0)}
              onSelect={() => {
                const el = area.current;
                if (el && el.selectionStart === el.selectionEnd) {
                  setToolbar(null);
                  setWrite({ selectionWords: 0 });
                }
              }}
              onBlur={() => {
                setToolbar(null);
                window.setTimeout(() => setMention(null), 120);
                if (dirty.current) void flush();
              }}
            />
          </div>
        </div>
      </div>
      {toolbar && !mention ? <SelectionToolbar top={toolbar.top} left={toolbar.left} onPick={pickTool} /> : null}
      {mention && mentionItems.length ? (
        <div className="pop fixed z-30 w-64 rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-pop)]" style={{ top: mention.top + 4, left: Math.min(mention.left, window.innerWidth - 270) }} onMouseDown={(e) => e.preventDefault()}>
          {mentionItems.map((item, i) => (
            <button
              key={item.key}
              type="button"
              className={cn("flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left", i === mention.index ? "bg-accent-soft" : "hover:bg-hover")}
              onClick={() => pickMention(item.name)}
            >
              <span className={cn("rounded px-1 text-[10px]", item.kind === "人物" ? "bg-accent text-accent-fg" : "bg-sunk text-mist")}>{item.kind}</span>
              <span className="truncate text-[13px] text-ink">{item.name}</span>
              <span className="ml-auto truncate text-[11px] text-faint">{item.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
      <SaveVersionDialog
        open={versionOpen}
        onOpenChange={setVersionOpen}
        onSave={async (label) => {
          await flush();
          const res = await call(desk, keepVersion({ data: { novelId, chapterId: chapter.id, label } }), { refresh: false });
          if (!res) return;
          useWriteState.getState().bumpVersions();
          desk.note(res.version ? "已存为版本" : "和上一个版本相同，没有重复保存");
        }}
      />
    </div>
  );
}

function SavePill({ state, savedAt, onRetry }: { state: string; savedAt: number; onRetry: () => void }) {
  const time = savedAt ? new Date(savedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
  if (state === "error") {
    return (
      <button type="button" onClick={onRetry} className="flex h-6 items-center gap-1 rounded-md bg-danger-soft px-2 text-[12px] text-danger">
        <CloudOff className="size-3.5" /> 保存失败，点此重试
      </button>
    );
  }
  return (
    <span className="flex h-6 items-center gap-1 rounded-md px-2 text-[12px] text-faint" aria-live="polite">
      {state === "saving" ? (
        <>
          <Loader2 className="size-3.5 animate-spin" /> 保存中
        </>
      ) : state === "dirty" ? (
        <>
          <span className="size-1.5 rounded-full bg-warn" /> 未保存
        </>
      ) : state === "saved" ? (
        <>
          <Check className="size-3.5 text-ok" /> 已保存 {time}
        </>
      ) : (
        <>
          <Check className="size-3.5" /> 已同步
        </>
      )}
    </span>
  );
}

function SaveVersionDialog({ open, onOpenChange, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; onSave: (label: string) => Promise<void> }) {
  const [label, setLabel] = useState("");
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="保存为版本"
      description="给当前正文拍一张快照，之后可以对比和恢复。自动保存也会定期留版本。"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              void onSave(label.trim()).then(() => setLabel(""));
            }}
          >
            保存版本
          </Button>
        </>
      }
    >
      <input className={fieldClass} autoFocus maxLength={40} placeholder="版本说明（可不填），例如：改结尾之前" value={label} onChange={(e) => setLabel(e.target.value)} />
    </Modal>
  );
}
